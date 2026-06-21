"""
test_risk_engine.py — Unit tests for Tripwire's risk rule evaluation logic.

All tests call _evaluate_rules() directly with a FakeStudent object.
No database connection is required — FakeStudent is a plain Python dataclass
that mirrors the fields on the Student ORM model.

Required cases (labelled a–f in the docstrings below):
  a. Safe student        — high GPA, good pace, full-time → empty list
  b. At-risk student     — low GPA, low pace, under full-time → multiple risks
  c. Zero credits        — new student with 0 attempted → no crash, no SAP/aid_risk
  d. GPA exactly at floor — buffer = 0 → urgent
  e. Exactly 12 credits  — at the full-time threshold, NOT below it → no enrollment_drop
  f. Scholarship floor   — school floor 2.0, scholarship requires 3.0, student at 2.8
                           → fires because max() picks the stricter requirement

Additional cases cover the graduated severity function, operator correctness,
source citations, school policy overrides, and the slug resolver.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

from app.models.risk_event import Severity
from app.services.risk_engine import (
    FEDERAL_DEFAULT_POLICY,
    SCHOOL_POLICIES,
    _evaluate_rules,
    _gpa_severity,
    _school_slug,
    _parse_partial_json,
)


# ---------------------------------------------------------------------------
# FakeStudent
# ---------------------------------------------------------------------------

@dataclass
class FakeStudent:
    """
    Plain-Python substitute for the Student SQLAlchemy model.

    Using a real ORM instance outside a session causes instrumentation errors.
    This dataclass has exactly the fields _evaluate_rules() reads, so the
    function can't tell the difference.

    Field notes:
      credits_completed — cumulative credits the student has passed
      credits_attempted — cumulative credits ever enrolled in (includes fails/withdrawals)
                          This is the correct SAP denominator (34 CFR § 668.34).
      credits_required  — total credits needed to graduate (NOT used for SAP)
    """
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    email: str = "student@example.edu"
    school_id: uuid.UUID = field(default_factory=uuid.uuid4)
    gpa: float | None = 3.5
    credits_completed: int | None = 90
    credits_attempted: int | None = 120   # SAP denominator
    credits_required: int | None = 120    # degree total — NOT the SAP denominator
    aid_package_json: dict[str, Any] | None = None
    degree_audit_json: dict[str, Any] | None = None
    major: str | None = "Computer Science"
    enrollment_year: int | None = 2022


def s(**kwargs) -> FakeStudent:
    """Convenience factory — override only the fields relevant to each test."""
    return FakeStudent(**kwargs)


# ---------------------------------------------------------------------------
# Required case (a) — safe student
# ---------------------------------------------------------------------------

def test_a_safe_student_returns_empty_list():
    """
    Required case (a): a clearly normal student should produce no risk events.

    Profile:
      GPA 3.5   — well above the 2.0 aid floor (buffer = 1.5, > 0.2 → safe)
      90 / 120  — 75% completion rate, above the 67% SAP threshold
      15 credits this semester — above the 12-credit full-time minimum
      No upcoming deadlines
    """
    student = s(
        gpa=3.5,
        credits_completed=90,
        credits_attempted=120,
        degree_audit_json={"credits_this_semester": 15},
    )
    results = _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)
    assert results == [], f"Expected no risks but got: {[r.risk_type for r in results]}"


# ---------------------------------------------------------------------------
# Required case (b) — at-risk student
# ---------------------------------------------------------------------------

def test_b_at_risk_student_fires_multiple_rules():
    """
    Required case (b): a student in clear distress triggers multiple rules.

    Profile:
      GPA 1.7   — below 2.0 probation floor → academic_probation (urgent)
      50 / 120  — 41.7% completion rate, well below 67% → satisfactory_academic_progress
      9 credits — below 12-credit full-time minimum → enrollment_drop
      Deadline in 2 days → deadline_miss
    """
    due_soon = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    student = s(
        gpa=1.7,
        credits_completed=50,
        credits_attempted=120,
        degree_audit_json={
            "credits_this_semester": 9,
            "deadlines": [{"name": "SAP Appeal", "date": due_soon}],
        },
    )
    results = _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)
    fired = {r.risk_type for r in results}

    assert len(fired) >= 3, f"Expected ≥3 distinct risk types, got: {fired}"
    assert "academic_probation" in fired
    assert "satisfactory_academic_progress" in fired
    assert "enrollment_drop" in fired
    assert "deadline_miss" in fired

    # academic_probation must be urgent (GPA < 2.0, buffer = -0.3)
    prob = next(r for r in results if r.risk_type == "academic_probation")
    assert prob.severity == Severity.urgent


# ---------------------------------------------------------------------------
# Required case (c) — zero credits (new student)
# ---------------------------------------------------------------------------

def test_c_zero_credits_does_not_crash():
    """
    Required case (c): a brand-new student with zero credits attempted must not crash.

    The SAP rule divides credits_completed / credits_attempted.
    When credits_attempted is 0 the guard (if ... and attempted:) short-circuits
    before the division, preventing ZeroDivisionError.

    Expected: no SAP or aid_risk events. enrollment_drop may legitimately fire
    (0 credits < 12), but that is acceptable.
    """
    student = s(
        gpa=3.8,
        credits_completed=0,
        credits_attempted=0,    # ← the dangerous value
        credits_required=0,
        degree_audit_json={"credits_this_semester": 0},
    )
    # Must not raise any exception
    results = _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)
    fired = {r.risk_type for r in results}

    assert "satisfactory_academic_progress" not in fired, \
        "SAP rule must not fire when credits_attempted == 0"
    assert "aid_risk" not in fired, \
        "aid_risk rule must not fire when credits_attempted == 0"


# ---------------------------------------------------------------------------
# Required case (d) — GPA exactly at the aid floor
# ---------------------------------------------------------------------------

def test_d_gpa_exactly_at_floor_is_urgent():
    """
    Required case (d): GPA equal to the floor is not safe — it must fire as urgent.

    buffer = round(2.0 - 2.0, 4) = 0.0
    The condition is buffer <= 0.0, so 0.0 satisfies it → Severity.urgent.

    This matters because a student at exactly 2.0 is one failing grade away
    from academic probation and cannot be treated as safe.
    """
    student = s(
        gpa=2.0,
        credits_completed=90,
        credits_attempted=120,
    )
    policy = {**FEDERAL_DEFAULT_POLICY, "aid_gpa_floor": 2.0}
    results = _evaluate_rules(student, policy)

    gpa_risks = [r for r in results if r.risk_type in ("gpa_drop", "academic_probation")]
    assert gpa_risks, "Expected a GPA risk when GPA == aid floor"
    assert gpa_risks[0].severity == Severity.urgent, \
        f"Expected urgent, got {gpa_risks[0].severity}"


# ---------------------------------------------------------------------------
# Required case (e) — exactly 12 credits this semester
# ---------------------------------------------------------------------------

def test_e_exactly_twelve_credits_no_enrollment_drop():
    """
    Required case (e): exactly 12 credits this semester must NOT fire enrollment_drop.

    12 is the full-time minimum. The rule uses strict less-than (<), not <=,
    so a student at exactly the threshold is still considered full-time.

    If this were <= it would penalise every student carrying the exact minimum,
    which is incorrect policy.
    """
    student = s(
        gpa=3.2,
        credits_completed=90,
        credits_attempted=120,
        degree_audit_json={"credits_this_semester": 12},
    )
    policy = {**FEDERAL_DEFAULT_POLICY, "full_time_credits": 12}
    results = _evaluate_rules(student, policy)
    fired = {r.risk_type for r in results}

    assert "enrollment_drop" not in fired, \
        "enrollment_drop must NOT fire when credits_this_semester == full_time_credits"


# ---------------------------------------------------------------------------
# Required case (f) — scholarship GPA floor overrides institutional floor
# ---------------------------------------------------------------------------

def test_f_scholarship_floor_stricter_than_institutional():
    """
    Required case (f): when a student's aid package specifies a higher GPA
    requirement than the school's institutional floor, the stricter value applies.

    Setup:
      school aid_gpa_floor = 2.0  (institutional minimum)
      scholarship gpa_requirement = 3.0  (merit scholarship condition)
      student GPA = 2.8

    Without the max() logic, 2.8 > 2.0 → no risk fires.
    With the max() logic, effective_floor = max(2.0, 3.0) = 3.0,
    buffer = round(2.8 - 3.0, 4) = -0.2 → urgent.

    The student is safe for institutional aid but is losing their scholarship.
    Tripwire must catch this because it's the most common blindspot.
    """
    student = s(
        gpa=2.8,
        credits_completed=90,
        credits_attempted=120,
        aid_package_json={"gpa_requirement": 3.0},   # scholarship requirement
    )
    policy = {**FEDERAL_DEFAULT_POLICY, "aid_gpa_floor": 2.0}
    results = _evaluate_rules(student, policy)

    gpa_risks = [r for r in results if r.risk_type in ("gpa_drop", "academic_probation")]
    assert gpa_risks, \
        "Expected a GPA risk: student at 2.8 is below the 3.0 scholarship floor"

    risk = gpa_risks[0]
    assert risk.severity == Severity.urgent, \
        f"buffer = -0.2, expected urgent, got {risk.severity}"
    assert risk.context["floor"] == 3.0, \
        f"effective_floor should be 3.0 (scholarship), got {risk.context['floor']}"


# ---------------------------------------------------------------------------
# None GPA handling
# ---------------------------------------------------------------------------

def test_none_gpa_does_not_crash_or_fire_gpa_rules():
    """
    A student whose GPA is NULL in the database (gpa=None) must not raise a
    TypeError from any mathematical comparison. The GPA-dependent rules
    (gpa_drop, academic_probation, aid_risk) must all be silently skipped.
    Other rules (SAP, enrollment_drop) may still fire independently.
    """
    student = s(
        gpa=None,
        credits_completed=50,
        credits_attempted=120,
        degree_audit_json={"credits_this_semester": 9},
    )
    results = _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)
    fired = {r.risk_type for r in results}

    assert "gpa_drop" not in fired, "gpa_drop must not fire when gpa is None"
    assert "academic_probation" not in fired, "academic_probation must not fire when gpa is None"
    assert "aid_risk" not in fired, "aid_risk must not fire when gpa is None"


# ---------------------------------------------------------------------------
# Graduated GPA severity (_gpa_severity unit tests)
# ---------------------------------------------------------------------------

def test_gpa_severity_below_floor_is_urgent():
    """GPA below the floor → buffer < 0 → urgent."""
    assert _gpa_severity(1.9, 2.0) == Severity.urgent


def test_gpa_severity_exactly_at_floor_is_urgent():
    """GPA == floor → buffer = 0.0 → urgent (at the line is not safe)."""
    assert _gpa_severity(2.0, 2.0) == Severity.urgent


def test_gpa_severity_within_point_1_is_high():
    """0 < buffer <= 0.1 → high."""
    assert _gpa_severity(2.05, 2.0) == Severity.high
    # 2.1 - 2.0 = 0.10000000000000009 in raw float; round() to 4dp gives 0.1 → high
    assert _gpa_severity(2.1, 2.0) == Severity.high


def test_gpa_severity_within_point_2_is_warn():
    """0.1 < buffer <= 0.2 → warn."""
    assert _gpa_severity(2.15, 2.0) == Severity.warn
    # 2.2 - 2.0 = 0.20000000000000018 in raw float; round() to 4dp gives 0.2 → warn
    assert _gpa_severity(2.2, 2.0) == Severity.warn


def test_gpa_severity_above_point_2_is_safe():
    """buffer > 0.2 → None (rule does not fire)."""
    assert _gpa_severity(2.21, 2.0) is None
    assert _gpa_severity(3.5, 2.0) is None


# ---------------------------------------------------------------------------
# SAP completion rate — denominator correctness
# ---------------------------------------------------------------------------

def test_sap_uses_credits_attempted_not_credits_required():
    """
    The SAP denominator must be credits_attempted, not credits_required.

    Counter-example showing why it matters:
      Student attempted 60 credits, completed 36 (60% pace → SAP violation).
      Their degree requires 120 credits total.

      Wrong calculation: 36 / 120 = 30% (fires, but for the wrong reason)
      Right calculation: 36 / 60  = 60% (fires correctly)

    Both fire here, but the context dict must report credits_attempted=60, not 120.
    """
    student = s(
        gpa=3.5,
        credits_completed=36,
        credits_attempted=60,   # only attempted 60 so far
        credits_required=120,   # degree total — irrelevant to SAP rate
    )
    results = _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)
    sap = next((r for r in results if r.risk_type == "satisfactory_academic_progress"), None)

    assert sap is not None, "SAP should fire: 36/60 = 60% < 67%"
    assert sap.context["credits_attempted"] == 60, \
        f"SAP must report credits_attempted=60, got {sap.context['credits_attempted']}"
    assert sap.context["completion_rate"] == 0.6, \
        f"completion rate should be 0.6, got {sap.context['completion_rate']}"


def test_sap_fires_below_67_percent():
    """50/120 = 41.7% — below the 67% federal floor → SAP fires."""
    student = s(credits_completed=50, credits_attempted=120)
    fired = {r.risk_type for r in _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)}
    assert "satisfactory_academic_progress" in fired


def test_sap_does_not_fire_at_or_above_67_percent():
    """
    82/120 = 68.3% — above 67% → SAP does not fire.
    (80/120 = 66.7% which is below threshold, so use 82, not 80.)
    """
    student = s(credits_completed=82, credits_attempted=120)
    fired = {r.risk_type for r in _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)}
    assert "satisfactory_academic_progress" not in fired


def test_sap_skipped_when_credits_attempted_is_none():
    """credits_attempted=None → guard skips rule, no crash."""
    student = s(credits_completed=50, credits_attempted=None)
    fired = {r.risk_type for r in _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)}
    assert "satisfactory_academic_progress" not in fired


# ---------------------------------------------------------------------------
# Aid risk
# ---------------------------------------------------------------------------

def test_aid_risk_fires_when_gpa_and_pace_both_low():
    """GPA below aid floor AND completion rate below SAP → aid_risk fires."""
    student = s(
        gpa=1.8,
        credits_completed=50,
        credits_attempted=120,
        aid_package_json={"gpa_requirement": 2.0},
    )
    fired = {r.risk_type for r in _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)}
    assert "aid_risk" in fired


def test_aid_risk_does_not_fire_when_pace_ok():
    """GPA low but completion rate = 75% (above 67%) → aid_risk does not fire."""
    student = s(
        gpa=1.8,
        credits_completed=90,
        credits_attempted=120,
        aid_package_json={"gpa_requirement": 2.0},
    )
    fired = {r.risk_type for r in _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)}
    assert "aid_risk" not in fired


# ---------------------------------------------------------------------------
# Enrollment drop
# ---------------------------------------------------------------------------

def test_enrollment_drop_fires_below_12():
    """11 credits < 12-credit full-time minimum → enrollment_drop fires."""
    student = s(
        credits_completed=90,
        credits_attempted=120,
        degree_audit_json={"credits_this_semester": 11},
    )
    fired = {r.risk_type for r in _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)}
    assert "enrollment_drop" in fired


def test_enrollment_drop_not_fire_at_12():
    """12 credits == full-time minimum → enrollment_drop must NOT fire (strict <)."""
    student = s(
        credits_completed=90,
        credits_attempted=120,
        degree_audit_json={"credits_this_semester": 12},
    )
    fired = {r.risk_type for r in _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)}
    assert "enrollment_drop" not in fired


def test_enrollment_drop_not_fire_when_field_absent():
    """If credits_this_semester is not in degree_audit_json, rule is silently skipped."""
    student = s(
        credits_completed=90,
        credits_attempted=120,
        degree_audit_json={},   # key absent
    )
    fired = {r.risk_type for r in _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)}
    assert "enrollment_drop" not in fired


# ---------------------------------------------------------------------------
# Source citations — every risk context must carry a 'source' field
# ---------------------------------------------------------------------------

def test_every_fired_risk_has_a_source_field():
    """
    Every RuleResult.context must contain a non-empty 'source' key.
    This is what judges and advisors see when they ask "where does this number come from?"
    """
    due_soon = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    student = s(
        gpa=1.8,
        credits_completed=50,
        credits_attempted=120,
        degree_audit_json={
            "credits_this_semester": 9,
            "deadlines": [{"name": "Appeal deadline", "date": due_soon}],
        },
    )
    results = _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)
    assert results, "Need at least one fired rule to test source fields"

    for rule in results:
        assert "source" in rule.context, \
            f"risk_type='{rule.risk_type}' missing 'source' in context"
        assert rule.context["source"], \
            f"risk_type='{rule.risk_type}' has empty 'source'"


# ---------------------------------------------------------------------------
# School policy structure
# ---------------------------------------------------------------------------

def test_all_four_schools_present_in_policy_dict():
    """All four schools in the project brief must have a policy entry."""
    assert {"berkeley", "penn", "case_western", "unr"}.issubset(SCHOOL_POLICIES)


def test_every_policy_has_required_fields():
    """Every policy dict must have the four fields _evaluate_rules() reads."""
    required = {"aid_gpa_floor", "sap_completion_rate", "full_time_credits", "source"}
    for school, policy in SCHOOL_POLICIES.items():
        missing = required - set(policy)
        assert not missing, f"'{school}' policy missing fields: {missing}"


def test_school_policy_overrides_federal_default():
    """
    Passing a stricter school policy causes rules to fire for students who
    would be safe under federal defaults alone.

    A student at 70% pace (84/120) is safe under the 67% federal floor,
    but at-risk if the school requires 75%.
    """
    strict_policy = {**SCHOOL_POLICIES["unr"], "sap_completion_rate": 0.75}
    student = s(credits_completed=84, credits_attempted=120)

    safe_under_federal = {
        r.risk_type for r in _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)
    }
    at_risk_under_school = {
        r.risk_type for r in _evaluate_rules(student, strict_policy)
    }

    assert "satisfactory_academic_progress" not in safe_under_federal
    assert "satisfactory_academic_progress" in at_risk_under_school


def test_school_slug_maps_display_names():
    """_school_slug must resolve all supported display-name variants."""
    assert _school_slug("UC Berkeley") == "berkeley"
    assert _school_slug("University of California, Berkeley") == "berkeley"
    assert _school_slug("University of Pennsylvania") == "penn"
    assert _school_slug("Case Western Reserve University") == "case_western"
    assert _school_slug("University of Nevada, Reno") == "unr"
    assert _school_slug("unknown school") == ""
    assert _school_slug(None) == ""


def test_school_slug_is_robust_to_casing_and_whitespace():
    """
    _school_slug normalises via .lower().strip(), so it must resolve correctly
    regardless of leading/trailing whitespace or letter casing in the input.
    """
    assert _school_slug("uc berkeley") == "berkeley"
    assert _school_slug("UC BERKELEY") == "berkeley"
    assert _school_slug("  UC Berkeley  ") == "berkeley"
    assert _school_slug("  university of pennsylvania  ") == "penn"
    assert _school_slug("UNIVERSITY OF NEVADA, RENO") == "unr"
    assert _school_slug("Case Western Reserve University".upper()) == "case_western"


def test_unknown_school_slug_falls_back_to_federal_policy():
    """
    When _school_slug returns an unrecognised key, the SCHOOL_POLICIES.get()
    call in scan_student must return FEDERAL_DEFAULT_POLICY rather than raising
    a KeyError. This test exercises the full lookup chain: slug resolver →
    dict lookup → fallback → _evaluate_rules receives a valid policy dict.
    """
    unknown_slug = _school_slug("Miskatonic University")
    assert unknown_slug == "", f"Expected empty slug, got {unknown_slug!r}"

    policy = SCHOOL_POLICIES.get(unknown_slug, FEDERAL_DEFAULT_POLICY)
    assert policy is FEDERAL_DEFAULT_POLICY, \
        "Unknown slug must resolve to FEDERAL_DEFAULT_POLICY, not raise KeyError"

    # Confirm _evaluate_rules runs cleanly with the fallback policy
    student = s(gpa=3.5, credits_completed=90, credits_attempted=120)
    results = _evaluate_rules(student, policy)
    assert isinstance(results, list)


# ---------------------------------------------------------------------------
# Deadline source_url propagation
# ---------------------------------------------------------------------------

def test_deadline_miss_source_uses_source_url():
    """
    When a deadline entry has a source_url, the fired deadline_miss result's
    context["source"] must equal that URL, not the placeholder string.
    """
    due_soon = (datetime.now(timezone.utc) + timedelta(days=5)).date().isoformat()
    source_url = "https://example.edu/test-deadline"
    student = s(
        gpa=3.5,
        credits_completed=90,
        credits_attempted=120,
        degree_audit_json={
            "deadlines": [
                {"name": "Test Deadline", "date": due_soon, "source_url": source_url}
            ]
        },
    )
    results = _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)
    deadline_results = [r for r in results if r.risk_type == "deadline_miss"]

    assert deadline_results, "deadline_miss should fire for a deadline 5 days away"
    assert deadline_results[0].context["source"] == source_url, (
        f"Expected source={source_url!r}, got {deadline_results[0].context['source']!r}"
    )


def test_deadline_miss_source_fallback_when_no_source_url():
    """When source_url is absent, context['source'] falls back to the placeholder string."""
    due_soon = (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat()
    student = s(
        gpa=3.5,
        credits_completed=90,
        credits_attempted=120,
        degree_audit_json={
            "deadlines": [{"name": "No-URL Deadline", "date": due_soon}]
        },
    )
    results = _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)
    deadline_results = [r for r in results if r.risk_type == "deadline_miss"]

    assert deadline_results, "deadline_miss should fire for a deadline 3 days away"
    assert deadline_results[0].context["source"] == "Student degree audit / academic calendar"


def test_deadline_miss_fires_with_named_campus_timezone():
    """
    A deadline entry with a 'timezone' field must be interpreted in that
    timezone rather than blindly stamped as UTC. The rule must still fire
    when the deadline is within 7 days in the named timezone.
    """
    due_date = (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat()
    student = s(
        gpa=3.5,
        credits_completed=90,
        credits_attempted=120,
        degree_audit_json={
            "deadlines": [
                {
                    "name": "Berkeley Registration Deadline",
                    "date": due_date,
                    "timezone": "America/Los_Angeles",
                    "source_url": "https://financialaid.berkeley.edu/apply-now/apply-for-aid/fafsa-completion-overview/",
                }
            ]
        },
    )
    results = _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)
    fired = {r.risk_type for r in results}
    assert "deadline_miss" in fired, \
        "deadline_miss must fire for a deadline 3 days away in the campus timezone"


def test_deadline_miss_invalid_timezone_falls_back_to_utc():
    """
    An unrecognised timezone string must not crash the engine.
    The invalid tz is silently replaced with UTC and the deadline still fires.
    """
    due_date = (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat()
    student = s(
        gpa=3.5,
        credits_completed=90,
        credits_attempted=120,
        degree_audit_json={
            "deadlines": [
                {"name": "Test Deadline", "date": due_date, "timezone": "Not/AReal_Zone"}
            ]
        },
    )
    results = _evaluate_rules(student, FEDERAL_DEFAULT_POLICY)
    fired = {r.risk_type for r in results}
    assert "deadline_miss" in fired, \
        "deadline_miss must still fire when timezone is invalid (UTC fallback)"


def test_parse_partial_json_handles_truncated_response():
    """Verify that _parse_partial_json successfully parses a truncated JSON string."""
    truncated = (
        '{ "title": "GPA Near Financial Aid Minimum — Act Before You Fall Below 2.0", '
        '"description": "Your cumulative GPA of 2.12 is only 0.12 points above the federal floor.", '
        '"urgency": "warn", '
        '"actions": [ '
        '{ "title": "Review SAP Policy Online", "description": "Log in to portal.", "estimated_minutes": 2 }, '
        '{ "title": "Explore Tutoring", "description": "Enroll in tutoring.", "url": "https://www.you'
    )
    result = _parse_partial_json(truncated, "aid_risk")
    assert result["title"] == "GPA Near Financial Aid Minimum — Act Before You Fall Below 2.0"
    assert result["description"] == "Your cumulative GPA of 2.12 is only 0.12 points above the federal floor."
    assert result["urgency"] == "warn"
    assert len(result["actions"]) == 1
    assert result["actions"][0]["title"] == "Review SAP Policy Online"

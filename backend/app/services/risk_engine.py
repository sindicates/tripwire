"""
risk_engine.py — Tripwire's core prediction layer.

Architecture: Sense → Predict → Retrieve → Act
  1. _evaluate_rules()  — pure, deterministic rule evaluation against a student snapshot
  2. RiskEngine.scan_student() — loads student from DB, calls rules, enforces cooldowns,
     calls Claude (via RAGService) only when a rule fires, persists RiskEvent rows
  3. RiskEngine.scan_all() — iterates every student; called nightly by Celery beat

Design principle: every threshold is cited. The 'source' field on every risk dict tells
judges, advisors, and the student exactly which policy document the number came from.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.risk_event import RiskEvent, Severity
from app.models.student import Student
from app.services.rag import RAGService

CLAUDE_MODEL = "claude-sonnet-4-6"


def _anthropic_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


# ---------------------------------------------------------------------------
# School policy registry
#
# Each entry defines the thresholds Tripwire enforces for that institution.
# Values marked "# TODO" are placeholders to be replaced with numbers
# researched directly from each school's financial aid / registrar websites.
#
# Fields:
#   aid_gpa_floor       — minimum cumulative GPA required to keep financial aid
#   sap_completion_rate — minimum ratio of credits earned / credits attempted
#                         (Satisfactory Academic Progress, federal floor is 0.67)
#   full_time_credits   — minimum credits per semester to be classified full-time
#                         (affects aid eligibility and enrollment status)
#   source              — human-readable citation shown in every risk card
# ---------------------------------------------------------------------------

SCHOOL_POLICIES: dict[str, dict[str, Any]] = {
    # University of California, Berkeley
    # Source: UC Berkeley Financial Aid & Scholarships SAP Policy
    "berkeley": {
        "aid_gpa_floor": 2.0,
        "sap_completion_rate": 0.67,
        "full_time_credits": 12,
        "source": "UC Berkeley Financial Aid & Scholarships — SAP Policy",
    },
    # University of Pennsylvania
    # Source: Penn Student Financial Services SAP Policy
    "penn": {
        "aid_gpa_floor": 2.0,
        "sap_completion_rate": 0.67,
        "full_time_credits": 12,
        "source": "Penn Student Financial Services — Satisfactory Academic Progress",
    },
    # Case Western Reserve University
    # Source: CWRU Student Financial Aid SAP Policy
    "case_western": {
        "aid_gpa_floor": 2.0,
        "sap_completion_rate": 0.67,
        "full_time_credits": 12,
        "source": "CWRU Student Financial Aid — SAP Policy",
    },
    # University of Nevada, Reno
    # Source: UNR Financial Aid Office SAP Policy
    "unr": {
        "aid_gpa_floor": 2.0,
        "sap_completion_rate": 0.67,
        "full_time_credits": 12,
        "source": "UNR Financial Aid Office — Satisfactory Academic Progress Policy",
    },
}

# Fallback used when the student's school is not in SCHOOL_POLICIES.
# These are the federal minimums mandated by the Department of Education
# for any institution receiving Title IV funding.
FEDERAL_DEFAULT_POLICY: dict[str, Any] = {
    "aid_gpa_floor": 2.0,
    "sap_completion_rate": 0.67,
    "full_time_credits": 12,
    "source": "Federal Title IV SAP Requirement (34 CFR § 668.34)",
}

# How many days must pass before the same risk type can fire again for one student.
COOLDOWNS: dict[str, int] = {
    "gpa_drop": 30,
    "credit_deficit": 14,
    "aid_risk": 30,
    "deadline_miss": 1,
    "academic_probation": 30,
    "satisfactory_academic_progress": 14,
    "enrollment_drop": 7,
}


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class RuleResult:
    """One fired risk rule. context always includes a 'source' key."""
    risk_type: str
    severity: Severity
    context: dict[str, Any]


# ---------------------------------------------------------------------------
# Graduated GPA severity
#
# Rather than a binary flag, we compute how far the student's GPA is from
# the aid floor and assign severity based on proximity. This lets us warn
# students before they actually cross the line.
#
# buffer = student_gpa - aid_floor
#   <= 0.0  → already breached          → urgent
#   <= 0.1  → within 0.1 GPA points     → high
#   <= 0.2  → within 0.2 GPA points     → warn
#   >  0.2  → safe margin               → None (rule does not fire)
# ---------------------------------------------------------------------------

def _gpa_severity(gpa: float, floor: float) -> Severity | None:
    """Return a severity level based on how close gpa is to floor, or None if safe.

    GPA values are naturally 1–2 decimal places, so we round to 4 places to
    avoid floating-point noise (e.g. 2.1 - 2.0 = 0.10000000000000009 in Python).
    """
    buffer = round(gpa - floor, 4)
    if buffer <= 0.0:
        return Severity.urgent
    if buffer <= 0.1:
        return Severity.high
    if buffer <= 0.2:
        return Severity.warn
    return None


# ---------------------------------------------------------------------------
# Rule evaluation (pure function — no DB, no API calls)
#
# Takes a student object and a school policy dict (defaults to federal minimums).
# Returns a list of RuleResult for every rule that fired.
# ---------------------------------------------------------------------------

def _evaluate_rules(
    student: Any,
    policy: dict[str, Any] | None = None,
    now: datetime | None = None,
) -> list[RuleResult]:
    """
    Evaluate all risk rules against one student snapshot.

    Args:
        student: Student ORM object or any object with the same fields.
        policy:  School-specific thresholds from SCHOOL_POLICIES.
                 Falls back to FEDERAL_DEFAULT_POLICY if None.
        now:     Reference timestamp for deadline proximity checks.
                 Defaults to datetime.now(timezone.utc). Pass an explicit
                 value in tests or demo scripts to simulate a fixed point in time.

    Returns:
        List of RuleResult for every rule that fired. Empty list = no risks.
    """
    if policy is None:
        policy = FEDERAL_DEFAULT_POLICY

    results: list[RuleResult] = []

    gpa = student.gpa
    completed = student.credits_completed   # cumulative credits earned (passed)
    attempted = student.credits_attempted   # cumulative credits enrolled in (passed + failed + withdrawn)
    required = student.credits_required     # total credits needed for degree (NOT the SAP denominator)

    aid_floor: float = policy["aid_gpa_floor"]
    sap_threshold: float = policy["sap_completion_rate"]
    full_time_min: int = policy["full_time_credits"]
    policy_source: str = policy["source"]

    aid = student.aid_package_json or {}

    # ------------------------------------------------------------------
    # Rule 1: GPA proximity to aid floor (graduated severity)
    #
    # We use the aid floor from the school policy as the reference point.
    # The student's own aid package may specify a higher GPA requirement —
    # if so, we use that instead (stricter threshold wins).
    # ------------------------------------------------------------------
    if gpa is not None:
        # An individual aid package (e.g. a merit scholarship) may require
        # a higher GPA than the school's institutional floor.
        effective_floor = max(aid_floor, aid.get("gpa_requirement", 0.0))
        severity = _gpa_severity(gpa, effective_floor)

        if severity is not None:
            risk_type = "academic_probation" if gpa < 2.0 else "gpa_drop"
            results.append(
                RuleResult(
                    risk_type=risk_type,
                    severity=severity,
                    context={
                        "gpa": gpa,
                        "floor": effective_floor,
                        "buffer": round(gpa - effective_floor, 3),
                        "source": policy_source,
                    },
                )
            )

    # ------------------------------------------------------------------
    # Rule 2: SAP completion rate
    #
    # Federal SAP (34 CFR § 668.34) requires students to have completed
    # at least 67% of ALL credits they have ever attempted — including
    # failed and withdrawn courses. The denominator is credits_attempted,
    # NOT credits_required (the degree total).
    #
    # Example: a student who attempted 60 credits but only passed 36
    # has a 60% completion rate and is below the 67% federal floor,
    # even if they need 120 credits for their degree.
    #
    # Guard: skip if attempted is 0 or None — a brand-new student who
    # has never enrolled in a course cannot be in SAP violation.
    # ------------------------------------------------------------------
    if completed is not None and attempted:  # falsy guard covers 0 and None
        completion_rate = completed / attempted
        if completion_rate < sap_threshold:
            results.append(
                RuleResult(
                    risk_type="satisfactory_academic_progress",
                    severity=Severity.warn,
                    context={
                        "credits_completed": completed,
                        "credits_attempted": attempted,
                        "completion_rate": round(completion_rate, 3),
                        "threshold": sap_threshold,
                        "source": policy_source,
                    },
                )
            )

    # ------------------------------------------------------------------
    # Rule 3: Aid risk — GPA AND pace both below thresholds
    #
    # This is the most dangerous combination: a student who is both
    # academically struggling and falling behind on credit pace is at
    # immediate risk of losing federal and institutional aid.
    # ------------------------------------------------------------------
    if gpa is not None and completed is not None and attempted:
        completion_rate = completed / attempted
        aid_gpa_req: float = aid.get("gpa_requirement", aid_floor)
        if gpa < aid_gpa_req and completion_rate < sap_threshold:
            results.append(
                RuleResult(
                    risk_type="aid_risk",
                    severity=Severity.urgent,
                    context={
                        "gpa": gpa,
                        "aid_gpa_floor": aid_gpa_req,
                        "completion_rate": round(completion_rate, 3),
                        "sap_threshold": sap_threshold,
                        "source": policy_source,
                    },
                )
            )

    # ------------------------------------------------------------------
    # Rule 4: Enrollment drop
    #
    # If the student's current-semester credit load falls below the
    # school's full-time threshold, they may lose aid that requires
    # full-time enrollment. We read this from degree_audit_json so it
    # doesn't require a model change.
    #
    # Guard: only fires if credits_this_semester is explicitly recorded
    # AND is strictly less than the minimum (exactly at minimum is OK).
    # ------------------------------------------------------------------
    degree_audit = student.degree_audit_json or {}
    credits_this_semester: int | None = degree_audit.get("credits_this_semester")
    if credits_this_semester is not None and credits_this_semester < full_time_min:
        results.append(
            RuleResult(
                risk_type="enrollment_drop",
                severity=Severity.warn,
                context={
                    "credits_this_semester": credits_this_semester,
                    "full_time_minimum": full_time_min,
                    "source": policy_source,
                },
            )
        )

    # ------------------------------------------------------------------
    # Rule 5: Deadline proximity
    #
    # Fires when a deadline stored in degree_audit_json is within 7 days.
    # Source is the audit itself rather than a school policy document.
    # ------------------------------------------------------------------
    deadlines: list[dict] = degree_audit.get("deadlines", [])
    now = now or datetime.now(timezone.utc)
    for dl in deadlines:
        try:
            due = datetime.fromisoformat(dl["date"]).replace(tzinfo=timezone.utc)
        except (KeyError, ValueError):
            continue
        days_until = (due - now).days
        if 0 <= days_until < 7:
            results.append(
                RuleResult(
                    risk_type="deadline_miss",
                    severity=Severity.warn,
                    context={
                        "deadline_name": dl.get("name", "Unknown deadline"),
                        "due_date": dl["date"],
                        "days_until": days_until,
                        "source": dl.get("source_url", "Student degree audit / academic calendar"),
                    },
                )
            )

    return results


# ---------------------------------------------------------------------------
# RiskEngine — orchestrates DB access, cooldowns, Claude calls, persistence
# ---------------------------------------------------------------------------

class RiskEngine:
    """Loads students from DB, evaluates rules, and persists RiskEvent rows."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.rag = RAGService()

    async def _cooldown_ok(self, student_id: uuid.UUID, risk_type: str) -> bool:
        """Return True if no unresolved event of this type was created recently."""
        days = COOLDOWNS.get(risk_type, 14)
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        result = await self.db.execute(
            select(RiskEvent)
            .where(
                RiskEvent.student_id == student_id,
                RiskEvent.risk_type == risk_type,
                RiskEvent.predicted_at >= cutoff,
                RiskEvent.resolved_at.is_(None),
            )
            .limit(1)
        )
        return result.scalar_one_or_none() is None

    async def build_action_packet(
        self,
        risk_type: str,
        context: dict[str, Any],
        student: Student,
    ) -> dict[str, Any]:
        """
        Call Claude with retrieved policy chunks to produce a structured action packet.

        Claude is called ONLY after a rule has already fired — never speculatively.
        The action packet tells the student exactly what form to file, where, and by when.
        """
        student_snapshot = {
            "gpa": student.gpa,
            "credits_completed": student.credits_completed,
            "credits_required": student.credits_required,
            "major": student.major,
            "aid_package": student.aid_package_json,
        }

        query = _risk_type_to_query(risk_type, context)
        chunks = await self.rag.search(query, student.school_id, self.db, top_k=5)

        chunk_text = "\n\n".join(
            f"[Source: {c.get('page_url') or 'unknown'} | {c.get('section_heading') or ''}]\n{c['chunk_text']}"
            for c in chunks
        ) or "No policy documents available."

        system = (
            "You are Tripwire, an academic risk advisor. "
            "Using the policy documents and student data provided, produce a JSON action packet. "
            "Return ONLY valid JSON with this exact shape:\n"
            '{"title": "...", "description": "...", "urgency": "info|warn|high|urgent", '
            '"actions": [{"label": "...", "url": "...", "deadline": "YYYY-MM-DD or null"}], '
            '"citations": ["url1", "url2"]}'
        )

        prompt = (
            f"Risk type: {risk_type}\n"
            f"Risk context: {json.dumps(context)}\n"
            f"Student snapshot: {json.dumps(student_snapshot)}\n\n"
            f"Policy documents:\n{chunk_text}"
        )

        try:
            message = await _anthropic_client().messages.create(
                model=CLAUDE_MODEL,
                max_tokens=1024,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception:
            return {
                "title": f"Risk detected: {risk_type}",
                "description": "Action plan unavailable — AI service unreachable.",
                "urgency": context.get("severity", "warn"),
                "actions": [],
                "citations": [],
            }

        raw = message.content[0].text.strip()
        # Strip markdown code fences if Claude wrapped the JSON
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {
                "title": f"Risk detected: {risk_type}",
                "description": raw,
                "urgency": "warn",
                "actions": [],
                "citations": [],
            }

    async def scan_student(self, student_id: uuid.UUID) -> list[RiskEvent]:
        """Evaluate all rules for one student and persist any new risk events."""
        from sqlalchemy.orm import selectinload
        result = await self.db.execute(
            select(Student)
            .options(selectinload(Student.school))
            .where(Student.id == student_id)
        )
        student = result.scalar_one_or_none()
        if student is None:
            return []

        school_name = student.school.name if student.school else None
        policy = SCHOOL_POLICIES.get(_school_slug(school_name), FEDERAL_DEFAULT_POLICY)

        fired_events: list[RiskEvent] = []
        rule_results = _evaluate_rules(student, policy)

        for rule in rule_results:
            if not await self._cooldown_ok(student.id, rule.risk_type):
                continue

            action_packet = await self.build_action_packet(
                rule.risk_type, rule.context, student
            )

            event = RiskEvent(
                student_id=student.id,
                risk_type=rule.risk_type,
                severity=rule.severity,
                context_json=rule.context,
                action_packet_json=action_packet,
            )
            self.db.add(event)
            fired_events.append(event)

        await self.db.commit()
        for event in fired_events:
            await self.db.refresh(event)
        return fired_events

    async def scan_all(self) -> None:
        """Run scan_student for every student in the database."""
        result = await self.db.execute(select(Student))
        students = result.scalars().all()
        for student in students:
            await self.scan_student(student.id)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _school_slug(name: str | None) -> str:
    """
    Map a school display name to its SCHOOL_POLICIES key.

    Keeps the policy dict keys short and code-friendly while allowing the
    School.name column to hold the full institutional name.
    """
    if not name:
        return ""
    _SLUG_MAP = {
        "uc berkeley": "berkeley",
        "university of california, berkeley": "berkeley",
        "university of pennsylvania": "penn",
        "penn": "penn",
        "case western reserve university": "case_western",
        "case western": "case_western",
        "university of nevada, reno": "unr",
        "unr": "unr",
    }
    return _SLUG_MAP.get(name.lower().strip(), "")


def _risk_type_to_query(risk_type: str, context: dict[str, Any]) -> str:
    """Map a risk type to the RAG search query used to retrieve relevant policy chunks."""
    queries = {
        "gpa_drop": "GPA retention requirements financial aid eligibility academic standing",
        "academic_probation": "academic probation requirements reinstatement appeal process GPA",
        "satisfactory_academic_progress": "satisfactory academic progress SAP policy pace completion rate",
        "aid_risk": "financial aid eligibility GPA requirement SAP appeal process",
        "enrollment_drop": "full-time enrollment requirement financial aid credit load",
        "deadline_miss": f"deadline {context.get('deadline_name', '')} appeal form submission",
    }
    return queries.get(risk_type, risk_type)

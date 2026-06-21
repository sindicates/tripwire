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
import logging
import traceback
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)

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


_KNOWLEDGE_SYSTEM = (
    "You are an expert academic advisor with deep knowledge of US university financial aid and "
    "academic standing policies. Generate a specific, actionable response packet for a student "
    "facing an academic risk. Use your training knowledge about the specific school's financial "
    "aid office, academic policies, and standard processes for this risk type. Include exact "
    "office names, typical form names, and standard contact channels for this institution. "
    "If policy context documents are provided, prioritize that information. "
    "Every action description starts with a verb: Email, Submit, Download, Call, Log in to, Book. "
    "Output ONLY valid JSON — no prose before or after."
)


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
        """Knowledge-grounded action packet: single Claude call with any available pgvector chunks."""
        try:
            return await self._knowledge_action_packet(risk_type, context, student)
        except Exception:
            logger.error(
                "build_action_packet exception for risk_type=%s:\n%s",
                risk_type,
                traceback.format_exc(),
            )
            return {
                "title": f"Risk detected: {risk_type.replace('_', ' ').title()}",
                "description": "Action plan temporarily unavailable. Please consult your financial aid office.",
                "urgency": context.get("severity", "warn"),
                "actions": [],
                "citations": [],
            }

    async def _knowledge_action_packet(
        self,
        risk_type: str,
        context: dict[str, Any],
        student: Student,
    ) -> dict[str, Any]:
        """Single Claude call using training knowledge + any pgvector chunks for this school."""
        gpa = student.gpa
        major = student.major or "undeclared"
        school_name = student.school.name if student.school else "your university"

        student_snapshot = {
            "gpa": gpa,
            "credits_completed": student.credits_completed,
            "credits_required": student.credits_required,
            "major": major,
            "aid_package": student.aid_package_json,
        }

        query = _risk_type_to_query(risk_type, context)
        chunks = await self.rag.search(query, student.school_id, self.db, top_k=3)

        chunks_block = ""
        if chunks:
            chunks_block = (
                f"\n\nPolicy context from {school_name} documents:\n"
                + "\n\n".join(
                    f"[{i + 1}] {c['section_heading'] or '(no heading)'}\n"
                    f"{c['chunk_text']}\nSource: {c['page_url']}"
                    for i, c in enumerate(chunks)
                )
            )

        output_schema = (
            "{\n"
            '  "title": "Short headline (10 words max)",\n'
            '  "description": "One sentence for the student",\n'
            '  "urgency": "info|warn|high|urgent",\n'
            '  "actions": [\n'
            "    {\n"
            '      "title": "3-5 word verb-first label (e.g. Email Financial Aid)",\n'
            '      "description": "Imperative sentence with exact email, form name, phone, or URL",\n'
            '      "url": "Verified URL from policy context, or null",\n'
            '      "deadline": "YYYY-MM-DD or null",\n'
            '      "office": "Office name plus email and phone",\n'
            '      "estimated_minutes": 5,\n'
            f'      "email_template": {{"subject": "Pre-filled subject", "body": "Pre-filled body referencing GPA={gpa}, major={major}. Use [Your Name] and [Student ID] for unknowns."}},\n'
            '      "phone_script": "2-3 verbatim sentences to read aloud. Include [Your Name] and [Student ID]."\n'
            "    }\n"
            "  ],\n"
            '  "citations": ["Source URLs from policy context, or standard school page URLs"]\n'
            "}"
        )

        snapshot_lines = "\n".join(
            f"  {k.replace('_', ' ').title()}: {v}"
            for k, v in student_snapshot.items()
            if v is not None
        )

        user_message = (
            f"Risk: {risk_type.replace('_', ' ').upper()} at {school_name}\n\n"
            f"Student snapshot:\n{snapshot_lines}"
            f"{chunks_block}\n\n"
            f"Using your knowledge of {school_name}'s financial aid office, academic policies, "
            f"and standard {risk_type.replace('_', ' ')} processes at US universities, "
            f"generate a specific action packet with at least 2 concrete action steps.\n\n"
            f"Return JSON matching this schema:\n{output_schema}"
        )

        client = _anthropic_client()
        response = await client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=4096,
            system=_KNOWLEDGE_SYSTEM,
            messages=[{"role": "user", "content": user_message}],
        )
        logger.info(
            "_knowledge_action_packet stop_reason=%s risk_type=%s chunks=%d",
            response.stop_reason, risk_type, len(chunks),
        )

        text_block = next((b for b in response.content if b.type == "text"), None)
        if text_block:
            return _parse_partial_json(text_block.text.strip(), risk_type)

        logger.warning("_knowledge_action_packet returned no text block for risk_type=%s", risk_type)
        return {
            "title": f"Risk detected: {risk_type.replace('_', ' ').title()}",
            "description": "Action plan temporarily unavailable. Please consult your financial aid office.",
            "urgency": context.get("severity", "warn"),
            "actions": [],
            "citations": [c["page_url"] for c in chunks if c.get("page_url")],
        }

    async def scan_student(self, student_id: uuid.UUID, force: bool = False) -> list[RiskEvent]:
        """Evaluate all rules for one student and persist any new risk events.

        Args:
            force: When True, bypasses cooldown checks so rules re-fire even if a
                   recent unresolved event already exists. Use for manual re-scans.
        """
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
            if not force and not await self._cooldown_ok(student.id, rule.risk_type):
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

def _parse_partial_json(raw: str, risk_type: str = "aid_risk") -> dict[str, Any]:
    # First, try standard json.loads
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    import re

    # If there's leading/trailing prose, extract the outermost JSON object and try again.
    # This handles "Here's your action plan: {...}" responses where json.loads fails.
    outer_match = re.search(r"\{[\s\S]*\}", raw)
    if outer_match:
        try:
            return json.loads(outer_match.group())
        except json.JSONDecodeError:
            pass


    str_pattern = r'"([^"\\]*(?:\\.[^"\\]*)*)"'
    
    title_match = re.search(r'"title"\s*:\s*' + str_pattern, raw)
    desc_match = re.search(r'"description"\s*:\s*' + str_pattern, raw)
    urgency_match = re.search(r'"urgency"\s*:\s*' + str_pattern, raw)
    
    title = f"Risk detected: {risk_type}"
    if title_match:
        try:
            title = json.loads(f'"{title_match.group(1)}"')
        except Exception:
            title = title_match.group(1)
        
    description = raw
    if desc_match:
        try:
            description = json.loads(f'"{desc_match.group(1)}"')
        except Exception:
            description = desc_match.group(1)
        
    urgency = "warn"
    if urgency_match:
        try:
            urgency = json.loads(f'"{urgency_match.group(1)}"')
        except Exception:
            urgency = urgency_match.group(1)

    actions = []
    actions_match = re.search(r'"actions"\s*:\s*\[(.*)', raw, re.DOTALL)
    if actions_match:
        actions_str = actions_match.group(1)
        brace_count = 0
        in_string = False
        escape_next = False
        start_idx = -1
        
        for i, char in enumerate(actions_str):
            if escape_next:
                escape_next = False
                continue
            if char == '\\':
                escape_next = True
                continue
            if char == '"':
                in_string = not in_string
                continue
            if not in_string:
                if char == '{':
                    if brace_count == 0:
                        start_idx = i
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0 and start_idx != -1:
                        obj_str = actions_str[start_idx:i+1]
                        try:
                            action_obj = json.loads(obj_str)
                            actions.append(action_obj)
                        except json.JSONDecodeError:
                            pass
                        start_idx = -1

    citations = []
    citations_match = re.search(r'"citations"\s*:\s*\[(.*?)\]', raw, re.DOTALL)
    if citations_match:
        try:
            citations = json.loads(f"[{citations_match.group(1)}]")
        except json.JSONDecodeError:
            citations_str = citations_match.group(1)
            citations_found = re.findall(str_pattern, citations_str)
            for c in citations_found:
                try:
                    citations.append(json.loads(f'"{c}"'))
                except Exception:
                    citations.append(c)
            
    return {
        "title": title,
        "description": description,
        "urgency": urgency,
        "actions": actions,
        "citations": citations
    }


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

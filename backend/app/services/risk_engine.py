import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.risk_event import RiskEvent, Severity
from app.models.school import School
from app.models.student import Student
from app.services.rag import rag_service

# ── Thresholds ────────────────────────────────────────────────────────────────

SAP_PACE_THRESHOLD = 0.67   # federal minimum completion rate
GPA_AID_FLOOR = 2.0         # common SAP GPA floor; school-specific override TODO
GPA_PROBATION = 2.0         # academic probation floor

# ── Rule table ────────────────────────────────────────────────────────────────

_RULES = [
    {"risk_type": "academic_probation",           "severity": Severity.urgent, "cooldown_days": 30},
    {"risk_type": "gpa_drop",                     "severity": Severity.urgent, "cooldown_days": 30},
    {"risk_type": "aid_risk",                     "severity": Severity.urgent, "cooldown_days": 30},
    {"risk_type": "credit_deficit",               "severity": Severity.warn,   "cooldown_days": 14},
    {"risk_type": "satisfactory_academic_progress","severity": Severity.warn,   "cooldown_days": 14},
]

_RISK_TITLES = {
    "gpa_drop":                      "GPA Below Aid Retention Floor",
    "credit_deficit":                "Credit Completion Pace Deficit",
    "aid_risk":                      "Financial Aid Eligibility at Risk",
    "deadline_miss":                 "Upcoming Deadline",
    "academic_probation":            "Academic Probation",
    "satisfactory_academic_progress":"Satisfactory Academic Progress Warning",
}

# Questions sent to RAG when a rule fires — school-specific policy retrieved per query
_RISK_QUERIES = {
    "gpa_drop":
        "What happens to financial aid if GPA falls below 2.0? What are the appeal and reinstatement steps?",
    "credit_deficit":
        "What is the credit completion pace requirement and what happens if a student falls below 67%?",
    "aid_risk":
        "What are the Satisfactory Academic Progress requirements for keeping financial aid?",
    "deadline_miss":
        "What are the upcoming financial aid and academic deadlines and appeal procedures?",
    "academic_probation":
        "What is the academic probation policy and what steps must a student take to be reinstated?",
    "satisfactory_academic_progress":
        "What is the SAP policy and what is the appeal process for students who fail SAP?",
}


class RiskEngine:

    # ── Public API ────────────────────────────────────────────────────────────

    async def scan_student(
        self, student_id: uuid.UUID, session: AsyncSession
    ) -> list[RiskEvent]:
        result = await session.execute(select(Student).where(Student.id == student_id))
        student = result.scalar_one_or_none()
        if student is None:
            return []
        return await self._evaluate(student, session)

    async def scan_all(self, session: AsyncSession) -> None:
        result = await session.execute(select(Student))
        for student in result.scalars().all():
            await self._evaluate(student, session)

    async def build_action_packet(
        self,
        risk_type: str,
        context: dict,
        school_id: uuid.UUID,
        session: AsyncSession,
    ) -> dict:
        """Call RAG to build a school-specific action packet for this risk type."""
        query = _RISK_QUERIES.get(risk_type, f"What should a student do about {risk_type}?")

        school_result = await session.execute(select(School).where(School.id == school_id))
        school = school_result.scalar_one_or_none()
        school_name = school.name if school else "your school"

        rag_result = await rag_service.answer(query, school_id, school_name, session)
        return {
            "title": _RISK_TITLES.get(risk_type, risk_type),
            "description": rag_result["answer"],
            "citations": rag_result["citations"],
            "context": context,
        }

    # ── Internal ──────────────────────────────────────────────────────────────

    async def _evaluate(
        self, student: Student, session: AsyncSession
    ) -> list[RiskEvent]:
        fired: list[RiskEvent] = []
        for rule in _RULES:
            context = self._check_rule(rule["risk_type"], student)
            if context is None:
                continue
            if await self._in_cooldown(
                student.id, rule["risk_type"], rule["cooldown_days"], session
            ):
                continue
            action_packet = await self.build_action_packet(
                rule["risk_type"], context, student.school_id, session
            )
            event = RiskEvent(
                student_id=student.id,
                risk_type=rule["risk_type"],
                severity=rule["severity"],
                context_json=context,
                action_packet_json=action_packet,
            )
            session.add(event)
            fired.append(event)
        await session.commit()
        return fired

    def _check_rule(self, risk_type: str, student: Student) -> dict | None:
        """Return context dict if the rule fires, None if the rule does not apply."""
        gpa = student.gpa
        completed = student.credits_completed
        required = student.credits_required
        pace = (completed / required) if (completed is not None and required) else None

        if risk_type == "academic_probation":
            if gpa is not None and gpa < GPA_PROBATION:
                return {"gpa": gpa, "threshold": GPA_PROBATION}

        elif risk_type == "gpa_drop":
            if gpa is not None and gpa < GPA_AID_FLOOR:
                return {"gpa": gpa, "threshold": GPA_AID_FLOOR}

        elif risk_type == "credit_deficit":
            if pace is not None and pace < SAP_PACE_THRESHOLD:
                return {
                    "credits_completed": completed,
                    "credits_required": required,
                    "pace": round(pace, 3),
                    "threshold": SAP_PACE_THRESHOLD,
                }

        elif risk_type == "satisfactory_academic_progress":
            if pace is not None and pace < SAP_PACE_THRESHOLD:
                return {"pace": round(pace, 3), "threshold": SAP_PACE_THRESHOLD}

        elif risk_type == "aid_risk":
            gpa_at_risk = gpa is not None and gpa < GPA_AID_FLOOR
            pace_at_risk = pace is not None and pace < SAP_PACE_THRESHOLD
            if gpa_at_risk or pace_at_risk:
                return {
                    "gpa": gpa,
                    "gpa_at_risk": gpa_at_risk,
                    "pace": round(pace, 3) if pace is not None else None,
                    "pace_at_risk": pace_at_risk,
                }

        # deadline_miss requires date extraction from policy docs — not yet implemented
        return None

    async def _in_cooldown(
        self,
        student_id: uuid.UUID,
        risk_type: str,
        cooldown_days: int,
        session: AsyncSession,
    ) -> bool:
        cutoff = datetime.now(timezone.utc) - timedelta(days=cooldown_days)
        result = await session.execute(
            select(RiskEvent).where(
                RiskEvent.student_id == student_id,
                RiskEvent.risk_type == risk_type,
                RiskEvent.predicted_at >= cutoff,
                RiskEvent.resolved_at.is_(None),
            )
        )
        return result.scalar_one_or_none() is not None


risk_engine = RiskEngine()

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.risk_event import RiskEvent
from app.models.student import Student
from app.services.risk_engine import RiskEngine

router = APIRouter(prefix="/risk-events", tags=["risk_events"])


@router.get("", response_model=list[dict[str, Any]])
async def list_risk_events(
    student_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return persisted risk events, optionally filtered by student_id."""
    q = select(RiskEvent).order_by(RiskEvent.predicted_at.desc())
    if student_id is not None:
        q = q.where(RiskEvent.student_id == student_id)
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id": str(row.id),
            "student_id": str(row.student_id),
            "risk_type": row.risk_type,
            "severity": row.severity.value,
            "predicted_at": row.predicted_at.isoformat() if row.predicted_at else None,
            "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
            "context_json": row.context_json,
            "action_packet_json": row.action_packet_json,
        }
        for row in rows
    ]


@router.post("/scan/{student_id}", response_model=list[dict[str, Any]])
async def scan_student(
    student_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Run the risk engine for one student and persist any new risk events."""
    exists = (await db.execute(
        select(Student.id).where(Student.id == student_id)
    )).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=404, detail="Student not found")

    engine = RiskEngine(db)
    return await engine.scan_student(student_id)

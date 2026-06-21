import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.risk_event import RiskEvent, Severity

router = APIRouter(prefix="/risk-events", tags=["risk_events"])


class RiskEventOut(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    risk_type: str
    severity: Severity
    predicted_at: datetime
    resolved_at: datetime | None
    context_json: dict[str, Any] | None
    action_packet_json: dict[str, Any] | None

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[RiskEventOut])
async def list_risk_events(
    student_id: uuid.UUID | None = None,
    severity: Severity | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[RiskEvent]:
    stmt = select(RiskEvent).order_by(RiskEvent.predicted_at.desc())
    if student_id:
        stmt = stmt.where(RiskEvent.student_id == student_id)
    if severity:
        stmt = stmt.where(RiskEvent.severity == severity)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{event_id}", response_model=RiskEventOut)
async def get_risk_event(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> RiskEvent:
    result = await db.execute(select(RiskEvent).where(RiskEvent.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Risk event not found")
    return event


@router.put("/{event_id}/resolve", response_model=RiskEventOut)
async def resolve_risk_event(
    event_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> RiskEvent:
    result = await db.execute(select(RiskEvent).where(RiskEvent.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Risk event not found")
    event.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(event)
    return event

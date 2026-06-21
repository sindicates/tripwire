import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.alert import Alert, Channel

router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertCreate(BaseModel):
    student_id: uuid.UUID
    risk_event_id: uuid.UUID
    channel: Channel


class AlertOut(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    risk_event_id: uuid.UUID
    channel: Channel
    sent_at: datetime
    opened_at: datetime | None

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[AlertOut])
async def list_alerts(
    student_id: uuid.UUID | None = None,
    channel: Channel | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[Alert]:
    stmt = select(Alert).order_by(Alert.sent_at.desc())
    if student_id:
        stmt = stmt.where(Alert.student_id == student_id)
    if channel:
        stmt = stmt.where(Alert.channel == channel)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/", response_model=AlertOut, status_code=201)
async def dispatch_alert(body: AlertCreate, db: AsyncSession = Depends(get_db)) -> Alert:
    """Create an alert record. Actual email/SMS dispatch wired in Phase 2."""
    alert = Alert(**body.model_dump())
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return alert


@router.get("/{alert_id}", response_model=AlertOut)
async def get_alert(alert_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Alert:
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.put("/{alert_id}/open", response_model=AlertOut)
async def mark_opened(alert_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Alert:
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.opened_at is None:
        alert.opened_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(alert)
    return alert

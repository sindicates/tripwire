import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Severity(str, enum.Enum):
    info = "info"
    warn = "warn"
    urgent = "urgent"


class RiskEvent(Base):
    __tablename__ = "risk_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id"), nullable=False)
    risk_type: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[Severity] = mapped_column(Enum(Severity), nullable=False)
    predicted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    context_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    action_packet_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    student: Mapped["Student"] = relationship(back_populates="risk_events")  # type: ignore[name-defined]
    alerts: Mapped[list["Alert"]] = relationship(back_populates="risk_event")  # type: ignore[name-defined]

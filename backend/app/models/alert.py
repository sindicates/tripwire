import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Channel(str, enum.Enum):
    email = "email"
    sms = "sms"
    in_app = "in-app"


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id"), nullable=False)
    risk_event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("risk_events.id"), nullable=False)
    channel: Mapped[Channel] = mapped_column(Enum(Channel), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    student: Mapped["Student"] = relationship(back_populates="alerts")  # type: ignore[name-defined]
    risk_event: Mapped["RiskEvent"] = relationship(back_populates="alerts")  # type: ignore[name-defined]

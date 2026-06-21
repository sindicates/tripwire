import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Student(Base):
    __tablename__ = "students"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    school_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schools.id"), nullable=False)
    major: Mapped[str | None] = mapped_column(String, nullable=True)
    enrollment_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gpa: Mapped[float | None] = mapped_column(Float, nullable=True)
    credits_completed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    credits_required: Mapped[int | None] = mapped_column(Integer, nullable=True)
    aid_package_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    degree_audit_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    school: Mapped["School"] = relationship(back_populates="students")  # type: ignore[name-defined]
    risk_events: Mapped[list["RiskEvent"]] = relationship(back_populates="student")  # type: ignore[name-defined]
    alerts: Mapped[list["Alert"]] = relationship(back_populates="student")  # type: ignore[name-defined]

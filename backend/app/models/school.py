import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class School(Base):
    __tablename__ = "schools"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    ipeds_id: Mapped[str | None] = mapped_column(String, nullable=True)
    scorecard_id: Mapped[str | None] = mapped_column(String, nullable=True)
    financial_aid_url: Mapped[str | None] = mapped_column(String, nullable=True)
    doc_ingestion_status: Mapped[str] = mapped_column(String, default="pending")
    last_ingested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    students: Mapped[list["Student"]] = relationship(back_populates="school")  # type: ignore[name-defined]
    documents: Mapped[list["Document"]] = relationship(back_populates="school")  # type: ignore[name-defined]

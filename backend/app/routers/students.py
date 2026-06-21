import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_student
from app.models.alert import Alert
from app.models.risk_event import RiskEvent, Severity
from app.models.school import School
from app.models.student import Student
from app.services.risk_engine import RiskEngine

router = APIRouter(prefix="/students", tags=["students"])


# ── Pydantic models ───────────────────────────────────────────────────────────

class StudentUpdate(BaseModel):
    display_name: str | None = None
    gpa: float | None = None
    credits_completed: int | None = None
    credits_attempted: int | None = None
    credits_required: int | None = None
    major: str | None = None
    aid_package_json: dict[str, Any] | None = None
    degree_audit_json: dict[str, Any] | None = None


class SupabaseLinkRequest(BaseModel):
    supabase_user_id: str
    email: str
    display_name: str | None = None
    school_name: str | None = None
    gpa: float | None = None
    credits_completed: int | None = None
    credits_attempted: int | None = None
    credits_required: int | None = None
    major: str | None = None
    aid_package_json: dict[str, Any] | None = None


class StudentOut(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str | None
    supabase_user_id: str | None
    school_id: uuid.UUID | None
    major: str | None
    enrollment_year: int | None
    gpa: float | None
    credits_completed: int | None
    credits_attempted: int | None
    credits_required: int | None
    aid_package_json: dict[str, Any] | None
    degree_audit_json: dict[str, Any] | None

    model_config = {"from_attributes": True}


class RiskEventOut(BaseModel):
    id: uuid.UUID
    risk_type: str
    severity: Severity
    predicted_at: datetime
    resolved_at: datetime | None
    context_json: dict[str, Any] | None
    action_packet_json: dict[str, Any] | None

    model_config = {"from_attributes": True}


class AlertOut(BaseModel):
    id: uuid.UUID
    risk_event_id: uuid.UUID
    channel: str
    sent_at: datetime
    opened_at: datetime | None

    model_config = {"from_attributes": True}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/link-supabase", response_model=StudentOut)
async def link_supabase_student(
    body: SupabaseLinkRequest, db: AsyncSession = Depends(get_db)
) -> Student:
    """Create or update a backend student record linked to a Supabase auth user."""
    # Find existing by supabase_user_id, then fall back to email
    student = (await db.execute(
        select(Student).where(Student.supabase_user_id == body.supabase_user_id)
    )).scalar_one_or_none()

    if student is None and body.email:
        student = (await db.execute(
            select(Student).where(Student.email == body.email)
        )).scalar_one_or_none()

    # Try to match a school by name
    school_id: uuid.UUID | None = None
    if body.school_name:
        school = (await db.execute(
            select(School).where(School.name.ilike(f"%{body.school_name[:40]}%"))
        )).scalar_one_or_none()
        if school:
            school_id = school.id

    if student is None:
        student = Student(
            supabase_user_id=body.supabase_user_id,
            email=body.email,
            display_name=body.display_name,
            school_id=school_id,
            gpa=body.gpa,
            credits_completed=body.credits_completed,
            credits_attempted=body.credits_attempted,
            credits_required=body.credits_required,
            major=body.major,
            aid_package_json=body.aid_package_json,
        )
        db.add(student)
    else:
        student.supabase_user_id = body.supabase_user_id
        if body.display_name is not None:
            student.display_name = body.display_name
        if school_id is not None and student.school_id is None:
            student.school_id = school_id
        if body.gpa is not None:
            student.gpa = body.gpa
        if body.credits_completed is not None:
            student.credits_completed = body.credits_completed
        if body.credits_attempted is not None:
            student.credits_attempted = body.credits_attempted
        if body.credits_required is not None:
            student.credits_required = body.credits_required
        if body.major is not None:
            student.major = body.major
        if body.aid_package_json is not None:
            student.aid_package_json = body.aid_package_json

    await db.commit()
    await db.refresh(student)
    return student


@router.get("/by-supabase/{supabase_uid}", response_model=StudentOut)
async def get_by_supabase_uid(
    supabase_uid: str, db: AsyncSession = Depends(get_db)
) -> Student:
    student = (await db.execute(
        select(Student).where(Student.supabase_user_id == supabase_uid)
    )).scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=404, detail="Student not linked to backend")
    return student


@router.get("/me", response_model=StudentOut)
async def get_me(current: Student = Depends(get_current_student)) -> Student:
    return current


@router.put("/me", response_model=StudentOut)
async def update_me(
    body: StudentUpdate,
    current: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
) -> Student:
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(current, field, value)
    await db.commit()
    await db.refresh(current)
    return current


@router.get("/{student_id}", response_model=StudentOut)
async def get_student(student_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Student:
    result = await db.execute(select(Student).where(Student.id == student_id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@router.get("/{student_id}/risk-events", response_model=list[RiskEventOut])
async def list_risk_events(
    student_id: uuid.UUID,
    severity: Severity | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[RiskEvent]:
    stmt = select(RiskEvent).where(RiskEvent.student_id == student_id)
    if severity:
        stmt = stmt.where(RiskEvent.severity == severity)
    stmt = stmt.order_by(RiskEvent.predicted_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{student_id}/alerts", response_model=list[AlertOut])
async def list_alerts(
    student_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[Alert]:
    result = await db.execute(
        select(Alert)
        .where(Alert.student_id == student_id)
        .order_by(Alert.sent_at.desc())
    )
    return list(result.scalars().all())


@router.post("/{student_id}/scan", response_model=list[RiskEventOut])
async def scan_student(
    student_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[RiskEvent]:
    """Manually trigger risk evaluation for one student."""
    engine = RiskEngine(db)
    return await engine.scan_student(student_id)

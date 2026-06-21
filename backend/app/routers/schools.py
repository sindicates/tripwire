import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.school import School

router = APIRouter(prefix="/schools", tags=["schools"])


class SchoolCreate(BaseModel):
    name: str
    ipeds_id: str | None = None
    scorecard_id: str | None = None


class SchoolUpdate(BaseModel):
    name: str | None = None
    ipeds_id: str | None = None
    scorecard_id: str | None = None
    doc_ingestion_status: str | None = None


class SchoolOut(BaseModel):
    id: uuid.UUID
    name: str
    ipeds_id: str | None
    scorecard_id: str | None
    doc_ingestion_status: str
    last_ingested_at: datetime | None

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[SchoolOut])
async def list_schools(db: AsyncSession = Depends(get_db)) -> list[School]:
    result = await db.execute(select(School))
    return list(result.scalars().all())


@router.post("/", response_model=SchoolOut, status_code=201)
async def create_school(body: SchoolCreate, db: AsyncSession = Depends(get_db)) -> School:
    school = School(**body.model_dump())
    db.add(school)
    await db.commit()
    await db.refresh(school)
    return school


@router.get("/{school_id}", response_model=SchoolOut)
async def get_school(school_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> School:
    result = await db.execute(select(School).where(School.id == school_id))
    school = result.scalar_one_or_none()
    if school is None:
        raise HTTPException(status_code=404, detail="School not found")
    return school


@router.put("/{school_id}", response_model=SchoolOut)
async def update_school(
    school_id: uuid.UUID, body: SchoolUpdate, db: AsyncSession = Depends(get_db)
) -> School:
    result = await db.execute(select(School).where(School.id == school_id))
    school = result.scalar_one_or_none()
    if school is None:
        raise HTTPException(status_code=404, detail="School not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(school, field, value)
    await db.commit()
    await db.refresh(school)
    return school


@router.post("/{school_id}/ingest", response_model=SchoolOut)
async def trigger_ingestion(
    school_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> School:
    """Mark school as in-progress; actual ingestion is per-document via POST /documents/ingest."""
    result = await db.execute(select(School).where(School.id == school_id))
    school = result.scalar_one_or_none()
    if school is None:
        raise HTTPException(status_code=404, detail="School not found")
    school.doc_ingestion_status = "in_progress"
    await db.commit()
    await db.refresh(school)
    return school

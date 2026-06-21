import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.school import School
from app.services.rag import rag_service

router = APIRouter(prefix="/chat", tags=["chat"])


class QueryRequest(BaseModel):
    school_id: uuid.UUID
    question: str


class Citation(BaseModel):
    n: int
    heading: str | None
    url: str | None
    fetched_at: str | None


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]


@router.post("/query", response_model=QueryResponse)
async def query(body: QueryRequest, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(School).where(School.id == body.school_id))
    school = result.scalar_one_or_none()
    if school is None:
        raise HTTPException(status_code=404, detail="School not found")
    return await rag_service.answer(body.question, body.school_id, school.name, db)

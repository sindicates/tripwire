import json as json_lib
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
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


class ActionItem(BaseModel):
    label: str
    url: str | None = None
    deadline: str | None = None
    office: str | None = None


class ActionPacket(BaseModel):
    title: str
    description: str
    actions: list[ActionItem]


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]
    action_packet: ActionPacket | None = None


@router.post("/query", response_model=QueryResponse)
async def query(body: QueryRequest, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(School).where(School.id == body.school_id))
    school = result.scalar_one_or_none()
    if school is None:
        raise HTTPException(status_code=404, detail="School not found")
    return await rag_service.answer(body.question, body.school_id, school.name, db)


@router.post("/query/stream")
async def query_stream(body: QueryRequest, db: AsyncSession = Depends(get_db)) -> StreamingResponse:
    result = await db.execute(select(School).where(School.id == body.school_id))
    school = result.scalar_one_or_none()
    if school is None:
        raise HTTPException(status_code=404, detail="School not found")

    async def generate():
        async for chunk in rag_service.stream_answer(body.question, body.school_id, school.name, db):
            yield f"data: {json_lib.dumps(chunk)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

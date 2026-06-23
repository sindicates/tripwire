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


class HistoryMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class QueryRequest(BaseModel):
    school_id: uuid.UUID | None = None
    school_name: str | None = None
    question: str
    risk_id: uuid.UUID | None = None
    history: list[HistoryMessage] | None = None


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


async def _resolve_school(body: QueryRequest, db: AsyncSession) -> tuple[uuid.UUID | None, str]:
    """Return (school_id, school_name) — never raises; falls back to knowledge-only."""
    if body.school_id:
        result = await db.execute(select(School).where(School.id == body.school_id))
        school = result.scalar_one_or_none()
        if school:
            return school.id, school.name
    if body.school_name:
        result = await db.execute(select(School).where(School.name.ilike(f"%{body.school_name[:60]}%")))
        school = result.scalar_one_or_none()
        if school:
            return school.id, school.name
        # School not in DB yet — answer from training knowledge using the name
        return None, body.school_name
    return None, "your university"


@router.post("/query", response_model=QueryResponse)
async def query(body: QueryRequest, db: AsyncSession = Depends(get_db)) -> dict:
    school_id, school_name = await _resolve_school(body, db)
    history = [m.model_dump() for m in body.history] if body.history else None
    return await rag_service.answer(body.question, school_id, school_name, db, risk_id=body.risk_id, history=history)


@router.post("/query/stream")
async def query_stream(body: QueryRequest, db: AsyncSession = Depends(get_db)) -> StreamingResponse:
    school_id, school_name = await _resolve_school(body, db)
    history = [m.model_dump() for m in body.history] if body.history else None

    async def generate():
        async for chunk in rag_service.stream_answer(body.question, school_id, school_name, db, risk_id=body.risk_id, history=history):
            yield f"data: {json_lib.dumps(chunk)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

import uuid
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, HttpUrl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import Document
from app.services.rag import rag_service

router = APIRouter(prefix="/documents", tags=["documents"])


class IngestRequest(BaseModel):
    school_id: uuid.UUID
    url: HttpUrl


class DocumentOut(BaseModel):
    id: uuid.UUID
    school_id: uuid.UUID
    url: str
    title: str | None
    chunk_count: int
    last_fetched_at: datetime | None

    model_config = {"from_attributes": True}


@router.post("/ingest", response_model=DocumentOut)
async def ingest_document(
    body: IngestRequest, db: AsyncSession = Depends(get_db)
) -> Document:
    try:
        doc = await rag_service.ingest(str(body.url), body.school_id, db)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not fetch URL ({exc.response.status_code}): {str(body.url)}",
        )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Network error: {exc}")
    return doc


@router.get("/", response_model=list[DocumentOut])
async def list_documents(
    school_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[Document]:
    result = await db.execute(
        select(Document).where(Document.school_id == school_id)
    )
    return list(result.scalars().all())


@router.get("/{document_id}", response_model=DocumentOut)
async def get_document(
    document_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> Document:
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc

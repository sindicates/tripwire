from __future__ import annotations

import math
import uuid
from datetime import datetime, timedelta, timezone

import anthropic
import openai
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.document import DocChunk

EMBED_MODEL = "text-embedding-3-small"
CLAUDE_MODEL = "claude-sonnet-4-6"
STALE_DAYS = 14


def _openai_client() -> openai.AsyncOpenAI:
    return openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


def _anthropic_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class RAGService:
    """Retrieval-augmented generation over school policy documents."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def embed_chunks(self, chunks: list[str]) -> list[list[float]]:
        resp = await _openai_client().embeddings.create(input=chunks, model=EMBED_MODEL)
        return [item.embedding for item in resp.data]

    async def search(self, query: str, school_id: str | uuid.UUID, top_k: int = 5) -> list[dict]:
        [query_vec] = await self.embed_chunks([query])

        result = await self.db.execute(
            select(DocChunk).where(
                DocChunk.school_id == uuid.UUID(str(school_id)),
                DocChunk.embedding.is_not(None),
            )
        )
        chunks = result.scalars().all()

        stale_cutoff = datetime.now(timezone.utc) - timedelta(days=STALE_DAYS)
        scored: list[tuple[float, DocChunk]] = []
        for chunk in chunks:
            similarity = _cosine_similarity(query_vec, chunk.embedding)
            if chunk.fetched_at is None:
                recency = 0.5
            elif chunk.fetched_at.replace(tzinfo=timezone.utc) > stale_cutoff:
                recency = 1.0
            else:
                recency = 0.7
            scored.append((similarity * recency, chunk))

        scored.sort(key=lambda t: t[0], reverse=True)
        return [
            {
                "id": str(chunk.id),
                "chunk_text": chunk.chunk_text,
                "section_heading": chunk.section_heading,
                "page_url": chunk.page_url,
                "fetched_at": chunk.fetched_at,
                "similarity": score,
            }
            for score, chunk in scored[:top_k]
        ]

    async def answer(self, query: str, school_id: str | uuid.UUID, context: dict | None = None) -> str:
        chunks = await self.search(query, school_id)
        if not chunks:
            return "No relevant policy documents found for this school."

        chunk_text = "\n\n".join(
            f"[Source: {c.get('page_url') or 'unknown'} | Heading: {c.get('section_heading') or 'N/A'}]\n{c['chunk_text']}"
            for c in chunks
        )

        context_block = ""
        if context:
            context_block = f"\n\nStudent snapshot:\n{context}"

        system = (
            "You are Tripwire, an academic risk advisor. Answer using ONLY the policy documents provided. "
            "Cite the source URL for every claim. Be concise and action-oriented. "
            "If you cannot find the answer in the provided documents, say so explicitly."
        )

        message = await _anthropic_client().messages.create(
            model=CLAUDE_MODEL,
            max_tokens=1024,
            system=system,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Policy documents:\n{chunk_text}"
                        f"{context_block}\n\nQuestion: {query}"
                    ),
                }
            ],
        )
        return message.content[0].text

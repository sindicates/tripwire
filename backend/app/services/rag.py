import uuid
from datetime import datetime, timezone

import anthropic
import httpx
import openai
import tiktoken
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.document import DocChunk, Document

CHUNK_TOKENS = 400
OVERLAP_TOKENS = 50
STALE_DAYS = 14
TOP_K = 5

_HEADING_TAGS = ["h1", "h2", "h3", "h4"]
_BLOCK_TAGS = ["p", "li", "td", "dt", "dd", "blockquote", "pre"]
_NOISE_TAGS = ["nav", "footer", "header", "script", "style", "noscript", "aside", "form"]


class RAGService:
    def __init__(self) -> None:
        self._openai = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self._anthropic = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self._enc = tiktoken.get_encoding("cl100k_base")

    # ── Ingestion ─────────────────────────────────────────────────────────────

    async def ingest(
        self, url: str, school_id: uuid.UUID, session: AsyncSession
    ) -> Document:
        """Fetch, parse, chunk, embed, and upsert a policy document."""
        html = await self._fetch(url)
        title, sections = self._parse(html)
        chunks = self._chunk(sections)

        now = datetime.now(timezone.utc)

        result = await session.execute(
            select(Document).where(
                Document.url == url, Document.school_id == school_id
            )
        )
        doc = result.scalar_one_or_none()
        if doc is None:
            doc = Document(school_id=school_id, url=url)
            session.add(doc)

        doc.title = title
        doc.raw_text = "\n\n".join(c["text"] for c in chunks)
        doc.chunk_count = len(chunks)
        doc.last_fetched_at = now
        await session.flush()

        # Delete stale chunks before re-embedding
        existing = await session.execute(
            select(DocChunk).where(DocChunk.document_id == doc.id)
        )
        for old_chunk in existing.scalars().all():
            await session.delete(old_chunk)
        await session.flush()

        embeddings = await self._embed([c["text"] for c in chunks])
        for chunk, emb in zip(chunks, embeddings):
            session.add(
                DocChunk(
                    document_id=doc.id,
                    school_id=school_id,
                    chunk_text=chunk["text"],
                    section_heading=chunk.get("heading"),
                    page_url=url,
                    embedding=emb,
                    fetched_at=now,
                )
            )

        await session.commit()
        await session.refresh(doc)
        return doc

    async def _fetch(self, url: str) -> str:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "TripwireBot/1.0"})
            r.raise_for_status()
            return r.text

    def _parse(self, html: str) -> tuple[str, list[dict]]:
        """Strip nav/footer noise, return (page_title, [{heading, text}])."""
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(_NOISE_TAGS):
            tag.decompose()

        title = soup.title.string.strip() if soup.title and soup.title.string else ""

        sections: list[dict] = []
        current_heading: str | None = None
        current_texts: list[str] = []

        for tag in soup.find_all(_HEADING_TAGS + _BLOCK_TAGS):
            if tag.name in _HEADING_TAGS:
                if current_texts:
                    sections.append(
                        {"heading": current_heading, "text": " ".join(current_texts)}
                    )
                    current_texts = []
                current_heading = tag.get_text(" ", strip=True)
            else:
                text = tag.get_text(" ", strip=True)
                if text:
                    current_texts.append(text)

        if current_texts:
            sections.append(
                {"heading": current_heading, "text": " ".join(current_texts)}
            )

        return title, sections

    def _chunk(self, sections: list[dict]) -> list[dict]:
        """Slide a CHUNK_TOKENS window over each section with OVERLAP_TOKENS step-back."""
        chunks: list[dict] = []
        for sec in sections:
            if not sec["text"].strip():
                continue
            tokens = self._enc.encode(sec["text"])
            start = 0
            while start < len(tokens):
                end = start + CHUNK_TOKENS
                chunks.append(
                    {
                        "heading": sec.get("heading"),
                        "text": self._enc.decode(tokens[start:end]),
                    }
                )
                if end >= len(tokens):
                    break
                start = end - OVERLAP_TOKENS
        return chunks

    async def _embed(self, texts: list[str]) -> list[list[float]]:
        response = await self._openai.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )
        return [item.embedding for item in response.data]

    # ── Retrieval ─────────────────────────────────────────────────────────────

    async def search(
        self,
        query: str,
        school_id: uuid.UUID,
        session: AsyncSession,
        top_k: int = TOP_K,
    ) -> list[dict]:
        """Embed query, cosine search scoped to school_id, re-rank by recency."""
        [q_emb] = await self._embed([query])

        distance_col = DocChunk.embedding.cosine_distance(q_emb)
        stmt = (
            select(DocChunk, distance_col.label("distance"))
            .where(DocChunk.school_id == school_id)
            .order_by(distance_col)
            .limit(top_k * 3)
        )
        rows = (await session.execute(stmt)).all()

        now = datetime.now(timezone.utc)
        ranked: list[dict] = []
        for chunk, distance in rows:
            cosine_sim = 1.0 - float(distance)
            fetched = chunk.fetched_at
            if fetched is not None:
                if fetched.tzinfo is None:
                    fetched = fetched.replace(tzinfo=timezone.utc)
                age_days = (now - fetched).days
            else:
                age_days = STALE_DAYS
            recency = max(0.0, 1.0 - age_days / STALE_DAYS)
            # Weighted sum instead of product so a stale-but-relevant chunk
            # isn't zeroed out when recency hits 0.
            score = 0.8 * cosine_sim + 0.2 * recency
            ranked.append(
                {
                    "chunk_text": chunk.chunk_text,
                    "section_heading": chunk.section_heading,
                    "page_url": chunk.page_url,
                    "fetched_at": chunk.fetched_at,
                    "score": score,
                }
            )

        ranked.sort(key=lambda r: r["score"], reverse=True)
        return ranked[:top_k]

    # ── Generation ────────────────────────────────────────────────────────────

    async def answer(
        self,
        query: str,
        school_id: uuid.UUID,
        school_name: str,
        session: AsyncSession,
    ) -> dict:
        """Return {answer, citations} grounded in retrieved policy chunks."""
        # 1. Check if there are any chunks for this school in DB first, to avoid
        # unnecessary OpenAI embedding API calls if no docs are ingested.
        chunks_exist_result = await session.execute(
            select(DocChunk.id).where(DocChunk.school_id == school_id).limit(1)
        )
        if not chunks_exist_result.scalar():
            return {
                "answer": (
                    "No policy documents have been ingested for this school yet. "
                    "Ask an admin to submit a policy URL first."
                ),
                "citations": [],
            }

        # 2. Search and generate answer, catching any external API quota/auth errors gracefully.
        try:
            chunks = await self.search(query, school_id, session)
            if not chunks:
                return {
                    "answer": (
                        "No policy documents have been ingested for this school yet. "
                        "Ask an admin to submit a policy URL first."
                    ),
                    "citations": [],
                }

            context_blocks = "\n\n".join(
                f"[{i + 1}] {c['section_heading'] or '(no heading)'}\n"
                f"{c['chunk_text']}\n"
                f"Source: {c['page_url']}"
                for i, c in enumerate(chunks)
            )

            system = (
                f"You are an academic policy assistant for {school_name}. "
                "Answer the student's question using ONLY the policy excerpts provided. "
                "Be specific and plain-language — no filler, no generic advice. "
                "If the excerpts do not contain a clear answer, say so explicitly. "
                "End your response with a 'Sources:' line listing the [n] numbers you cited."
            )

            msg = await self._anthropic.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                system=system,
                messages=[
                    {
                        "role": "user",
                        "content": (
                            f"Policy excerpts:\n{context_blocks}\n\nQuestion: {query}"
                        ),
                    }
                ],
            )
            
            return {
                "answer": msg.content[0].text,
                "citations": [
                    {
                        "n": i + 1,
                        "heading": c["section_heading"],
                        "url": c["page_url"],
                        "fetched_at": (
                            c["fetched_at"].isoformat() if c["fetched_at"] else None
                        ),
                    }
                    for i, c in enumerate(chunks)
                ],
            }
        except Exception as e:
            import logging
            logging.getLogger("uvicorn").error(f"RAG service error: {e}")
            return {
                "answer": (
                    "The academic policy database is temporarily offline or the API quota has been exceeded. "
                    "Please try again later."
                ),
                "citations": [],
            }


rag_service = RAGService()

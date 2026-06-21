import json
import logging
import re
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

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
        # Clients are created lazily so the server starts without API keys configured.
        self._openai: openai.AsyncOpenAI | None = None
        self._anthropic: anthropic.AsyncAnthropic | None = None
        self._enc = tiktoken.get_encoding("cl100k_base")

    def _get_openai(self) -> openai.AsyncOpenAI:
        if self._openai is None:
            if not settings.OPENAI_API_KEY:
                raise RuntimeError("OPENAI_API_KEY is not configured")
            self._openai = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        return self._openai

    def _get_anthropic(self) -> anthropic.AsyncAnthropic:
        if self._anthropic is None:
            if not settings.ANTHROPIC_API_KEY:
                raise RuntimeError("ANTHROPIC_API_KEY is not configured")
            self._anthropic = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        return self._anthropic

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
        response = await self._get_openai().embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )
        return [item.embedding for item in response.data]

    async def embed_chunks(self, texts: list[str]) -> list[list[float]]:
        """Embed list of texts."""
        return await self._embed(texts)

    # ── Crawl-and-ingest ──────────────────────────────────────────────────────

    _POLICY_KEYWORDS = {
        "sap", "satisfactory", "appeal", "financial-aid", "financial_aid",
        "scholarship", "policy", "policies", "probation", "suspension",
        "deadline", "fafsa", "aid-eligibility", "academic-standing",
    }

    async def crawl_and_ingest(
        self,
        school_id: uuid.UUID,
        seed_url: str,
        session: AsyncSession,
        max_pages: int = 20,
    ) -> int:
        """Ingest seed URL then all same-domain links found on it (one hop)."""
        seed_parsed = urlparse(seed_url)
        visited: set[str] = set()
        queue: list[str] = [seed_url]
        ingested = 0

        while queue and ingested < max_pages:
            url = queue.pop(0)
            if url in visited:
                continue
            visited.add(url)

            try:
                if url == seed_url:
                    html = await self._fetch(url)
                    soup = BeautifulSoup(html, "html.parser")
                    for a in soup.find_all("a", href=True):
                        href = a.get("href", "").strip()
                        abs_url = urljoin(seed_url, href)
                        p = urlparse(abs_url)
                        if p.netloc != seed_parsed.netloc or not p.path:
                            continue
                        clean = f"{p.scheme}://{p.netloc}{p.path}"
                        if clean not in visited and clean not in queue:
                            queue.append(clean)

                await self.ingest(url, school_id, session)
                ingested += 1
            except Exception:
                continue

        return ingested

    async def _discover_links(self, seed_url: str, limit: int = 60) -> list[str]:
        """Return all same-domain links found on seed_url."""
        try:
            html = await self._fetch(seed_url)
            soup = BeautifulSoup(html, "html.parser")
            seed_parsed = urlparse(seed_url)
            seen: set[str] = set()
            links: list[str] = []
            for a in soup.find_all("a", href=True):
                abs_url = urljoin(seed_url, a["href"].strip())
                p = urlparse(abs_url)
                if p.netloc != seed_parsed.netloc or not p.path:
                    continue
                clean = f"{p.scheme}://{p.netloc}{p.path}"
                if clean not in seen and clean != seed_url:
                    seen.add(clean)
                    links.append(clean)
                if len(links) >= limit:
                    break
            return links
        except Exception:
            return []

    async def _select_relevant_urls(
        self, query: str, urls: list[str], school_name: str, max_select: int = 3
    ) -> list[str]:
        """Ask Claude which URLs from the list most likely answer the question."""
        if not urls:
            return []
        url_list = "\n".join(urls[:50])
        msg = await self._get_anthropic().messages.create(
            model="claude-sonnet-4-6",
            max_tokens=200,
            system=(
                f"You route student questions to the right page on {school_name}'s website. "
                f"Given a question and a list of URLs, return the {max_select} URLs most likely "
                "to contain the specific answer. Output ONLY the raw URLs, one per line, no bullet points or explanation."
            ),
            messages=[{"role": "user", "content": f"Question: {query}\n\nURLs:\n{url_list}"}],
        )
        selected: list[str] = []
        url_set = set(urls)
        for line in msg.content[0].text.strip().splitlines():
            url = line.strip()
            if url in url_set and url not in selected:
                selected.append(url)
        return selected[:max_select]

    async def _background_ingest(self, school_id: uuid.UUID, seed_url: str) -> None:
        """Run crawl_and_ingest with its own session; update school status when done."""
        from app.database import AsyncSessionLocal
        from app.models.school import School

        async with AsyncSessionLocal() as session:
            try:
                await self.crawl_and_ingest(school_id, seed_url, session)
            finally:
                result = await session.execute(
                    select(School).where(School.id == school_id)
                )
                school = result.scalar_one_or_none()
                if school:
                    school.doc_ingestion_status = "complete"
                    school.last_ingested_at = datetime.now(timezone.utc)
                    await session.commit()

    # ── Retrieval ─────────────────────────────────────────────────────────────

    async def search(
        self,
        query: str,
        school_id: uuid.UUID | None,
        session: AsyncSession,
        top_k: int = TOP_K,
    ) -> list[dict]:
        """Embed query, cosine search scoped to school_id, re-rank by recency."""
        if school_id is None:
            return []

        try:
            [q_emb] = await self._embed([query])

            is_sqlite = session.bind.dialect.name == "sqlite"
            if is_sqlite:
                # Fetch all chunks for this school
                stmt = select(DocChunk).where(DocChunk.school_id == school_id)
                chunks = (await session.execute(stmt)).scalars().all()

                import numpy as np
                def cosine_similarity(v1, v2):
                    if v1 is None or v2 is None:
                        return 0.0
                    a1 = np.asarray(v1)
                    a2 = np.asarray(v2)
                    if a1.shape != a2.shape or a1.size == 0:
                        return 0.0
                    dot_product = np.dot(a1, a2)
                    norm1 = np.linalg.norm(a1)
                    norm2 = np.linalg.norm(a2)
                    if norm1 == 0.0 or norm2 == 0.0:
                        return 0.0
                    return float(dot_product / (norm1 * norm2))

                rows = []
                for chunk in chunks:
                    sim = cosine_similarity(chunk.embedding, q_emb)
                    distance = 1.0 - sim
                    rows.append((chunk, distance))

                # Sort by distance and limit
                rows.sort(key=lambda r: r[1])
                rows = rows[:top_k * 3]
            else:
                distance_col = DocChunk.embedding.cosine_distance(q_emb)
                stmt = (
                    select(DocChunk, distance_col.label("distance"))
                    .where(DocChunk.school_id == school_id)
                    .order_by(distance_col)
                    .limit(top_k * 3)
                )
                rows = (await session.execute(stmt)).all()
        except Exception:
            return []

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
        risk_id: uuid.UUID | None = None,
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
                "action_packet": None,
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
                    "action_packet": None,
                }

            # 3. Dynamic subpage fetch: discover links from the school's financial aid URL,
            #    ask Claude which subpages are most likely to answer this question, fetch them live.
            dynamic_docs: list[dict] = []
            try:
                from app.models.school import School as SchoolModel
                school_row = (await session.execute(
                    select(SchoolModel).where(SchoolModel.id == school_id)
                )).scalar_one_or_none()
                if school_row and school_row.financial_aid_url:
                    links = await self._discover_links(school_row.financial_aid_url)
                    if links:
                        top_urls = await self._select_relevant_urls(query, links, school_name)
                        for url in top_urls:
                            try:
                                html = await self._fetch(url)
                                _, sections = self._parse(html)
                                text = "\n\n".join(
                                    s["text"] for s in sections if s["text"].strip()
                                )
                                if text:
                                    dynamic_docs.append({"url": url, "text": text[:3000]})
                            except Exception:
                                continue
            except Exception:
                pass  # dynamic fetch is best-effort; fall back to pre-indexed chunks only

            # Retrieve risk context if provided
            risk_context_str = ""
            if risk_id:
                from app.models.risk_event import RiskEvent
                result = await session.execute(
                    select(RiskEvent).where(RiskEvent.id == risk_id)
                )
                event = result.scalar_one_or_none()
                if event:
                    packet = event.action_packet_json or {}
                    risk_context_str = (
                        f"Student Risk Context:\n"
                        f"- Active Risk: {packet.get('title', event.risk_type)}\n"
                        f"- Description: {packet.get('description', '')}\n"
                        f"- Severity: {event.severity.value if hasattr(event.severity, 'value') else event.severity}\n"
                        f"- Context Evidence: {json.dumps(event.context_json or {})}\n"
                        f"- Suggested Action Steps:\n"
                    )
                    for action in packet.get("actions", []):
                        risk_context_str += f"  * {action.get('label')} (Due: {action.get('deadline')}, Office: {action.get('office')})\n"
                    risk_context_str += "\n"

            # Build context: pre-indexed chunks first, then live-fetched pages
            context_blocks = "\n\n".join(
                f"[{i + 1}] {c['section_heading'] or '(no heading)'}\n"
                f"{c['chunk_text']}\n"
                f"Source: {c['page_url']}"
                for i, c in enumerate(chunks)
            )
            base = len(chunks)
            if dynamic_docs:
                context_blocks += "\n\n" + "\n\n".join(
                    f"[{base + i + 1}] (live page)\n{d['text']}\nSource: {d['url']}"
                    for i, d in enumerate(dynamic_docs)
                )

            system = (
                f"You are a knowledgeable academic advisor for {school_name}. "
                "Your job is to help students understand their financial aid and academic policies. "
                "You have been given policy excerpts below. Use them as your primary source, but reason like an advisor — not a search engine.\n\n"
                "How to answer:\n"
                "1. Lead with what you know. Start with the most directly relevant policy information from the excerpts.\n"
                "2. Reason from evidence. If the exact answer is not stated but can be inferred from related policy (e.g. SAP requirements imply a minimum GPA), say so clearly. "
                "Distinguish inferences from stated facts: use 'Based on the SAP policy...' or 'This suggests...' for inferences.\n"
                "3. Be specific and actionable. Name exact thresholds, deadlines, offices, and form names when available. "
                "Write for a stressed undergraduate — no jargon, no hedging.\n"
                "4. Use inline citation markers like [1] or [2] immediately after any fact drawn from an excerpt.\n"
                "5. Only defer to an advisor for decisions that require individual case knowledge (e.g. appeal outcomes, exceptions). "
                "When you do, give the office name, phone, email, and hours if the excerpts include them — never a vague 'contact your advisor.'\n"
                "6. Never say 'the documents don't cover this' and stop. If the excerpts are silent on a specific detail, reason from what is there, state your confidence level, and then give the specific contact if needed.\n"
                "7. Do NOT append a 'Sources:' section — citations are shown separately in the UI.\n"
                "8. If and ONLY IF the answer requires a concrete action (a form, deadline, or office visit), "
                "append a JSON block at the very end — after all prose — fenced with ```json:\n"
                "```json\n"
                '{"title": "Short action title", "description": "One-sentence summary", '
                '"actions": [{"label": "Step text", "url": "URL from the policy excerpts above or null if not found", "deadline": "YYYY-MM-DD or null", "office": "Office name"}]}\n'
                "```\n"
                "All action fields except label are optional. For 'url': only use a URL that appears verbatim in the policy excerpts above — never invent or guess a URL. Set to null if no real URL is available. Omit the block entirely for purely informational answers."
            )

            msg = await self._get_anthropic().messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1500,
                system=system,
                messages=[
                    {
                        "role": "user",
                        "content": (
                            f"{risk_context_str}Policy excerpts:\n{context_blocks}\n\nQuestion: {query}"
                        ),
                    }
                ],
            )

            full_text = msg.content[0].text
            action_packet = None
            action_match = re.search(r"```json\s*(.*?)```", full_text, re.DOTALL)
            if action_match:
                try:
                    action_packet = json.loads(action_match.group(1))
                    prose = (full_text[: action_match.start()].rstrip() + full_text[action_match.end() :].lstrip()).strip()
                except json.JSONDecodeError:
                    prose = full_text
            else:
                prose = full_text

            citations = [
                {
                    "n": i + 1,
                    "heading": c["section_heading"],
                    "url": c["page_url"],
                    "fetched_at": (
                        c["fetched_at"].isoformat() if c["fetched_at"] else None
                    ),
                }
                for i, c in enumerate(chunks)
            ]
            for i, d in enumerate(dynamic_docs):
                citations.append({
                    "n": base + i + 1,
                    "heading": None,
                    "url": d["url"],
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                })

            return {
                "answer": prose,
                "citations": citations,
                "action_packet": action_packet,
            }
        except Exception as e:
            logging.getLogger("uvicorn").error(f"RAG service error: {e}")
            return {
                "answer": (
                    "The academic policy database is temporarily offline or the API quota has been exceeded. "
                    "Please try again later."
                ),
                "citations": [],
                "action_packet": None,
            }

    # ── Streaming generation ──────────────────────────────────────────────────

    async def stream_answer(
        self,
        query: str,
        school_id: uuid.UUID,
        school_name: str,
        session: AsyncSession,
        risk_id: uuid.UUID | None = None,
    ) -> AsyncGenerator[dict, None]:
        """Yield SSE-compatible dicts: {type:'text', text} chunks then a final {type:'done'} payload."""
        _log = logging.getLogger("uvicorn")

        chunks_exist_result = await session.execute(
            select(DocChunk.id).where(DocChunk.school_id == school_id).limit(1)
        )
        if not chunks_exist_result.scalar():
            yield {
                "type": "done",
                "final_text": (
                    "No policy documents have been ingested for this school yet. "
                    "Ask an admin to submit a policy URL first."
                ),
                "citations": [],
                "action_packet": None,
            }
            return

        try:
            chunks = await self.search(query, school_id, session)
            if not chunks:
                yield {
                    "type": "done",
                    "final_text": (
                        "No policy documents have been ingested for this school yet. "
                        "Ask an admin to submit a policy URL first."
                    ),
                    "citations": [],
                    "action_packet": None,
                }
                return

            # Dynamic subpage fetch (best-effort)
            dynamic_docs: list[dict] = []
            try:
                from app.models.school import School as SchoolModel
                school_row = (await session.execute(
                    select(SchoolModel).where(SchoolModel.id == school_id)
                )).scalar_one_or_none()
                if school_row and school_row.financial_aid_url:
                    links = await self._discover_links(school_row.financial_aid_url)
                    if links:
                        top_urls = await self._select_relevant_urls(query, links, school_name)
                        for url in top_urls:
                            try:
                                html = await self._fetch(url)
                                _, sections = self._parse(html)
                                text = "\n\n".join(s["text"] for s in sections if s["text"].strip())
                                if text:
                                    dynamic_docs.append({"url": url, "text": text[:3000]})
                            except Exception:
                                continue
            except Exception:
                pass

            # Retrieve risk context if provided
            risk_context_str = ""
            if risk_id:
                from app.models.risk_event import RiskEvent
                result = await session.execute(
                    select(RiskEvent).where(RiskEvent.id == risk_id)
                )
                event = result.scalar_one_or_none()
                if event:
                    packet = event.action_packet_json or {}
                    risk_context_str = (
                        f"Student Risk Context:\n"
                        f"- Active Risk: {packet.get('title', event.risk_type)}\n"
                        f"- Description: {packet.get('description', '')}\n"
                        f"- Severity: {event.severity.value if hasattr(event.severity, 'value') else event.severity}\n"
                        f"- Context Evidence: {json.dumps(event.context_json or {})}\n"
                        f"- Suggested Action Steps:\n"
                    )
                    for action in packet.get("actions", []):
                        risk_context_str += f"  * {action.get('label')} (Due: {action.get('deadline')}, Office: {action.get('office')})\n"
                    risk_context_str += "\n"

            context_blocks = "\n\n".join(
                f"[{i + 1}] {c['section_heading'] or '(no heading)'}\n{c['chunk_text']}\nSource: {c['page_url']}"
                for i, c in enumerate(chunks)
            )
            base = len(chunks)
            if dynamic_docs:
                context_blocks += "\n\n" + "\n\n".join(
                    f"[{base + i + 1}] (live page)\n{d['text']}\nSource: {d['url']}"
                    for i, d in enumerate(dynamic_docs)
                )

            system = (
                f"You are a knowledgeable academic advisor for {school_name}. "
                "Your job is to help students understand their financial aid and academic policies. "
                "You have been given policy excerpts below. Use them as your primary source, but reason like an advisor — not a search engine.\n\n"
                "How to answer:\n"
                "1. Lead with what you know. Start with the most directly relevant policy information from the excerpts.\n"
                "2. Reason from evidence. If the exact answer is not stated but can be inferred from related policy, say so clearly. "
                "Distinguish inferences from stated facts: use 'Based on the SAP policy...' or 'This suggests...' for inferences.\n"
                "3. Be specific and actionable. Name exact thresholds, deadlines, offices, and form names when available. "
                "Write for a stressed undergraduate — no jargon, no hedging.\n"
                "4. Use inline citation markers like [1] or [2] immediately after any fact drawn from an excerpt.\n"
                "5. Only defer to an advisor for decisions that require individual case knowledge. "
                "When you do, give the office name, phone, email, and hours if the excerpts include them — never a vague 'contact your advisor.'\n"
                "6. Never say 'the documents don't cover this' and stop. If the excerpts are silent on a specific detail, reason from what is there, state your confidence level, and then give the specific contact if needed.\n"
                "7. Do NOT append a 'Sources:' section — citations are shown separately in the UI.\n"
                "8. If and ONLY IF the answer requires a concrete action (a form, deadline, or office visit), "
                "append a JSON block at the very end — after all prose — fenced with ```json:\n"
                "```json\n"
                '{"title": "Short action title", "description": "One-sentence summary", '
                '"actions": [{"label": "Step text", "url": "URL from the policy excerpts above or null if not found", "deadline": "YYYY-MM-DD or null", "office": "Office name"}]}\n'
                "```\n"
                "All action fields except label are optional. For 'url': only use a URL that appears verbatim in the policy excerpts above — never invent or guess a URL. Set to null if no real URL is available. Omit the block entirely for purely informational answers."
            )

            full_text = ""
            async with self._get_anthropic().messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=1500,
                system=system,
                messages=[{
                    "role": "user",
                    "content": f"{risk_context_str}Policy excerpts:\n{context_blocks}\n\nQuestion: {query}",
                }],
            ) as stream:
                async for text in stream.text_stream:
                    full_text += text
                    yield {"type": "text", "text": text}

            # Strip JSON block from prose and parse action_packet
            action_packet = None
            prose = full_text
            action_match = re.search(r"```json\s*(.*?)```", full_text, re.DOTALL)
            if action_match:
                try:
                    action_packet = json.loads(action_match.group(1))
                    prose = (full_text[: action_match.start()].rstrip() + full_text[action_match.end() :].lstrip()).strip()
                except json.JSONDecodeError:
                    pass

            citations = [
                {
                    "n": i + 1,
                    "heading": c["section_heading"],
                    "url": c["page_url"],
                    "fetched_at": c["fetched_at"].isoformat() if c["fetched_at"] else None,
                }
                for i, c in enumerate(chunks)
            ]
            for i, d in enumerate(dynamic_docs):
                citations.append({
                    "n": base + i + 1,
                    "heading": None,
                    "url": d["url"],
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                })

            yield {
                "type": "done",
                "final_text": prose,
                "citations": citations,
                "action_packet": action_packet,
            }

        except Exception as e:
            _log.error(f"RAG streaming error: {e}")
            yield {
                "type": "error",
                "message": (
                    "The academic policy database is temporarily offline or the API quota has been exceeded. "
                    "Please try again later."
                ),
            }


rag_service = RAGService()

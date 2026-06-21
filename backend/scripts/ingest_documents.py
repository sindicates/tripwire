"""
ingest_documents.py — Create Document and DocChunk rows for each pilot school,
embedding chunk_text via RAGService.embed_chunks().

Safe to re-run: existing Document rows (matched by url) are reused rather than
duplicated; their chunks are replaced.

Usage (from backend/):
    python -m scripts.ingest_documents
"""
from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone

from sqlalchemy import select, delete

sys.path.insert(0, ".")

from app.database import AsyncSessionLocal
from app.models.document import Document, DocChunk
from app.models.school import School
from app.services.rag import RAGService

# ---------------------------------------------------------------------------
# Documents to ingest — one list entry per (school, url) pair.
# Each entry may have multiple chunks, but here each has exactly one.
# ---------------------------------------------------------------------------

DOCS: list[dict] = [
    {
        "school_name": "University of California, Berkeley",
        "url": "https://financialaid.berkeley.edu/apply-now/apply-for-aid/fafsa-completion-overview/",
        "title": "FAFSA Completion Overview",
        "chunks": [
            {
                "chunk_text": (
                    "To be considered for on-time financial aid at UC Berkeley, students must complete "
                    "the FAFSA by the California priority deadline. For the 2026–27 aid year, that "
                    "priority deadline is March 2, 2026."
                ),
                "section_heading": "FAFSA Timeline At a Glance",
            },
        ],
    },
    {
        "school_name": "University of California, Berkeley",
        "url": "https://registrar.berkeley.edu/wp-content/uploads/UCB_AcademicCalendar_2026-27_a11y.pdf",
        "title": "2026-27 Academic Calendar",
        "chunks": [
            {
                "chunk_text": (
                    "UC Berkeley's Fall 2026 semester officially begins on Wednesday, August 19, 2026. "
                    "Instruction begins one week later, on Wednesday, August 26, 2026."
                ),
                "section_heading": "2026 Fall Semester",
            },
        ],
    },
    {
        "school_name": "University of Nevada, Reno",
        "url": "https://www.unr.edu/admissions/records/academic-calendar",
        "title": "Academic Calendar",
        "chunks": [
            {
                "chunk_text": (
                    "The final day to add or swap classes without permission from an instructor for "
                    "Fall 2026 is Friday, August 28, 2026. Adding or swapping after this date requires "
                    "instructor permission, with a final hard deadline of Wednesday, September 2, 2026."
                ),
                "section_heading": "Fall 2026 Academic Calendar",
            },
        ],
    },
    {
        "school_name": "University of Pennsylvania",
        "url": "https://srfs.upenn.edu/policies/satisfactory-academic-progress",
        "title": "Satisfactory Academic Progress (SAP) Policy",
        "chunks": [
            {
                "chunk_text": (
                    "Federal regulations require that students maintain Satisfactory Academic Progress "
                    "to remain eligible for Title IV federal student aid programs, including Pell Grants, "
                    "Federal Work-Study, and Direct Loans. These standards govern eligibility for federal "
                    "programs specifically and do not replace each school's own academic standing regulations."
                ),
                "section_heading": "Satisfactory Academic Progress (SAP) Policy",
            },
        ],
    },
    {
        "school_name": "Case Western Reserve University",
        "url": "https://case.edu/financialaid/resources/satisfactory-academic-progress-policy-for-undergraduates",
        "title": "Financial Aid Satisfactory Academic Progress for Undergraduate Students",
        "chunks": [
            {
                "chunk_text": (
                    "CWRU reviews the academic progress of every student who applies for or receives "
                    "financial assistance at the end of each term of enrollment, including the summer "
                    "session. Full-time undergraduates must complete at least 67 percent of attempted "
                    "credit hours with a term GPA of 2.00 or higher to demonstrate steady progress."
                ),
                "section_heading": "Satisfactory Academic Progress",
            },
        ],
    },
]


async def ingest() -> None:
    async with AsyncSessionLocal() as db:
        rag = RAGService(db)
        now = datetime.now(timezone.utc)

        # Build school name → id map
        rows = (await db.execute(select(School))).scalars().all()
        school_map = {s.name: s.id for s in rows}
        missing = {d["school_name"] for d in DOCS} - set(school_map)
        if missing:
            print(f"  ERROR: schools not found in DB: {missing}")
            print("  Run scripts/seed_demo_data.py first.")
            return

        for spec in DOCS:
            school_id = school_map[spec["school_name"]]

            # Upsert Document — match on url
            doc = (await db.execute(
                select(Document).where(Document.url == spec["url"])
            )).scalar_one_or_none()

            if doc is None:
                doc = Document(school_id=school_id, url=spec["url"])
                db.add(doc)
                await db.flush()  # populate doc.id
                action = "+"
            else:
                action = "="
                # Drop existing chunks so we can replace them cleanly
                await db.execute(delete(DocChunk).where(DocChunk.document_id == doc.id))

            doc.title = spec["title"]
            doc.chunk_count = len(spec["chunks"])
            doc.last_fetched_at = now
            await db.flush()

            # Embed all chunk texts in one batch call
            texts = [c["chunk_text"] for c in spec["chunks"]]
            print(f"  {action} [{spec['school_name']}] {spec['title']!r} — embedding {len(texts)} chunk(s)…")
            vectors = await rag.embed_chunks(texts)

            for chunk_spec, vector in zip(spec["chunks"], vectors):
                db.add(DocChunk(
                    document_id=doc.id,
                    school_id=school_id,
                    chunk_text=chunk_spec["chunk_text"],
                    section_heading=chunk_spec["section_heading"],
                    page_url=spec["url"],
                    embedding=vector,
                    fetched_at=now,
                ))

        await db.commit()
        print("\nDone.")


if __name__ == "__main__":
    asyncio.run(ingest())

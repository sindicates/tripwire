import pytest
import pytest_asyncio
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool
from sqlalchemy import text, select

from app.database import engine
from app.models.school import School
from app.models.document import Document, DocChunk
from app.services.rag import rag_service

# pytest-asyncio auto-detection
pytestmark = pytest.mark.asyncio

# Create a test-specific engine
test_engine = create_async_engine(engine.url, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)

@pytest_asyncio.fixture(autouse=True, scope="function")
async def clean_database():
    temp_engine = create_async_engine(engine.url, poolclass=NullPool)
    async with temp_engine.begin() as conn:
        if "sqlite" in str(engine.url):
            await conn.execute(text("DELETE FROM alerts;"))
            await conn.execute(text("DELETE FROM risk_events;"))
            await conn.execute(text("DELETE FROM doc_chunks;"))
            await conn.execute(text("DELETE FROM students;"))
            await conn.execute(text("DELETE FROM documents;"))
            await conn.execute(text("DELETE FROM schools;"))
        else:
            await conn.execute(text("TRUNCATE TABLE alerts, risk_events, doc_chunks, students, documents, schools CASCADE;"))
    await temp_engine.dispose()

async def test_rag_search_calls_openai_and_performs_vector_query():
    # 1. Prepare database entities
    async with TestSessionLocal() as session:
        school = School(
            name="Antigravity Test School",
            ipeds_id="111111",
            scorecard_id="222",
            doc_ingestion_status="complete"
        )
        session.add(school)
        await session.flush()
        
        doc = Document(
            school_id=school.id,
            url="https://example.edu/sap-policy",
            title="SAP Policy",
            chunk_count=1
        )
        session.add(doc)
        await session.flush()
        
        # Insert a chunk with a known embedding [1.0, 0.0, ...]
        test_emb = [0.0] * 1536
        test_emb[0] = 1.0  # Unit vector pointing along first axis
        
        chunk = DocChunk(
            document_id=doc.id,
            school_id=school.id,
            chunk_text="Satisfactory Academic Progress requires maintaining a 2.0 GPA floor.",
            embedding=test_emb,
            section_heading="SAP Policy Introduction",
            page_url="https://example.edu/sap-policy",
            fetched_at=datetime.now(timezone.utc)
        )
        session.add(chunk)
        await session.commit()
        school_id = school.id

    # 2. Mock OpenAI embeddings client
    mock_embedding_data = MagicMock()
    mock_embedding_data.embedding = [0.0] * 1536
    mock_embedding_data.embedding[0] = 1.0  # Query vector identical to chunk embedding
    
    mock_response = MagicMock()
    mock_response.data = [mock_embedding_data]
    
    mock_embeddings_create = AsyncMock(return_value=mock_response)
    
    mock_openai_client = MagicMock()
    mock_openai_client.embeddings.create = mock_embeddings_create
    
    # 3. Perform RAG search under mock
    with patch.object(rag_service, "_get_openai", return_value=mock_openai_client):
        async with TestSessionLocal() as session:
            results = await rag_service.search(
                query="What is the SAP GPA floor?",
                school_id=school_id,
                session=session,
                top_k=5
            )
            
            # Verify OpenAI embeddings API was called correctly
            mock_embeddings_create.assert_called_once_with(
                model="text-embedding-3-small",
                input=["What is the SAP GPA floor?"]
            )
            
            # Verify result matches our chunk and score is calculated
            assert len(results) == 1
            assert results[0]["chunk_text"] == "Satisfactory Academic Progress requires maintaining a 2.0 GPA floor."
            assert results[0]["page_url"] == "https://example.edu/sap-policy"
            # Since similarity is 1.0 and recency is 1.0, weighted score is 1.0
            assert results[0]["score"] == pytest.approx(1.0)

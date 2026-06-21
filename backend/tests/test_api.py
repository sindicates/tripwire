import pytest
import pytest_asyncio
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import engine, get_db
from sqlalchemy import text
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# This is required for pytest-asyncio to auto-detect async tests
pytestmark = pytest.mark.asyncio

# Create a test-specific engine with NullPool to prevent connection reuse issues
test_engine = create_async_engine(engine.url, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)

async def override_get_db():
    async with TestSessionLocal() as session:
        yield session

# Override the database dependency in FastAPI
app.dependency_overrides[get_db] = override_get_db

@pytest_asyncio.fixture(autouse=True, scope="function")
async def clean_database():
    # Use a separate temporary engine to clean the database and dispose of it immediately
    temp_engine = create_async_engine(engine.url, poolclass=NullPool)
    async with temp_engine.begin() as conn:
        await conn.execute(text("TRUNCATE TABLE alerts, risk_events, doc_chunks, students, documents, schools CASCADE;"))
    await temp_engine.dispose()

@pytest.mark.asyncio
async def test_health_check():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

@pytest.mark.asyncio
async def test_schools_crud():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. List schools (should be empty)
        response = await ac.get("/api/v1/schools/")
        assert response.status_code == 200
        assert response.json() == []

        # 2. Create school
        school_data = {
            "name": "Antigravity University",
            "ipeds_id": "123456",
            "scorecard_id": "987"
        }
        response = await ac.post("/api/v1/schools/", json=school_data)
        assert response.status_code == 201
        created_school = response.json()
        assert created_school["name"] == "Antigravity University"
        assert created_school["ipeds_id"] == "123456"
        assert created_school["scorecard_id"] == "987"
        assert created_school["doc_ingestion_status"] == "pending"
        school_id = created_school["id"]

        # 3. List schools (should have 1)
        response = await ac.get("/api/v1/schools/")
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.json()[0]["id"] == school_id

        # 4. Get school details
        response = await ac.get(f"/api/v1/schools/{school_id}")
        assert response.status_code == 200
        assert response.json()["name"] == "Antigravity University"

        # 5. Update school details
        update_data = {
            "name": "Antigravity State University",
            "scorecard_id": "999"
        }
        response = await ac.put(f"/api/v1/schools/{school_id}", json=update_data)
        assert response.status_code == 200
        updated_school = response.json()
        assert updated_school["name"] == "Antigravity State University"
        assert updated_school["scorecard_id"] == "999"
        assert updated_school["ipeds_id"] == "123456"  # unmodified

        # 6. Trigger ingestion status change
        response = await ac.post(f"/api/v1/schools/{school_id}/ingest")
        assert response.status_code == 200
        assert response.json()["doc_ingestion_status"] == "in_progress"

        # 7. Get invalid school (404)
        random_id = str(uuid.uuid4())
        response = await ac.get(f"/api/v1/schools/{random_id}")
        assert response.status_code == 404

@pytest.mark.asyncio
async def test_auth_and_students():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Create school first
        school_data = {"name": "Test School"}
        res = await ac.post("/api/v1/schools/", json=school_data)
        school_id = res.json()["id"]

        # 1. Register student
        student_data = {
            "email": "test@student.edu",
            "password": "securepassword123",
            "school_id": school_id
        }
        response = await ac.post("/api/v1/auth/register", json=student_data)
        assert response.status_code == 201
        token_res = response.json()
        assert "access_token" in token_res
        token = token_res["access_token"]

        # 2. Register duplicate email (should fail 409)
        response = await ac.post("/api/v1/auth/register", json=student_data)
        assert response.status_code == 409

        # 3. Login student
        login_data = {
            "username": "test@student.edu",
            "password": "securepassword123"
        }
        response = await ac.post("/api/v1/auth/login", data=login_data)
        assert response.status_code == 200
        login_token = response.json()["access_token"]

        # 4. Login with invalid password (401)
        bad_login_data = {
            "username": "test@student.edu",
            "password": "wrongpassword"
        }
        response = await ac.post("/api/v1/auth/login", data=bad_login_data)
        assert response.status_code == 401

        # 5. Access student me profile (authenticated)
        headers = {"Authorization": f"Bearer {login_token}"}
        response = await ac.get("/api/v1/students/me", headers=headers)
        assert response.status_code == 200
        profile = response.json()
        assert profile["email"] == "test@student.edu"
        assert profile["school_id"] == school_id
        student_id = profile["id"]

        # 6. Access student me profile with bad token (401)
        bad_headers = {"Authorization": "Bearer badtoken123"}
        response = await ac.get("/api/v1/students/me", headers=bad_headers)
        assert response.status_code == 401

        # 7. Update profile
        update_data = {
            "gpa": 3.85,
            "credits_completed": 45,
            "credits_required": 120,
            "major": "Computer Science"
        }
        response = await ac.put("/api/v1/students/me", json=update_data, headers=headers)
        assert response.status_code == 200
        updated_profile = response.json()
        assert updated_profile["gpa"] == 3.85
        assert updated_profile["credits_completed"] == 45
        assert updated_profile["credits_required"] == 120
        assert updated_profile["major"] == "Computer Science"

        # 8. Refresh Token
        response = await ac.post("/api/v1/auth/refresh", headers=headers)
        assert response.status_code == 200
        refreshed_token = response.json()["access_token"]
        assert refreshed_token != ""

        # 9. Get student profile by ID
        response = await ac.get(f"/api/v1/students/{student_id}")
        assert response.status_code == 200
        assert response.json()["email"] == "test@student.edu"

        # 10. Get non-existent student (404)
        response = await ac.get(f"/api/v1/students/{uuid.uuid4()}")
        assert response.status_code == 404

@pytest.mark.asyncio
async def test_risk_scan_and_events():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Create school and student
        school_res = await ac.post("/api/v1/schools/", json={"name": "Test School"})
        school_id = school_res.json()["id"]
        
        student_res = await ac.post("/api/v1/auth/register", json={
            "email": "gpa_drop@student.edu",
            "password": "testpassword",
            "school_id": school_id
        })
        token = student_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        profile_res = await ac.get("/api/v1/students/me", headers=headers)
        student_id = profile_res.json()["id"]

        # Run scan on fresh student (no data, should have 0 events)
        scan_res = await ac.post(f"/api/v1/students/{student_id}/scan")
        assert scan_res.status_code == 200
        assert scan_res.json() == []

        # Let's list student risk events
        events_res = await ac.get(f"/api/v1/students/{student_id}/risk-events")
        assert events_res.status_code == 200
        assert events_res.json() == []

        # Let's list student alerts
        alerts_res = await ac.get(f"/api/v1/students/{student_id}/alerts")
        assert alerts_res.status_code == 200
        assert alerts_res.json() == []

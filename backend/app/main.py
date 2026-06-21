import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

from app.config import settings
from app.routers import alerts, auth, chat, documents, risk_events, schools, students

app = FastAPI(title="Tripwire API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(students.router, prefix="/api/v1")
app.include_router(schools.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(risk_events.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}

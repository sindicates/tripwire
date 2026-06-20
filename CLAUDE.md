# Tripwire — Agent Context

When you implement a major feature, add a short section at the bottom of this file so future agents (and teammates) have clearer context on what was built, where it lives, and any DB/env changes that came with it.

---

## Overview

Tripwire is a proactive academic risk monitor for college students. It watches a student's GPA, credit pace, aid package, and administrative deadlines, then surfaces the exact action needed — grounded in that school's own policy documents — before a crisis materializes. The core loop: **Sense → Predict → Retrieve → Act**.

---

## 1. The problem

- **Aid blindsides** — students lose scholarships without knowing they were close to the threshold.
- **Deadline black holes** — SAP appeals, FAFSA renewals, and add/drop windows pass silently.
- **Credential friction** — first-gen students don't know what questions to ask an advisor.
- **Policy opacity** — financial aid handbooks are 40-page PDFs; the answer is in there but no one reads them.

Insight: this is a navigation problem. Students need proactive direction, not a chatbot they have to think to ask.

---

## 2. Product overview

Tripwire monitors in the background and surfaces risk before the student has to ask. When a threshold is crossed (GPA drifting toward aid floor, credit pace falling behind, FAFSA window opening), it retrieves the school's own policy document, synthesizes it with Claude, and delivers a plain-language action packet: the exact form, deadline, and office. It does not give generic advice. Every answer is cited to the school's live policy page.

Three surfaces: web dashboard (Next.js), mobile app (Expo), and push/SMS notifications.

---

## 3. Core features

**Dashboard (web + mobile)** — Credit completion timeline vs. required pace, risk event feed (severity-coded), aid status panel, projected graduation date.

**Chat Q&A** — RAG-grounded answers from the school's ingested docs. Every response cites the source page and last-verified date. No hallucinated thresholds.

**Action Center** — Each risk event expands to an action packet: exact form name, direct URL, deadline countdown, office contact. One-click "Mark as done" closes the loop.

**Proactive Scheduler** — Celery beat task runs nightly at 02:00 UTC. Evaluates risk rules per student. Calls Claude only when a rule fires — not per student per night. Delivers email/SMS/in-app notification.

**Onboarding** — School search via College Scorecard API (6,000+ institutions), GPA/credits wizard, aid package entry, degree audit PDF upload.

---

## 4. Tech stack

| Layer | Technology |
|---|---|
| Backend API | Python 3.11 / FastAPI, SQLAlchemy async (asyncpg) |
| Task queue | Celery + Redis |
| Database | PostgreSQL 16 + pgvector extension |
| AI reasoning | `claude-sonnet-4-6` (Anthropic) |
| Embeddings | `text-embedding-3-small` (OpenAI), 1536 dims |
| Web frontend | Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui |
| Mobile | Expo SDK 52, Expo Router v4, TypeScript |
| Notifications | SendGrid (email) + Twilio (SMS) |
| Doc storage | S3 / Cloudflare R2 |
| External data | College Scorecard API, IPEDS CSV downloads |
| Deployment | Railway/Render (backend), Vercel (web), EAS (mobile) |

---

## 5. Codebase and conventions

### Env & config

- `backend/.env` holds all backend secrets; loaded by `app/config.py` via `pydantic-settings`.
- `frontend/.env.local` holds `NEXT_PUBLIC_API_URL`.
- `mobile/.env` holds `EXPO_PUBLIC_API_URL` (use LAN IP on physical device, not `localhost`).
- `backend/app/config.py` — single `Settings` class; import `settings` from here everywhere, never `os.environ` directly.

### AI

- `backend/app/services/rag.py` — `RAGService`: embed query → pgvector cosine search filtered by `school_id` → re-rank by recency × cosine → pass top-5 chunks to Claude. **Never call Claude for policy questions without first retrieving chunks.**
- `backend/app/services/risk_engine.py` — `RiskEngine`: deterministic rule evaluation per student, calls `RAGService` to build action packets when a rule fires.
- Claude system prompt lives in `risk_engine.py` / `rag.py` — structured as: school name, risk description, student snapshot (GPA/credits/aid), retrieved chunks with source metadata, response format (plain-language + exact action + urgency + citations).

### Data & backend

- SQLAlchemy models: `backend/app/models/` — one file per table (`school`, `student`, `document` + `DocChunk`, `risk_event`, `alert`).
- `document.py` contains both `Document` and `DocChunk`. `DocChunk.embedding` is `Vector(1536)` — pgvector must be enabled before `alembic upgrade head`.
- `RiskEvent.severity` is a Python `str` enum: `"info"` / `"warn"` / `"urgent"`.
- `context_json` stores the raw evidence (GPA value, threshold crossed); `action_packet_json` stores the `ActionPacket` shape (title, description, actions list with url + deadline).
- Alembic migrations: `backend/migrations/`. After changing a model, run `alembic revision --autogenerate -m "description"` then `alembic upgrade head`. New model files must be imported in `migrations/env.py` or they won't be detected.

### Task scheduler

- `backend/celery_app.py` — Celery app init + beat schedule. Nightly scan task fires at `crontab(hour=2, minute=0)` UTC. Task body is a stub (`pass`) — implement by calling `RiskEngine.scan_all()`.
- Both `celery worker` and `celery beat` must be running. Beat emits the task message; worker consumes it. Running only one does nothing silently.

### Document ingestion

- Ingestion flow: URL submitted → Playwright/BeautifulSoup fetches page → chunk at 400 tokens / 50-token overlap, preserve section headings → embed via `text-embedding-3-small` → upsert to `doc_chunks` with `school_id`.
- `school_id` is on every `doc_chunks` row and **must appear in every vector query WHERE clause**. Without it, a student at School A gets answers from School B's policy.
- Chunks fetched > 14 days ago are considered stale and queued for re-ingestion.

### Routing

- File-based routing in `frontend/app/` (Next.js App Router). Groups: `(auth)`, `dashboard`, `chat`, `actions`, `onboarding`.
- File-based routing in `mobile/app/` (Expo Router). Groups: `(auth)`, `(tabs)` — tabs are: Dashboard / Ask / Actions.
- All API routes: `http://localhost:8000/api/v1/<resource>`. Registered in `backend/app/main.py`.

### TypeScript types

- `frontend/types/index.ts` and `mobile/types/index.ts` define the same domain interfaces. **Keep them in sync manually** when you change a model or add a field. Key types: `Student`, `School`, `Document`, `DocChunk`, `RiskEvent` (with `RiskType` + `Severity` enums), `Alert` (with `Channel` enum), `ActionPacket`, `ActionItem`.

### Auth (not yet implemented)

- JWT, HS256, signed with `SECRET_KEY` from `config.py`.
- Dependency `get_current_student` (to be created in `app/dependencies.py`) will be used in all protected routes.
- Header: `Authorization: Bearer <token>`.

---

## 6. Risk rules

Risk types are defined as string constants matching `RiskType` enum in `frontend/types/index.ts`. Each rule needs: `risk_type`, signal field, threshold, severity, cooldown window. Current list (none implemented yet):

| risk_type | Signal | Threshold | Severity | Cooldown |
|---|---|---|---|---|
| `gpa_drop` | `student.gpa` | < retention floor | urgent | 30d |
| `credit_deficit` | credits_completed / credits_required | < 67% (SAP pace) | warn | 14d |
| `aid_risk` | GPA + pace combo | Below aid eligibility | urgent | 30d |
| `deadline_miss` | Policy deadline proximity | < 7 days | warn | 1d |
| `academic_probation` | GPA on probation | < 2.0 | urgent | 30d |
| `satisfactory_academic_progress` | Cumulative pace | < school-specific % | warn | 14d |

When adding a rule: add constant to `risk_engine.py`, add enum value to both `types/index.ts` files, write a test in `backend/tests/test_risk_engine.py`, update this table.

---

## 7. Monetization (planned)

- **Subscription** — $15–25/mo for full risk monitoring + chat.
- **School partnerships** — white-labeled version for financial aid offices and advising centers.
- **B2B ingestion** — charge schools for managed doc ingestion and admin portal.

---

## 8. Local dev quick start

```bash
# First time
cp backend/.env.example backend/.env       # fill in ANTHROPIC_API_KEY, OPENAI_API_KEY, SECRET_KEY
cp frontend/.env.local.example frontend/.env.local
docker compose up -d
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head

# Daily (5 terminals)
docker compose up -d                                            # T1: infra
uvicorn app.main:app --reload                                   # T2: API  → :8000
celery -A celery_app worker -l info                             # T3: worker
celery -A celery_app beat -l info                               # T4: beat
cd frontend && npm run dev                                       # T5: web  → :3000

# Mobile (when needed)
cd mobile && npx expo start                                     # Expo Go / simulator
```

**Required keys for local dev:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SECRET_KEY`. Everything else (Twilio, SendGrid, S3) can be left blank until you reach Phase 2 notifications or doc storage.

---

<!-- ─────────────────────────────────────────────────────────────────
     FEATURE LOG — add a section here each time a major feature lands
     ──────────────────────────────────────────────────────────────── -->

## Feature log

*No features implemented yet. When you ship something, add a section below following the pattern above (what it does, where it lives, any new env vars or DB migrations).*

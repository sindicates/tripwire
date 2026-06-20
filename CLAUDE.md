# Tripwire — Agent Context

## 1. Repo orientation

Tripwire is a proactive academic risk monitoring system for college students. The core loop is **Sense → Predict → Retrieve → Act**: the system ingests a student's GPA, credits, aid package, and degree-audit data (Sense), runs nightly rule-based and LLM-powered evaluation against that student's school-specific policies (Predict), retrieves the relevant policy text from a pgvector RAG store (Retrieve), and generates a prioritized action packet delivered via email, SMS, or in-app notification before a deadline passes (Act). The end user is an enrolled college student who may be at risk of losing financial aid, falling below satisfactory academic progress thresholds, or missing a critical administrative deadline — Tripwire catches these before advisors do.

---

## 2. Monorepo layout

```
tripwire/
├── backend/                        FastAPI + SQLAlchemy async + Celery
│   ├── app/
│   │   ├── config.py               pydantic-settings; reads backend/.env
│   │   ├── database.py             async engine, AsyncSessionLocal, Base, get_db()
│   │   ├── main.py                 FastAPI app, CORS, all 6 routers at /api/v1
│   │   ├── models/                 SQLAlchemy ORM models (one file per table)
│   │   │   ├── school.py
│   │   │   ├── student.py
│   │   │   ├── document.py         Document + DocChunk (pgvector)
│   │   │   ├── risk_event.py
│   │   │   └── alert.py
│   │   ├── routers/                APIRouter stubs (endpoints are comments)
│   │   │   ├── auth.py             /api/v1/auth
│   │   │   ├── students.py         /api/v1/students
│   │   │   ├── schools.py          /api/v1/schools
│   │   │   ├── documents.py        /api/v1/documents
│   │   │   ├── risk_events.py      /api/v1/risk-events
│   │   │   └── alerts.py           /api/v1/alerts
│   │   └── services/               Business logic stubs (implement here)
│   │       ├── rag.py              RAGService: embed, search, answer
│   │       ├── risk_engine.py      RiskEngine: scan_student, scan_all, build_action_packet
│   │       └── notifications.py    NotificationService: email, SMS, in-app
│   ├── celery_app.py               Celery init + nightly_risk_scan beat task (02:00 UTC)
│   ├── migrations/                 Alembic async env; imports all models
│   ├── alembic.ini
│   ├── pyproject.toml              requires-python = ">=3.11"
│   └── .env.example
│
├── frontend/                       Next.js 14 App Router  →  http://localhost:3000
│   ├── app/
│   │   ├── layout.tsx              Root layout, Inter font
│   │   ├── page.tsx                Redirects / → /dashboard
│   │   ├── (auth)/login/           Login page stub
│   │   ├── (auth)/register/        Register page stub
│   │   ├── dashboard/              Risk overview stub
│   │   ├── chat/                   RAG chat stub
│   │   ├── actions/                Action packets stub
│   │   └── onboarding/             Multi-step onboarding stub
│   ├── types/index.ts              TypeScript interfaces for all 6 models + ActionPacket
│   ├── lib/utils.ts                cn() helper (clsx + tailwind-merge)
│   ├── components.json             shadcn/ui config (style: default, baseColor: slate)
│   ├── tailwind.config.ts          CSS-variable color mapping for shadcn
│   └── .env.local.example
│
├── mobile/                         Expo SDK 52 + Expo Router v4
│   ├── app/
│   │   ├── _layout.tsx             Root Stack, no header
│   │   ├── index.tsx               Auth-gate redirect → login
│   │   ├── (auth)/                 Login + Register screens
│   │   ├── (tabs)/                 Bottom tabs: Dashboard / Ask / Actions
│   │   └── onboarding.tsx
│   ├── constants/colors.ts         Light/dark tokens (mirrors CSS variables)
│   ├── lib/api.ts                  Axios client; reads EXPO_PUBLIC_API_URL; JWT stubs
│   ├── types/index.ts              Same domain types as frontend (kept in sync manually)
│   └── .env.example
│
├── docker-compose.yml
│   ├── postgres  ankane/pgvector:latest  →  localhost:5432  DB: tripwire
│   └── redis     redis:7-alpine          →  localhost:6379
│
└── Makefile                        make setup bootstraps the entire stack
```

---

## 3. Local dev setup

### Prerequisites

| Tool | Min version | Verify |
|---|---|---|
| Python | 3.11 | `python3 --version` |
| Node.js | 18 | `node --version` |
| npm | 9 | `npm --version` |
| Docker Desktop | 4.x | `docker --version` |
| Docker Compose | v2 (bundled) | `docker compose version` |

Playwright Chromium is installed automatically by `make setup`.

### First-time setup (run once)

```bash
# 1. Bootstrap all deps in one shot (creates backend/.venv, installs npm deps, installs Playwright Chromium)
make setup

# 2. Copy and fill in environment files
cp backend/.env.example backend/.env       # fill in API keys — see §4 for required vs optional
cp frontend/.env.local.example frontend/.env.local
cp mobile/.env.example mobile/.env

# 3. Start infrastructure
docker compose up -d

# 4. Run database migrations (requires docker compose to be up and healthy)
source backend/.venv/bin/activate
cd backend
alembic upgrade head
cd ..

# 5. (Optional) Verify the API is importable
cd backend && python -c "from app.main import app; print('OK')"
```

> **pgvector must be enabled before alembic upgrade head.** The `ankane/pgvector` image pre-enables it, so this is already handled — but if you swap to a plain postgres image you must run `CREATE EXTENSION IF NOT EXISTS vector;` manually first.

### Daily dev start

Open **5 terminal windows**:

```bash
# Terminal 1 — Infrastructure (skip if already running)
docker compose up -d

# Terminal 2 — FastAPI
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload
# → http://localhost:8000  Swagger: http://localhost:8000/docs

# Terminal 3 — Celery worker
cd backend && source .venv/bin/activate
celery -A celery_app worker -l info

# Terminal 4 — Celery beat scheduler (nightly scans)
cd backend && source .venv/bin/activate
celery -A celery_app beat -l info

# Terminal 5 — Next.js frontend
cd frontend && npm run dev
# → http://localhost:3000
```

Mobile (when needed):

```bash
# Terminal 6 — Expo
cd mobile && npx expo start
# Scan QR with Expo Go app; on physical device set EXPO_PUBLIC_API_URL to your LAN IP
# macOS LAN IP: ipconfig getifaddr en0
```

---

## 4. Environment variables

### `backend/.env`

| Variable | Used by | How to get | Required locally |
|---|---|---|---|
| `DATABASE_URL` | SQLAlchemy, Alembic | Default `postgresql+asyncpg://postgres:postgres@localhost:5432/tripwire` matches docker-compose | Yes (default works) |
| `REDIS_URL` | Celery broker + backend | Default `redis://localhost:6379/0` matches docker-compose | Yes (default works) |
| `ANTHROPIC_API_KEY` | RiskEngine (Claude) | console.anthropic.com → API Keys | Yes (for risk scan) |
| `OPENAI_API_KEY` | RAGService (embeddings via `text-embedding-3-small`) | platform.openai.com → API keys | Yes (for RAG) |
| `COLLEGE_SCORECARD_API_KEY` | School metadata lookup | api.data.gov/signup | No |
| `SENDGRID_API_KEY` | NotificationService email | sendgrid.com → Settings → API Keys | No |
| `TWILIO_ACCOUNT_SID` | NotificationService SMS | twilio.com console | No |
| `TWILIO_AUTH_TOKEN` | NotificationService SMS | twilio.com console | No |
| `TWILIO_PHONE_NUMBER` | NotificationService SMS | twilio.com console | No |
| `AWS_ACCESS_KEY_ID` | S3 document storage | IAM console | No |
| `AWS_SECRET_ACCESS_KEY` | S3 document storage | IAM console | No |
| `AWS_REGION` | S3 | Default `us-east-1` | No |
| `S3_BUCKET_NAME` | S3 | Your bucket name | No |
| `SECRET_KEY` | JWT signing | Any long random string; `openssl rand -hex 32` | Yes |
| `ENVIRONMENT` | Feature flags / CORS strictness | `development` or `production` | Yes (default works) |
| `ALLOWED_ORIGINS` | CORS middleware | Comma-separated list, e.g. `http://localhost:3000` | Yes (default works) |

### `frontend/.env.local`

| Variable | Used by | How to get | Required locally |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Axios base URL | `http://localhost:8000` for local dev | Yes |

### `mobile/.env`

| Variable | Used by | How to get | Required locally |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | Axios base URL | `http://localhost:8000` for simulator; LAN IP for physical device | Yes |

---

## 5. Architecture decisions

- **RAG over fine-tuning** → school policy documents (SAP rules, catalog text, financial aid handbooks) change every semester. Fine-tuning would require a retraining cycle per policy update. RAG lets us re-ingest a URL and have fresh embeddings within minutes. Do not attempt to encode policy thresholds in model weights.

- **Per-school `school_id` filter on every vector query** → `doc_chunks.school_id` must be included in every `WHERE` clause when doing similarity search. Without it, a student at University A receives answers grounded in University B's GPA rules. This is not just a quality issue — it can produce legally incorrect guidance about a student's specific aid package.

- **Claude called per triggered risk event, not per student per night** → the nightly scan first evaluates cheap deterministic rules (GPA < threshold, credits_completed < pace formula) and only calls Claude when a rule fires. Calling Claude for every student every night would make the per-student cost prohibitive at scale. Do not move Claude into the outer scan loop.

- **pgvector over Pinecone for MVP** → pgvector colocates vector search with the relational data in the same Postgres instance, eliminating a network hop and a separate managed service. The `ankane/pgvector` Docker image has the extension pre-installed. Switch to Pinecone only when the chunk count exceeds ~1M rows and query latency becomes measurable.

- **Celery + Redis over plain cron** → Celery gives retry semantics (exponential backoff on transient failures), a task result backend for inspecting what ran and what failed, and the ability to trigger one-off tasks via `.delay()` from API endpoints. A raw cron job gives none of these. Do not replace Celery with a systemd timer or cloud scheduler unless you also implement retry logic.

- **asyncpg driver with SQLAlchemy async** → the FastAPI event loop must not block on DB I/O. All DB calls use `await`. Never call synchronous SQLAlchemy methods (`.execute()` without `await`) inside an async route; they will silently deadlock the event loop under load.

---

## 6. Data model quick reference

### `schools`
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default uuid4 |
| `name` | VARCHAR | NOT NULL |
| `ipeds_id` | VARCHAR | nullable |
| `scorecard_id` | VARCHAR | nullable |
| `doc_ingestion_status` | VARCHAR | default `"pending"` |
| `last_ingested_at` | TIMESTAMPTZ | nullable |

`schools` → `students` (one-to-many), `schools` → `documents` (one-to-many)

### `students`
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default uuid4 |
| `email` | VARCHAR | UNIQUE NOT NULL |
| `school_id` | UUID | FK → `schools.id` NOT NULL |
| `major` | VARCHAR | nullable |
| `enrollment_year` | INTEGER | nullable |
| `gpa` | FLOAT | nullable |
| `credits_completed` | INTEGER | nullable |
| `credits_required` | INTEGER | nullable |
| `aid_package_json` | JSON | nullable |
| `degree_audit_json` | JSON | nullable |
| `created_at` | TIMESTAMPTZ | server_default now() |
| `updated_at` | TIMESTAMPTZ | server_default now(), onupdate now() |

`students` → `risk_events` (one-to-many), `students` → `alerts` (one-to-many)

### `documents`
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default uuid4 |
| `school_id` | UUID | FK → `schools.id` NOT NULL |
| `url` | VARCHAR | NOT NULL |
| `title` | VARCHAR | nullable |
| `doc_type` | VARCHAR | nullable (`"catalog"`, `"sap_policy"`, `"financial_aid"`) |
| `raw_text` | TEXT | nullable |
| `chunk_count` | INTEGER | default 0 |
| `last_fetched_at` | TIMESTAMPTZ | nullable |

### `doc_chunks` (pgvector table)
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default uuid4 |
| `document_id` | UUID | FK → `documents.id` NOT NULL |
| `school_id` | UUID | FK → `schools.id` NOT NULL |
| `chunk_text` | TEXT | NOT NULL |
| `embedding` | VECTOR(1536) | nullable ← pgvector; dimension matches `text-embedding-3-small` |
| `section_heading` | VARCHAR | nullable |
| `page_url` | VARCHAR | nullable |
| `fetched_at` | TIMESTAMPTZ | nullable |

### `risk_events`
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default uuid4 |
| `student_id` | UUID | FK → `students.id` NOT NULL |
| `risk_type` | VARCHAR | NOT NULL (see `RiskType` enum) |
| `severity` | ENUM | `"info"` \| `"warn"` \| `"urgent"` NOT NULL |
| `predicted_at` | TIMESTAMPTZ | server_default now() |
| `resolved_at` | TIMESTAMPTZ | nullable |
| `context_json` | JSON | nullable (raw evidence: GPA value, threshold, policy excerpt) |
| `action_packet_json` | JSON | nullable (`ActionPacket` shape) |

`risk_events` → `alerts` (one-to-many)

### `alerts`
| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default uuid4 |
| `student_id` | UUID | FK → `students.id` NOT NULL |
| `risk_event_id` | UUID | FK → `risk_events.id` NOT NULL |
| `channel` | ENUM | `"email"` \| `"sms"` \| `"in-app"` NOT NULL |
| `sent_at` | TIMESTAMPTZ | server_default now() |
| `opened_at` | TIMESTAMPTZ | nullable |

---

## 7. API conventions

**Base URL:** `http://localhost:8000/api/v1`

**Auth header:** `Authorization: Bearer <access_token>` on all protected routes. Tokens are JWTs signed with `SECRET_KEY` (HS256 via python-jose). Attach via the `get_current_student` dependency in `app/dependencies.py` (not yet created).

**Response envelope:** No standard envelope yet. Routes return Pydantic response models directly. When you add pagination, adopt: `{ "items": [...], "total": N, "page": P, "page_size": S }`.

**Error shape (FastAPI default):**
```json
{ "detail": "Human-readable error message" }
```
For validation errors FastAPI returns `422` with a structured `detail` array — do not override this.

**SSE (streaming) endpoints:** Not yet implemented. When adding the chat streaming endpoint, use FastAPI's `StreamingResponse` with `media_type="text/event-stream"` and emit `data: <json>\n\n` lines. The frontend should consume via the `EventSource` API. `ALLOWED_ORIGINS` must include the frontend origin or the browser will block the SSE connection silently.

**Planned routes (all stubs today):**

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Issue JWT pair |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke refresh token |
| GET | `/students/me` | Authenticated student profile |
| PUT | `/students/me` | Update GPA, credits, audit, aid |
| GET | `/students/{id}/risk-events` | List risk events for a student |
| GET | `/students/{id}/alerts` | List alerts for a student |
| GET | `/schools` | List all schools |
| POST | `/schools` | Create school |
| GET | `/schools/{id}` | Fetch school |
| PUT | `/schools/{id}` | Update school metadata |
| POST | `/schools/{id}/ingest` | Trigger doc ingestion |
| GET | `/documents` | List documents (filter by `school_id`) |
| POST | `/documents` | Register URL for ingestion |
| GET | `/documents/{id}` | Fetch metadata + chunk count |
| DELETE | `/documents/{id}` | Remove document and chunks |
| GET | `/documents/{id}/chunks` | List chunks |
| GET | `/risk-events` | List (filter by `student_id`, `severity`) |
| POST | `/risk-events` | Manually create risk event |
| GET | `/risk-events/{id}` | Single event with action packet |
| PUT | `/risk-events/{id}/resolve` | Mark resolved |
| GET | `/alerts` | List (filter by `student_id`, `channel`) |
| POST | `/alerts` | Dispatch alert for a risk event |
| GET | `/alerts/{id}` | Single alert |
| PUT | `/alerts/{id}/open` | Mark opened |

---

## 8. Feature ownership map

| Feature | Backend router | Frontend page | Service class | Status |
|---|---|---|---|---|
| Onboarding | `auth.py`, `students.py` | `app/onboarding/` | — | not started |
| Dashboard | `risk_events.py`, `students.py` | `app/dashboard/` | `RiskEngine` | not started |
| Chat Q&A | `documents.py` (SSE endpoint TBD) | `app/chat/` | `RAGService` | not started |
| Action Center | `risk_events.py`, `alerts.py` | `app/actions/` | `NotificationService` | not started |
| Proactive Scheduler | `celery_app.py` beat task | — | `RiskEngine` | not started |
| Doc Ingestion | `schools.py`, `documents.py` | — | `RAGService` | not started |

---

## 9. Implementation phases & current status

### Phase 1 — MVP (weeks 1–3)

- [ ] `alembic revision --autogenerate -m "init"` — generate initial migration
- [ ] `app/dependencies.py` — `get_current_student` FastAPI dependency
- [ ] `routers/auth.py` — register, login, refresh, logout endpoints
- [ ] `routers/students.py` — `GET /students/me`, `PUT /students/me`
- [ ] `routers/schools.py` — CRUD + ingest trigger
- [ ] `routers/documents.py` — CRUD + chunk listing
- [ ] `RAGService.embed_chunks()` — call OpenAI `text-embedding-3-small`, batch 100 chunks
- [ ] `RAGService.search()` — pgvector cosine similarity, filter by `school_id`, top-5
- [ ] `RAGService.answer()` — assemble context + call Claude, return answer string
- [ ] `routers/risk_events.py` — list, create, fetch, resolve
- [ ] `routers/alerts.py` — list, dispatch, fetch, mark opened
- [ ] Frontend: login + register pages wired to `/auth` endpoints
- [ ] Frontend: onboarding flow (school picker → GPA/credits entry → aid package upload)
- [ ] Frontend: dashboard rendering `RiskEvent` cards with severity badges

### Phase 2 — Agentic Loop (weeks 4–5)

- [ ] `RiskEngine.scan_student()` — deterministic rule checks (GPA, SAP pace, credits)
- [ ] `RiskEngine.build_action_packet()` — call Claude with retrieved policy chunks, return `ActionPacket`
- [ ] `celery_app.nightly_risk_scan` — iterate all students, call `scan_student`, persist events
- [ ] `NotificationService.send_email()` — SendGrid integration
- [ ] `NotificationService.send_sms()` — Twilio integration
- [ ] `NotificationService.send_in_app()` — store + SSE push
- [ ] Frontend: chat page with SSE streaming + citation rendering
- [ ] Frontend: action center with per-item priority sorting
- [ ] Mobile: login, dashboard, chat, actions screens wired to API

### Phase 3 — Scale (weeks 6–8)

- [ ] Per-school ingestion scheduler (re-fetch policy docs on configurable cadence)
- [ ] Risk rule cooldown enforcement (`cooldown_days` per rule type)
- [ ] Admin panel: multi-student view, bulk risk scan trigger
- [ ] Mobile: secure token storage via `expo-secure-store`
- [ ] Mobile: push notifications via Expo Notifications
- [ ] Load test: 1 000 students through nightly scan, < 5 min wall time
- [ ] Postgres: add HNSW index on `doc_chunks.embedding` for sub-10ms vector search
- [ ] Alerting: Celery failure webhook → Slack / PagerDuty

---

## 10. Adding a new risk rule

1. **Define the rule constant** in `backend/app/services/risk_engine.py`. Each rule is a dict (or dataclass):
   ```python
   RULES = [
       {
           "risk_type": "gpa_drop",          # must match a RiskType enum value
           "signal": "student.gpa",           # dot-path into student data
           "threshold": 2.0,                  # trigger when signal falls below this
           "severity": "urgent",              # "info" | "warn" | "urgent"
           "cooldown_days": 30,               # don't re-fire for the same student within N days
       },
   ]
   ```

2. **Add the risk type to the TypeScript enum** in `frontend/types/index.ts` and `mobile/types/index.ts` (both files must stay in sync):
   ```typescript
   export enum RiskType {
     GPA_DROP = "gpa_drop",
     // ... add your new value here
   }
   ```

3. **Write the test** in `backend/tests/test_risk_engine.py` (file to be created). Create a mock student with the signal value just above and just below the threshold; assert that `scan_student()` returns an event in the below case and nothing in the above case.

4. **Update the risk rules table** in this CLAUDE.md under §10 with the new rule's `risk_type`, threshold, severity, and cooldown.

**Current rules (target list — none implemented yet):**

| risk_type | Signal | Threshold | Severity | Cooldown |
|---|---|---|---|---|
| `gpa_drop` | `student.gpa` | < 2.0 | urgent | 30 days |
| `credit_deficit` | credits_completed / credits_required | < SAP pace (67%) | warn | 14 days |
| `aid_risk` | GPA + pace combo | Below aid eligibility floor | urgent | 30 days |
| `deadline_miss` | Upcoming policy deadline | < 7 days away | warn | 1 day |
| `academic_probation` | `gpa` after SAP violation | GPA < 2.0 on probation | urgent | 30 days |
| `satisfactory_academic_progress` | Cumulative pace | < school-specific % | warn | 14 days |

---

## 11. Adding a new API route

1. **Add the route handler** to the correct file in `backend/app/routers/`. Follow existing commented stubs. Use `Depends(get_db)` for the session and `Depends(get_current_student)` for auth:
   ```python
   @router.get("/{id}", response_model=MyResponseSchema)
   async def get_thing(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
       ...
   ```

2. **Add Pydantic schemas** for request and response. Create `backend/app/schemas/` if it doesn't exist yet. Keep request and response schemas separate (`MyCreate`, `MyResponse`).

3. **Register any new service method** in the appropriate service class in `backend/app/services/`. Update the stub signature and implement the body.

4. **Add the TypeScript interface** to `frontend/types/index.ts` and mirror it in `mobile/types/index.ts`.

5. **Add a fetch function** to `frontend/lib/api.ts` (create this file if it doesn't exist yet):
   ```typescript
   import axios from "axios"
   const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL })
   export const getMyThing = (id: string) => api.get(`/my-things/${id}`)
   ```

6. **Update the planned routes table** in §7 of this CLAUDE.md to mark the route as implemented.

---

## 12. RAG pipeline — end to end

1. **School admin submits a URL** via `POST /api/v1/schools/{id}/ingest`. The endpoint enqueues a Celery task with the URL and `school_id`.

2. **Celery worker fetches the document.** If the URL returns HTML, Playwright (Chromium headless) renders and extracts text via BeautifulSoup. If the URL is a PDF, pdfplumber extracts text page by page.

3. **Text is chunked** at 400 tokens with 50-token overlap. Each chunk retains `section_heading` and `page_url` metadata.

4. **Chunks are embedded** in batches of 100 via `openai.embeddings.create(model="text-embedding-3-small", input=[...])`. This produces 1536-dimensional float vectors.

5. **Chunks are upserted** into `doc_chunks` with their `embedding`, `school_id`, `document_id`, `section_heading`, and `page_url`. The `documents.chunk_count` and `last_fetched_at` are updated.

6. **At query time** (chat or risk scan), `RAGService.search(query, school_id, top_k=5)` runs:
   ```sql
   SELECT chunk_text, section_heading, page_url,
          1 - (embedding <=> $query_vector) AS cosine_similarity
   FROM   doc_chunks
   WHERE  school_id = $school_id
   ORDER  BY embedding <=> $query_vector
   LIMIT  5;
   ```
   Results are re-ranked by `cosine_similarity × recency_weight` where `recency_weight = 1 / (1 + days_since_fetched)`.

7. **Claude is called** with a structured prompt:
   ```
   System: You are an academic advisor assistant. Answer using ONLY the provided policy excerpts.
           Always cite the section heading and URL for each claim.
           If the excerpts do not contain enough information, say so explicitly.

   User: [student question or risk context]

   Policy excerpts:
   [1] <section_heading> (<page_url>): <chunk_text>
   [2] ...
   ```

8. **The response** is returned to the caller (API route or risk engine) with the cited chunks included so the frontend can render inline citations.

> Never call Claude for a policy question without first retrieving chunks. Hallucinated policy thresholds are a trust-destroying failure mode.

---

## 13. Common pitfalls

- **pgvector extension must exist before migrations.** The `ankane/pgvector` Docker image pre-enables it. If you see `type "vector" does not exist` from Alembic, connect to Postgres and run `CREATE EXTENSION IF NOT EXISTS vector;`.

- **Both Celery worker and Celery beat must be running** for scheduled tasks to fire. Beat emits the task message; worker consumes it. Running only one terminal will silently do nothing.

- **`ALLOWED_ORIGINS` must include the exact frontend origin.** `http://localhost:3000` ≠ `http://localhost:3000/`. A trailing slash or wrong port causes CORS to block all requests, including SSE — and the browser console shows a generic network error, not a CORS error.

- **`school_id` filter is mandatory on every vector query.** Omitting it causes answers to bleed across schools. The `RAGService.search()` signature enforces `school_id` as a required parameter — never call `search()` without it.

- **Never call Claude without RAG context for policy questions.** Claude does not know your school's specific SAP thresholds, GPA requirements, or aid eligibility floors. Always pass retrieved chunks in the prompt.

- **`migrations/env.py` imports all models.** If you add a new model file, import it in `migrations/env.py` or Alembic will not detect the table and will generate empty migrations.

- **`updated_at` requires an explicit `onupdate` trigger.** SQLAlchemy's `server_default=func.now()` only fires on INSERT. The `onupdate=func.now()` on `students.updated_at` handles UPDATE. If you add new timestamped models, include both.

- **Expo physical device testing requires LAN IP, not `localhost`.** `localhost` on a phone resolves to the phone itself. Set `EXPO_PUBLIC_API_URL=http://192.168.x.x:8000` and find your IP with `ipconfig getifaddr en0` (macOS).

- **`pip install -e .` vs `requirements.txt`.** The Makefile uses `requirements.txt` (generated from `pyproject.toml`). If you add a dependency, add it to `pyproject.toml` and regenerate: `pip-compile pyproject.toml -o requirements.txt` (or just add to both manually for now).

---

## 14. Git conventions

**Branch naming:**
- `feature/<short-description>` — new functionality
- `fix/<short-description>` — bug fixes
- `chore/<short-description>` — deps, config, CI, docs

**Commit message format:**
```
<type>: <imperative present-tense summary under 72 chars>

<optional body: why, not what — link issue numbers here>
```
Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`

**PR checklist before requesting review:**
- [ ] `alembic upgrade head` runs clean on a fresh DB
- [ ] `backend/.env.example` updated if new env vars were added
- [ ] `frontend/types/index.ts` and `mobile/types/index.ts` are in sync
- [ ] This CLAUDE.md updated if architecture or routes changed
- [ ] No hardcoded secrets or API keys in diff

**Reviewer assignments:** TBD

---

## 15. Useful one-liners

```bash
# Generate a new Alembic migration after model changes
cd backend && source .venv/bin/activate && alembic revision --autogenerate -m "describe change"

# Apply all pending migrations
cd backend && source .venv/bin/activate && alembic upgrade head

# Roll back one migration
cd backend && source .venv/bin/activate && alembic downgrade -1

# Trigger a manual risk scan for one student (once task body is implemented)
cd backend && source .venv/bin/activate && python -c "
from celery_app import celery_app
celery_app.send_task('celery_app.nightly_risk_scan')
"

# Re-ingest documents for one school (once ingest endpoint is implemented)
curl -X POST http://localhost:8000/api/v1/schools/<school_id>/ingest \
  -H "Authorization: Bearer <token>"

# Flush all Redis data (clears Celery queues and results — destructive)
docker compose exec redis redis-cli FLUSHALL

# Connect to local Postgres with psql
docker compose exec postgres psql -U postgres -d tripwire

# Inspect Celery task queue depth
docker compose exec redis redis-cli LLEN celery

# List all active Celery workers
cd backend && source .venv/bin/activate && celery -A celery_app inspect active

# Count doc chunks per school
docker compose exec postgres psql -U postgres -d tripwire \
  -c "SELECT school_id, COUNT(*) FROM doc_chunks GROUP BY school_id;"

# Check API health
curl http://localhost:8000/health
```

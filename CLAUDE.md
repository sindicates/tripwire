# Tripwire — Agent Context

Tripwire is a proactive academic risk monitoring system. It watches a student's GPA, credits, aid package, and degree audit against their school's published policies (ingested via RAG), then surfaces risk events and action packets before deadlines pass.

---

## Monorepo layout

```
tripwire/
├── backend/          FastAPI + SQLAlchemy async + Celery
├── frontend/         Next.js 14 App Router
├── mobile/           Expo SDK 52 + Expo Router v4
└── docker-compose.yml  postgres (pgvector) + redis
```

---

## Running the stack

```bash
# Infrastructure
docker compose up -d          # postgres:5432, redis:6379

# Backend  (from backend/)
cp .env.example .env          # fill in keys
pip install -e .
uvicorn app.main:app --reload  # http://localhost:8000
# Migrations
alembic revision --autogenerate -m "describe change"
alembic upgrade head
# Celery (separate terminals)
celery -A celery_app worker -l info
celery -A celery_app beat -l info

# Frontend  (from frontend/)
cp .env.local.example .env.local
npm install
npm run dev                   # http://localhost:3000

# Mobile  (from mobile/)
cp .env.example .env
npm install
npx expo start                # scan QR with Expo Go
# Physical device: set EXPO_PUBLIC_API_URL to your LAN IP, not localhost
```

---

## Backend

### Key files

| File | Purpose |
|---|---|
| `app/config.py` | `Settings` (pydantic-settings); reads `.env`; singleton `settings` |
| `app/database.py` | Async SQLAlchemy engine, `AsyncSessionLocal`, `Base`, `get_db()` dependency |
| `app/main.py` | FastAPI app, CORS, all 6 routers mounted at `/api/v1`, `/health` |
| `celery_app.py` | Celery init, Redis broker, `nightly_risk_scan` beat task (runs 02:00 UTC) |
| `migrations/env.py` | Alembic async env; imports all models; reads `DATABASE_URL` from `.env` |

### Config fields (`app/config.py` → `settings`)

```python
settings.DATABASE_URL        # postgresql+asyncpg://...
settings.REDIS_URL
settings.ANTHROPIC_API_KEY
settings.OPENAI_API_KEY
settings.COLLEGE_SCORECARD_API_KEY
settings.SENDGRID_API_KEY
settings.TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER
settings.AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / S3_BUCKET_NAME
settings.SECRET_KEY          # JWT signing
settings.ENVIRONMENT         # "development" | "production"
settings.ALLOWED_ORIGINS     # list[str], comma-separated in .env
```

### Database session pattern

```python
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends
from app.database import get_db

async def some_endpoint(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Student).where(Student.id == student_id))
    student = result.scalar_one_or_none()
```

### Data models (`app/models/`)

All PKs are `uuid.UUID`, `default=uuid.uuid4`. All timestamps are `DateTime(timezone=True)`.

#### `School` (`schools`)
```
id            UUID PK
name          str  NOT NULL
ipeds_id      str | None
scorecard_id  str | None
doc_ingestion_status  str  default="pending"
last_ingested_at      datetime | None
→ students: list[Student]
→ documents: list[Document]
```

#### `Student` (`students`)
```
id                UUID PK
email             str  UNIQUE NOT NULL
school_id         UUID FK → schools.id
major             str | None
enrollment_year   int | None
gpa               float | None
credits_completed int | None
credits_required  int | None
aid_package_json  JSON | None
degree_audit_json JSON | None
created_at        datetime  server_default=now()
updated_at        datetime  server_default=now(), onupdate=now()
→ school: School
→ risk_events: list[RiskEvent]
→ alerts: list[Alert]
```

#### `Document` (`documents`)
```
id             UUID PK
school_id      UUID FK → schools.id
url            str  NOT NULL
title          str | None
doc_type       str | None   (e.g. "catalog", "sap_policy", "financial_aid")
raw_text       Text | None
chunk_count    int  default=0
last_fetched_at datetime | None
→ school: School
→ chunks: list[DocChunk]
```

#### `DocChunk` (`doc_chunks`)  — pgvector table
```
id              UUID PK
document_id     UUID FK → documents.id
school_id       UUID FK → schools.id
chunk_text      Text NOT NULL
embedding       Vector(1536) | None   ← pgvector column
section_heading str | None
page_url        str | None
fetched_at      datetime | None
→ document: Document
```

#### `RiskEvent` (`risk_events`)
```
id               UUID PK
student_id       UUID FK → students.id
risk_type        str  NOT NULL   (free-form, see RiskType enum in types/)
severity         Enum("info","warn","urgent") NOT NULL
predicted_at     datetime  server_default=now()
resolved_at      datetime | None
context_json     JSON | None   (raw evidence that triggered the event)
action_packet_json JSON | None  (ActionPacket shape, see TypeScript types)
→ student: Student
→ alerts: list[Alert]
```

#### `Alert` (`alerts`)
```
id            UUID PK
student_id    UUID FK → students.id
risk_event_id UUID FK → risk_events.id
channel       Enum("email","sms","in-app") NOT NULL
sent_at       datetime  server_default=now()
opened_at     datetime | None
→ student: Student
→ risk_event: RiskEvent
```

### Routers (`app/routers/`) — all mounted at `/api/v1`

Each file contains only a `router = APIRouter(...)` and commented-out route stubs. Implement routes here.

| File | Prefix | Tags |
|---|---|---|
| `auth.py` | `/auth` | auth |
| `students.py` | `/students` | students |
| `schools.py` | `/schools` | schools |
| `documents.py` | `/documents` | documents |
| `risk_events.py` | `/risk-events` | risk_events |
| `alerts.py` | `/alerts` | alerts |

Planned routes are listed as comments inside each file.

### Services (`app/services/`) — empty stubs, implement here

| Class | File | Purpose |
|---|---|---|
| `RAGService` | `rag.py` | Embed chunks, vector search, answer queries over school docs |
| `RiskEngine` | `risk_engine.py` | Scan student data vs policy docs, emit `RiskEvent` rows |
| `NotificationService` | `notifications.py` | Send via SendGrid (email), Twilio (SMS), in-app |

### Auth conventions (not yet implemented)
- JWT via `python-jose` / `passlib[bcrypt]`
- `SECRET_KEY` from settings
- Recommended: `Authorization: Bearer <token>` header
- Attach student identity to request via a `get_current_student` dependency in `app/dependencies.py` (file not yet created)

---

## Frontend (Next.js 14 App Router)

### Key files

| Path | Purpose |
|---|---|
| `app/layout.tsx` | Root layout, Inter font, global CSS |
| `app/page.tsx` | Redirects `/` → `/dashboard` |
| `app/(auth)/login/page.tsx` | Login page stub |
| `app/(auth)/register/page.tsx` | Register page stub |
| `app/dashboard/page.tsx` | Risk overview dashboard stub |
| `app/chat/page.tsx` | RAG chat interface stub |
| `app/actions/page.tsx` | Action packets list stub |
| `app/onboarding/page.tsx` | Multi-step onboarding stub |
| `types/index.ts` | TypeScript interfaces for all 6 models + ActionPacket |
| `lib/utils.ts` | `cn()` helper (clsx + tailwind-merge) |
| `components.json` | shadcn/ui init config (style: default, cssVariables: true) |

### Adding shadcn components
```bash
cd frontend
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
# etc. — components land in frontend/components/ui/
```

### API client pattern
```typescript
// Recommended: create frontend/lib/api.ts
import axios from "axios"

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
})
export default api
```

`NEXT_PUBLIC_API_URL` is set in `.env.local` (copy from `.env.local.example`).

### Tailwind / CSS variables
`globals.css` defines full shadcn CSS variable set for light + dark mode. `tailwind.config.ts` maps those variables to Tailwind color names (`bg-background`, `text-foreground`, `border-border`, etc.).

---

## Mobile (Expo SDK 52 + Expo Router v4)

### Key files

| Path | Purpose |
|---|---|
| `app/_layout.tsx` | Root Stack, no header |
| `app/index.tsx` | Auth-gate redirect (stub — always → login for now) |
| `app/(auth)/_layout.tsx` | Auth Stack |
| `app/(auth)/login.tsx` | Login screen stub |
| `app/(auth)/register.tsx` | Register screen stub |
| `app/(tabs)/_layout.tsx` | Bottom tab bar: Dashboard / Ask / Actions |
| `app/(tabs)/index.tsx` | Dashboard tab stub |
| `app/(tabs)/chat.tsx` | Chat tab stub |
| `app/(tabs)/actions.tsx` | Actions tab stub |
| `app/onboarding.tsx` | Onboarding screen stub |
| `constants/colors.ts` | Light/dark color tokens (mirrors CSS variables) |
| `lib/api.ts` | Axios client; reads `EXPO_PUBLIC_API_URL`; JWT interceptor stubs |
| `types/index.ts` | Same domain types as frontend |

### Env vars
- `EXPO_PUBLIC_API_URL` — prefix is required for Expo to expose to client bundle
- On physical device testing: use LAN IP, not `localhost`

### Navigation conventions
- Expo Router file-based routing mirrors Next.js App Router
- Route groups `(auth)` and `(tabs)` do not appear in the URL/path
- `Redirect` component used in `index.tsx` for auth-gating

---

## TypeScript types (`frontend/types/index.ts` and `mobile/types/index.ts`)

Both files are identical. Key shapes:

```typescript
enum Severity   { INFO="info", WARN="warn", URGENT="urgent" }
enum Channel    { EMAIL="email", SMS="sms", IN_APP="in-app" }
enum RiskType   { GPA_DROP, CREDIT_DEFICIT, AID_RISK, DEADLINE_MISS, ... }

interface ActionItem  { type, label, url?, deadline?, priority: "low"|"medium"|"high" }
interface ActionPacket { title, description, actions: ActionItem[] }
interface RiskEvent   { ..., severity: Severity, action_packet_json: ActionPacket | null }
interface Alert       { ..., channel: Channel }
```

---

## Infrastructure (`docker-compose.yml`)

| Service | Image | Port | Notes |
|---|---|---|---|
| postgres | `ankane/pgvector:latest` | 5432 | pgvector extension pre-installed; DB: `tripwire` |
| redis | `redis:7-alpine` | 6379 | Celery broker + result backend |

Both services have healthchecks. Postgres data persists in `postgres_data` volume.

---

## What is NOT implemented yet (implement these)

- All router endpoints (stubs only — see comments in each router file)
- JWT auth (`app/dependencies.py`, `routers/auth.py`)
- `RAGService`: document fetching (Playwright/pdfplumber), chunking, OpenAI embedding, pgvector upsert
- `RiskEngine`: policy parsing, risk scoring logic, Anthropic-powered reasoning
- `NotificationService`: SendGrid + Twilio integration
- `nightly_risk_scan` Celery task body
- Frontend: all UI components, API calls, auth state management
- Mobile: all UI components, secure token storage (`expo-secure-store`), auth state
- Alembic initial migration (run `alembic revision --autogenerate -m "init"` once Postgres is up)

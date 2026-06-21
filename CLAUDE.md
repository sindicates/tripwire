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

- **Single `.env` at the repo root** holds all variables for every service. Copy once: `cp .env.example .env`.
- `frontend/.env.local` and `mobile/.env` are symlinks pointing to `../.env` — created automatically by `make setup`. Never edit them directly.
- `backend/app/config.py` reads `("../.env", ".env")` — root first, local fallback. Always `cd backend` before running uvicorn/celery/alembic so the relative path resolves correctly.
- Import `settings` from `app.config` everywhere in the backend; never read `os.environ` directly.

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
cp .env.example .env                         # fill in ANTHROPIC_API_KEY, OPENAI_API_KEY, SECRET_KEY
make setup                                   # or: python -m venv backend/.venv && pip install -r requirements.txt
docker compose up -d
source backend/.venv/bin/activate && cd backend && alembic upgrade head

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

### RAG Pipeline (2026-06-20)

**What it does:** Full ingest → retrieve → generate loop for school policy documents.

- **Ingest** (`POST /api/v1/documents/ingest`) — fetches a URL with httpx + BeautifulSoup, strips nav/footer noise, chunks at 400 tokens / 50-token overlap preserving section headings, embeds with `text-embedding-3-small`, upserts to `doc_chunks` tagged with `school_id`.
- **Query** (`POST /api/v1/chat/query`) — embeds the question, runs cosine similarity search via pgvector comparator (`.cosine_distance()`) scoped to `school_id`, re-ranks top-15 by a weighted score (80% cosine similarity, 20% recency), passes top-5 to Claude which returns a plain-language answer with `Sources:` citations.

**Where it lives:**
- `backend/app/services/rag.py` — `RAGService` (singleton `rag_service`)
- `backend/app/routers/documents.py` — ingest + list + get endpoints
- `backend/app/routers/chat.py` — query endpoint

**New dependencies:** `httpx>=0.27.0`, `tiktoken>=0.8.0` (added to `backend/pyproject.toml`)

**No new DB migrations** — uses existing `documents` and `doc_chunks` tables.

**Required env vars:** `OPENAI_API_KEY` (embeddings), `ANTHROPIC_API_KEY` (generation).

---

### Core Backend — Risk Engine, Auth, CRUD Routers (2026-06-20)

**What it does:** Completes the full backend API surface.

**Risk Engine** (`backend/app/services/risk_engine.py`):
- `scan_student(student_id, session)` / `scan_all(session)` — evaluates 5 rules (`gpa_drop`, `credit_deficit`, `aid_risk`, `academic_probation`, `satisfactory_academic_progress`) per student, respects per-rule cooldown windows, calls RAG to build a school-specific action packet when a rule fires, persists `RiskEvent` rows.
- Nightly scan wired into `celery_app.py` via `asyncio.run()` so async DB layer works inside sync Celery task.
- `deadline_miss` rule is defined but not yet implemented — requires date extraction from policy chunks.

**Auth** (`backend/app/routers/auth.py`, `backend/app/dependencies.py`):
- `POST /auth/register` / `POST /auth/login` / `POST /auth/refresh` — bcrypt passwords, HS256 JWT (24h TTL).
- `get_current_student` dependency in `app/dependencies.py` — used by `/students/me` and `/students/me PUT`.
- **Requires migration**: added `password_hash TEXT` (nullable) to `students` table. Run: `alembic revision --autogenerate -m "add password_hash to students" && alembic upgrade head`.

**Routers implemented:**
- `backend/app/routers/schools.py` — full CRUD + `POST /{id}/ingest` status toggle
- `backend/app/routers/students.py` — `/me` (auth-gated), `/{id}`, `/{id}/risk-events`, `/{id}/alerts`, `/{id}/scan`
- `backend/app/routers/risk_events.py` — list (filterable by student + severity), get, resolve
- `backend/app/routers/alerts.py` — list, dispatch (record-only, no email/SMS yet), get, mark-opened

---

### Chat Page + Action Center (2026-06-21)

**What it does:** Implements the two remaining stub pages as full, production-quality UIs wired to the live backend.

**Chat page** (`frontend/app/chat/page.tsx`):
- Full RAG-grounded Q&A interface. Sends `POST /api/v1/chat/query` with `school_id` + `question`; renders the answer with a `Citations` block (source URL, heading, fetched date).
- Animated message bubbles (user = stone gradient pill, assistant = card with thinking dots).
- Suggested questions grid on empty state. `Enter` to send, `Shift+Enter` for newline.
- Error state surfaced inline (no page crash).

**Action Center page** (`frontend/app/actions/page.tsx`):
- Fetches `GET /api/v1/risk-events/?student_id=<id>` on mount; auto-sorted by severity (urgent → warn → info).
- Severity filter bar; "Resolve" calls `PUT /api/v1/risk-events/<id>/resolve` with optimistic UI update.
- "Action Steps" expands `action_packet_json` inline: numbered steps, deadline badge, office label, direct URL button.
- Loading skeleton, empty state, resolved events collapsible section.

**No new DB migrations or env vars required.**

---

### Interactive Advisor Context & Search-Discovery Agent (2026-06-21)

**What it does:** Wires Dashboard & Action Center cards to the Advisor Chat with pre-seeded context, and implements a multi-category search discovery and crawl agent.

**Advisor Context Routing:**
- Added a "Talk to Advisor" button to both the **Dashboard** Risk Card (`frontend/app/dashboard/page.tsx`) and the **Action Center** expand card (`frontend/app/actions/page.tsx`).
- These buttons route the student to `/chat?risk_id=<risk_event_id>`.
- **Advisor Chat Page** (`frontend/app/chat/page.tsx`) detects `risk_id` URL param, fetches the specific `RiskEvent`, and initializes the chat with a customized greeting showing the risk title, description, and suggested action steps.
- **FastAPI /query Endpoint & RAGService** (`backend/app/routers/chat.py` & `backend/app/services/rag.py`): Accepts optional `risk_id` in payload, loads the risk details, and prepends a detailed `Student Risk Context` block to the system context so Claude is fully grounded in the specific academic risk during Q&A.

**Search-Discovery Agent** (`backend/scripts/discover_and_ingest.py`):
- Automated script to discover policies for academic notice/probation and deadlines/calendars in addition to financial aid/SAP.
- Performs targeted searches per category, filters domains to matching `.edu` sites, leverages Claude to rank/select the top 3-5 most relevant seed URLs, and crawls/ingests them into `doc_chunks`.

**No new DB migrations. Optional `TAVILY_API_KEY` env var added to enable live searches in discovery script.**

---

### Fetch.ai uAgent Research Agent (2026-06-21)

**What it does:** Replaces the in-process research step with a standalone Fetch.ai uAgent process that performs autonomous web research when a risk rule fires. The agent receives a `ResearchRequest` (risk type, school name, student snapshot), uses Tavily search and httpx page fetching to find exact form names, deadlines, contact info, and policy excerpts, and returns a structured `ResearchBundle`. The existing Claude synthesis step then converts this bundle into a specific, actionable packet — no more generic "contact your financial aid office" boilerplate.

**Architecture:**
- **uAgent process** (port 8001) — runs Claude tool-use loop with `search_web` + `fetch_page`, returns `ResearchBundle` via REST POST at `/rest/research`
- **FastAPI backend** calls uAgent via HTTP (UAgentClient); if uAgent is down, falls back silently to in-process `ResearchAgent`
- **No change** to Stage 2 (Claude synthesis call) or the risk rule engine

**Where it lives:**
- `backend/app/services/uagent_researcher.py` — Fetch.ai agent definition, message models, research loop
- `backend/app/services/uagent_client.py` — HTTP client for FastAPI → uAgent communication
- `backend/scripts/run_research_agent.py` — entry point to start the agent process
- `backend/app/services/risk_engine.py` — updated `build_action_packet()` with uAgent-first + fallback

**How to start:**
```bash
# Terminal 6 (alongside the existing 5 terminals)
cd backend && python -m scripts.run_research_agent
```

**New dependencies:** `uagents>=0.17.0` (Fetch.ai agent framework)

**New env vars (all have dev defaults):**
- `UAGENT_SEED` — seed phrase for deterministic agent address (default: `sherpa-research-agent-dev`)
- `UAGENT_PORT` — port the agent listens on (default: `8001`)
- `UAGENT_ENDPOINT` — agent endpoint URL (default: `http://localhost:8001/submit`)
- `UAGENT_TIMEOUT` — seconds to wait for research response (default: `45`)

**No new DB migrations required.**

---

## Design system (Sherpa Mountain Theme)

The product was renamed **Sherpa** (from Tripwire). All user-facing text uses "Sherpa". Codebase folder/repo still named `tripwire`.

### Fonts
| Role | Family | Weight |
|---|---|---|
| Headings, stat numbers, card titles, brand | `'Merriweather', serif` | 700 / 900 |
| Body, nav, buttons, labels, descriptions | `'Satoshi', sans-serif` | 400 / 500 / 700 |

Loaded via `<link>` tags in `frontend/app/layout.tsx` (Google Fonts for Merriweather, Fontshare for Satoshi). Do **not** use `next/font` or CSS `@import` for these — the link-tag approach is more reliable across SSR and client hydration.

### Color palette
| Token | Hex | Usage |
|---|---|---|
| `--forest-deep` | `#0f1a10` | Sidebar bg, advisor footer |
| `--forest-dark` | `#152219` | Card bg, page bg top |
| `--forest-mid` | `#1a3320` | Page gradient top |
| `--forest-light` | `#2d6030` | Button gradient end, hover accents |
| `--border` | `#1e3828` | All card/panel borders |
| `--border-hover` | `#2d5230` | Hover border state |
| `--muted` | `#9aafa0` | Secondary text, labels |
| `--stone-primary` | `#b5b0a8` | Primary accent (replaces pink), active nav, outlines |
| `--stone-light` | `#ccc9c2` | Lighter stone, gradient stops |
| `--stone-dark` | `#8a8680` | Darker stone, rgba borders |
| `--slate` | `#252e2a` | Page gradient bottom |
| `--warning` | `#facc15` | Warning severity badges |
| `--success` | `#4ade80` | Safe/active status |

### Key gradients
```css
/* Page background — forest green fading to slate */
background: linear-gradient(180deg, #1a3320 0%, #252e2a 100%);

/* Primary button — opposite direction: stone to vivid green */
background: linear-gradient(135deg, #b5b0a8, #2d6030);

/* Brand wordmark */
background: linear-gradient(to right, #1e5228, #b5b0a8);
```

### Sherpa logo SVG

A React component — use wherever the brand mark is needed (sidebar, auth pages, mobile header, email templates, etc.). Do **not** use the 🏔️ emoji or any other placeholder.

```tsx
function SherpaLogo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Sherpa">
      <path d="M14 3L26 23H2L14 3Z" stroke="#b5b0a8" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M14 3L10.5 11L14 9L17.5 11L14 3Z" fill="#b5b0a8" />
    </svg>
  )
}
```

On light backgrounds swap stroke/fill to `#1e5228` (forest green). On dark backgrounds use `#b5b0a8` (stone) as shown above.

No emojis anywhere in the UI — use Lucide React icons for all iconography (`lucide-react` is installed via shadcn/ui).

### CSS classes (defined in `frontend/app/globals.css`)
- `.nav-brand` — gradient wordmark, Satoshi 700, `-webkit-background-clip: text`
- `.tw-nav-link` / `.tw-nav-link.active` — sidebar nav items; active uses stone accent
- `.tw-btn-primary` — stone→green gradient button, dark text `#111e14`
- `.tw-btn-outline` — stone-bordered transparent button
- `.tw-btn-ghost` — muted text, no border
- `.tw-card` — dark forest card with border and hover shadow
- `.tw-risk-card` — card with colored left border for severity
- `.tw-pill` — suggestion chip, stone hover
- `.tw-fab` — floating action button, stone→green gradient
- `.tw-chat-input:focus` — stone-colored focus ring

---

### Knowledge-Grounded Action Packets (2026-06-21)

**What it does:** Makes Claude's training knowledge the primary source for action packets and chat Q&A, so the product generates specific, actionable output even when university pages are login-gated.

**Risk engine** (`backend/app/services/risk_engine.py`):
- Replaced the two-stage `ResearchAgent → _synthesize` pipeline with a single `_knowledge_action_packet()` call.
- Fetches top-3 pgvector chunks (if any) and passes them alongside the student snapshot + risk type to Claude, which writes the full ActionPacket using its training knowledge of the school.
- Removed dead `_synthesize()` function and `ResearchBundle` import.

**Research agent** (`backend/app/services/research_agent.py`):
- Added `ResearchAgent.knowledge_bundle()` classmethod — single Claude call that fills a `ResearchBundle` from training knowledge (no web access required).
- Wired as the fallback at the end of `research()` instead of `ResearchBundle.empty()`, so the agentverse path also gets substantive output when web crawling fails.

**RAG service** (`backend/app/services/rag.py`):
- Added `_knowledge_system()`, `_knowledge_only_answer()`, and `_stream_knowledge_only()` helpers.
- Replaced the two early "no documents" dead-end returns in `answer()` and `stream_answer()` with calls to these helpers — Claude now answers from training knowledge instead of refusing.
- Added a `knowledge_supplement` string appended to the system prompt when `len(chunks) < 2`, telling Claude to supplement sparse retrieval with its knowledge of the school.

**No new DB migrations or env vars required.**

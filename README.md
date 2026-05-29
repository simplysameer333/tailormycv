# TailorMyCv

AI-powered resume builder that tailors your resume to any job description using a multi-agent pipeline. A Job Analyzer extracts the skills that matter most for the role, a Generator writes the resume, and one or more Evaluator agents score it using profession-specific criteria — the generator refines until quality thresholds are met.

**Stack:** Next.js 14 · FastAPI · MongoDB Atlas · LangGraph 1.2.1 · Anthropic Claude · OpenAI · Google Gemini · Brevo (email)

---

## Project Structure

```
tailormycv/
│
├── backend/
│   ├── main.py                      FastAPI app entry point; mounts all routers; APScheduler lifespan
│   ├── config.py                    Pydantic-settings; all tunable config from .env
│   ├── database.py                  Motor async MongoDB client; TTL indexes on sessions (24h) and GridFS files
│   ├── seed_templates.py            One-time script — upserts 3 prebuilt DOCX templates into MongoDB
│   ├── seed_professions.py          One-time script — upserts initial profession configs into MongoDB
│   │
│   ├── routers/
│   │   ├── auth.py                  POST /api/auth/register, /login, /sync (Google OAuth), /me
│   │   ├── account.py               GET/PUT /api/account/profile — persistent profile
│   │   │                            POST /api/account/profile/resume — upload + AI prefill
│   │   │                            POST /api/sessions/from-profile — one-click tailor
│   │   ├── resume_library.py        CRUD /api/account/resumes — save/rename/delete/download (Plus+)
│   │   ├── resume.py                POST /api/resume/upload — parse PDF/DOCX, create session
│   │   │                            POST /api/resume/sample-format — upload formatting reference CV
│   │   ├── profile.py               POST /api/profile — save session user profile
│   │   │                            GET  /api/profile/prefill — AI-extract profile fields from resume text
│   │   ├── job_description.py       POST /api/job-description — store pasted job description
│   │   ├── jobs.py                  GET /api/jobs/search — JSearch (RapidAPI), cached, Plus+ only
│   │   │                            POST/GET/DELETE /api/jobs/save|saved — save/list/unsave jobs
│   │   │                            GET /api/jobs/quota — monthly usage stats
│   │   ├── job_alerts.py            CRUD /api/jobs/alerts — job alert management (Plus+)
│   │   │                            PATCH /api/jobs/alerts/{id}/toggle — enable/disable alert
│   │   │                            POST /api/jobs/alerts/send-test — trigger test email
│   │   ├── templates.py             GET /api/templates · POST /api/templates/upload
│   │   ├── generate.py              POST /api/generate — full pipeline
│   │   │                            PUT /api/sessions/{id}/resume — sync client resume to session
│   │   │                            PATCH /api/sessions/{id}/template — attach template
│   │   │                            PUT /api/sessions/{id}/locked-facts — save pinned facts
│   │   ├── export.py                POST /api/export · GET /api/download/{id}
│   │   ├── catalog.py               GET /api/catalog/roles?q= · /api/catalog/skills?q= (autocomplete)
│   │   └── professions.py           CRUD /api/professions — profession profile admin
│   │
│   ├── models/
│   │   ├── user.py                  User, UserPublic; tier: free | plus | pro
│   │   ├── job_alert.py             JobAlert model
│   │   ├── session.py               GeneratedResume, UserProfile, EvaluatorResult, EvalCycle, OutputFiles
│   │   └── template.py              Template document model
│   │
│   ├── dependencies/
│   │   └── auth.py                  get_current_user (Bearer dep), require_tier(min_tier) factory dep
│   │
│   └── services/
│       ├── auth_service.py          JWT (python-jose), bcrypt hashing, user CRUD; 24h token expiry
│       ├── resume_parser.py         Extracts text from PDF/DOCX via pdfplumber / python-docx
│       ├── template_service.py      Loads DOCX templates, substitutes {{PLACEHOLDER}} tags
│       ├── file_generator.py        generate_docx (python-docx) + generate_pdf (reportlab)
│       ├── quota_service.py         Monthly JSearch call counter; warning thresholds
│       ├── profession_service.py    MongoDB CRUD + resolve_profession_for_role()
│       ├── alert_scheduler.py       APScheduler daily cron at ALERT_SEND_HOUR UTC
│       ├── email_service.py         Brevo HTTP API — job digest + no-results notification emails
│       ├── storage/                 get_storage() factory → LocalStorageBackend | S3StorageBackend
│       │
│       └── pipeline/               LangGraph evaluator-optimizer pipeline
│           ├── graph.py             StateGraph definition
│           ├── nodes.py             generate_node, evaluate_node (parallel), aggregate_node, should_continue
│           ├── state.py             PipelineState TypedDict
│           ├── toon.py              TOON encoding wrapper (40–45% token reduction on structured inputs)
│           ├── prompts/             anthropic.py · openai.py · google.py · professions/<slug>.py
│           └── agents/
│               ├── job_analyzer.py  JobAnalyzerAgent — extracts top-N key skills from JD
│               ├── generator.py     GeneratorAgent — full generation + section regen
│               ├── aggregator.py    AggregatorAgent — score gating + feedback routing
│               └── evaluators/      AnthropicEvaluatorAgent · OpenAIEvaluatorAgent · GoogleEvaluatorAgent
│
└── frontend/src/
    ├── app/
    │   ├── page.tsx                 Landing — hero, how-it-works, CTA
    │   ├── auth/
    │   │   ├── login/page.tsx       Sign in — credentials + Google OAuth (production only)
    │   │   └── register/page.tsx    Registration — email/password + Google OAuth (production only)
    │   ├── profile/page.tsx         Account profile — resume upload (AI prefill), career form,
    │   │                            primary skill, Resume Library (Plus+)
    │   ├── jobs/page.tsx            Job search — TagInput query, location, JSearch results,
    │   │                            save/unsave, Tailor Resume, Apply with Saved, My Alerts tab (Plus+)
    │   ├── builder/
    │   │   ├── layout.tsx           Builder shell — StepProgress bar + SessionGuard
    │   │   ├── upload/page.tsx      Step 1 — drag-and-drop; one-click tailor banner
    │   │   ├── profile/page.tsx     Step 2 — AI pre-filled profile form
    │   │   ├── job/page.tsx         Step 3 — paste job description
    │   │   ├── template/page.tsx    Step 4 — template gallery + sample CV + additional instructions
    │   │   ├── preview/page.tsx     Step 5 — editable preview; locked facts; section regen; custom sections
    │   │   └── download/page.tsx    Step 6 — Generate Files; DOCX + PDF format cards
    │   └── settings/
    │       └── professions/page.tsx Profession CRUD admin
    ├── components/
    │   ├── Navbar.tsx               Shared nav — avatar dropdown, tier badge, sign in/out;
    │   │                            Builder + Jobs + My Alerts links shown for authenticated users only
    │   ├── TagInput.tsx             Async-autocomplete tag/bubble input (profile + jobs pages)
    │   ├── ResumePickerModal.tsx    "Apply with Saved" modal — resume library or tailor-new option
    │   ├── CreateAlertModal.tsx     Create/edit job alert modal
    │   ├── AuthGuard.tsx            Redirects unauthenticated users to /auth/login
    │   └── StepProgress.tsx        Six-step indicator with completion checkmarks
    ├── lib/
    │   ├── api.ts                   Typed API client; axios interceptor for session-expiry; JobAlert interface
    │   ├── useAuth.ts               useAuth() hook — wraps useSession; works in real + dev mode
    │   ├── nextauth.ts              NextAuth config (Credentials + Google providers)
    │   ├── stepGuard.ts             useStepGuard() — prevents skipping builder steps
    │   └── session.ts               getSessionId() / setSessionId()
    └── providers/
        ├── AuthProvider.tsx         SessionProvider + TokenSync (sets axios Authorization header)
        └── DevProvider.tsx          Dev bypass provider with plan switcher dropdown
```

---

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 18+
- MongoDB Atlas account (free tier works)
- Anthropic API key (required)
- OpenAI API key (optional — evaluator)
- Google API key (optional — evaluator)
- RapidAPI key with JSearch subscription (optional — job search)

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt

# Copy .env.example → .env and fill in required values (see below)

python seed_templates.py        # Seeds Clean / Modern / Executive templates
python seed_professions.py      # Seeds initial profession profiles

uvicorn main:app --reload --port 9000
```

API docs: http://localhost:9000/docs

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Minimum `frontend/.env.local` for local development (dev bypass — no auth required):
```
NEXT_PUBLIC_API_URL=http://localhost:9000
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

App: http://localhost:4000

> **Dev auth bypass** — `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` (frontend) + `DEV_BYPASS_AUTH=true` (backend) skips all authentication. A plan switcher appears in the Navbar dropdown to toggle Free / Plus / Pro for testing tier-gated features. Remove both flags before deploying.

> **Google OAuth** — only active on production when `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` (frontend) and `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set. The Google button is hidden on localhost.

---

## Builder Flow (6 steps)

| Step | Route | What happens |
|------|-------|-------------|
| 1 | `/builder/upload` | Resume parsed; new session created; one-click tailor banner shown if arriving from Jobs page |
| 2 | `/builder/profile` | Claude extracts name, email, phone, LinkedIn, location, target role, skills; user confirms |
| 3 | `/builder/job` | User pastes job description (pre-filled if from Jobs → Tailor Resume flow) |
| 4 | `/builder/template` | Pick template; optional formatting reference CV; additional instructions textarea |
| 5 | `/builder/preview` | Full AI pipeline runs; inline editing; section regen; custom sections; locked facts |
| 6 | `/builder/download` | Generate Files button; DOCX always available; PDF via reportlab |

Each step is guarded by `useStepGuard` — navigating to a later step without completing earlier ones redirects back.

---

## Profile & Job Search

### Account Profile (`/profile`)
- Persistent profile stored in `user_profiles` MongoDB collection (separate from builder sessions)
- **Resume upload** → Claude AI prefills: name, email, phone, LinkedIn, location, target roles, primary skill, key skills, summary
- **Primary skill** — the one core technical/professional skill (e.g. "Java", "Python", "Financial Modelling"). Combined with target roles when pre-filling job searches
- **Target roles** — one or more roles used to seed job searches
- **Resume Library** (Plus+) — save multiple resumes; upload directly or save tailored ones from the builder

### Job Search (`/jobs`) — Plus+ only
- **TagInput search bar** — add roles, keywords, or companies as bubbles; uses catalog autocomplete
- Pre-filled from profile on load: target roles + primary skill become search tags; location pre-filled too
- Results from JSearch (RapidAPI) — Indeed, LinkedIn, Glassdoor and more
- **Job title is clickable** — opens the original listing in a new tab
- **Tailor Resume** → stores job description + context to localStorage → redirects to `/builder/upload`
- **Apply with Saved** → `ResumePickerModal` — pick from Resume Library or tailor a new one
- Save/unsave jobs; monthly quota banner with warning thresholds
- **Result caching** — same query+location+page is cached in MongoDB for `JSEARCH_CACHE_TTL_S` seconds (default 2 hours)

### Job Alerts (`/jobs` → My Alerts tab) — Plus+ only
- Save search queries as named alerts; receive daily email digests when new matching jobs appear
- Plus: up to 5 alerts; Pro: unlimited
- Emails sent via **Brevo HTTP API** at `ALERT_SEND_HOUR` UTC (default 08:00)
- Email includes: employer logo, job title, salary, posted time, skill chips, Apply button
- **No-results notification** sent when JSearch returns empty for an active alert
- `send-test` endpoint available for manual trigger — sends real jobs or no-results email (no mock data)
- Duplicate prevention: alert tags normalised and checked on save
- Seen-job deduplication: `seen_job_ids[]` per alert (capped at 1000) prevents re-sending the same listings

---

## AI Pipeline

```
POST /api/generate
        │
        ▼
┌───────────────────┐
│ Profession Resolve│  MongoDB keyword match on target_role
└────────┬──────────┘
        │
        ▼
┌───────────────────┐
│  Job Analyzer     │  1 LLM call → ordered list of top-N key skills
│  (pre-loop)       │
└────────┬──────────┘
        │
        ▼ ╔══════════════════════════════════════════╗
        │ ║       EVALUATOR-OPTIMIZER LOOP           ║
        │ ║   (repeats up to MAX_EVAL_CYCLES times)  ║
        │ ║                                          ║
        └►║  ┌─────────────────────────────────┐    ║
          ║  │  Generator (GeneratorAgent)     │    ║
          ║  │  resume + profile + JD +        │    ║
          ║  │  profession + skills + feedback  │    ║
          ║  └──────────────┬──────────────────┘    ║
          ║                 │ resume JSON            ║
          ║                 ▼                        ║
          ║  ┌─────────────────────────────────┐    ║
          ║  │  Evaluators  (asyncio.gather)   │    ║
          ║  │  Anthropic · OpenAI · Google    │    ║
          ║  │  → score 0–100 + suggestions    │    ║
          ║  └──────────────┬──────────────────┘    ║
          ║                 │                        ║
          ║                 ▼                        ║
          ║  ┌─────────────────────────────────┐    ║
          ║  │  Aggregator  (pure computation) │    ║
          ║  │  min_score ≥ PASS_THRESHOLD?    │    ║
          ║  └──────┬───────────────┬──────────┘    ║
          ║    YES  │               │ NO             ║
          ╚═════════╪═══════════════╪════════════════╝
                    │               └──► feedback → next cycle
                    ▼
            Best result returned
```

Quality scores are **never shown to users** — qualitative labels (Excellent / Strong / Good / Reviewed) are shown instead.

### Token Efficiency — TOON Encoding

All structured data sent to LLMs is serialised with **TOON** (`toon-format==0.9.0b1`) before prompt injection, cutting structured input tokens by 40–45%. Outputs remain plain JSON.

### Subscription Tiers

| Feature | Free | Plus | Pro |
|---------|------|------|-----|
| Resume builder (6-step flow) | ✅ | ✅ | ✅ |
| DOCX + PDF export | ✅ | ✅ | ✅ |
| Persistent profile page | ✅ | ✅ | ✅ |
| AI evaluators | Anthropic only | Anthropic + Google | All three |
| Key skills extracted from JD | 3 | 5 | 10 |
| Job search (JSearch) | ❌ | ✅ | ✅ |
| Saved jobs | ❌ | Up to 25 | Unlimited |
| One-click Tailor | ❌ | ✅ | ✅ |
| Resume Library | ❌ | Up to 5 | Unlimited |
| Job Alerts (daily digest) | ❌ | Up to 5 alerts | Unlimited |
| Section-level regeneration | ❌ | ❌ | ✅ |
| Locked Facts panel | ❌ | ❌ | ✅ |
| Sample CV formatting reference | ❌ | ❌ | ✅ |

---

## Key Config Flags (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | **Required.** Claude API key |
| `MONGODB_URI` | — | **Required.** URL-encode special chars in password |
| `JWT_SECRET` | — | **Required in prod.** Generate: `openssl rand -base64 32` |
| `DEV_BYPASS_AUTH` | `false` | Skip all auth on localhost |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret |
| `RAPIDAPI_KEY` | — | RapidAPI key for JSearch (job search) |
| `JSEARCH_CACHE_TTL_S` | `7200` | Seconds to cache job search results (2 hours default) |
| `JSEARCH_MONTHLY_LIMIT` | `500` | Monthly JSearch call budget |
| `BREVO_API_KEY` | — | Brevo HTTP API key for job alert emails |
| `BREVO_SENDER_EMAIL` | — | Verified sender address in Brevo |
| `ALERT_SEND_HOUR` | `8` | UTC hour to run daily alert digest (0–23) |
| `ALERT_MAX_JOBS_PER_EMAIL` | `10` | Max job cards per alert email |
| `FRONTEND_URL` | — | Used in email footer links |
| `GENERATOR_MODEL` | `claude-sonnet-4-20250514` | Model for generator + job analyzer |
| `ANTHROPIC_EVALUATOR_MODEL` | `claude-sonnet-4-20250514` | Claude evaluator model |
| `OPENAI_EVALUATOR_MODEL` | `gpt-4o-mini` | OpenAI evaluator model |
| `GOOGLE_EVALUATOR_MODEL` | `gemini-1.5-pro` | Gemini evaluator model |
| `ANTHROPIC_EVALUATOR_ENABLED` | `true` | Enable Claude evaluator |
| `OPENAI_EVALUATOR_ENABLED` | `false` | Enable GPT-4o evaluator |
| `GOOGLE_EVALUATOR_ENABLED` | `false` | Enable Gemini evaluator |
| `PASS_THRESHOLD` | `50` | Min score (0–100) for evaluator pass |
| `MAX_EVAL_CYCLES` | `3` | Max generator-evaluator iterations |
| `MAX_AI_CALLS_PER_SESSION` | `10` | Hard per-session AI call cap |
| `SKILL_EXTRACTION_COUNT` | `3` | Top-N skills extracted from job description |
| `STORAGE_BACKEND` | `local` | `local` or `s3` |
| `ALLOWED_ORIGINS` | `http://localhost:4000` | CORS origins (comma-separated) |

**Frontend env vars:**

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | — | Backend URL |
| `NEXTAUTH_URL` | — | Frontend canonical URL (required in prod) |
| `NEXTAUTH_SECRET` | — | NextAuth signing secret; `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | `false` | Show Google sign-in button (production only) |
| `NEXT_PUBLIC_DEV_BYPASS_AUTH` | `false` | Skip auth on localhost |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Email/password sign-up |
| POST | `/api/auth/login` | Email/password sign-in → JWT |
| POST | `/api/auth/sync` | Google OAuth → backend JWT |
| GET | `/api/auth/me` | Current authenticated user |
| GET | `/api/account/profile` | Get persistent account profile |
| PUT | `/api/account/profile` | Save account profile |
| POST | `/api/account/profile/resume` | Upload resume → AI prefill profile |
| POST | `/api/sessions/from-profile` | Create builder session from profile (one-click tailor) |
| GET | `/api/account/resumes` | List Resume Library |
| POST | `/api/account/resumes/upload` | Upload resume to library |
| POST | `/api/account/resumes/from-session` | Save tailored resume to library |
| PATCH | `/api/account/resumes/{id}` | Rename saved resume |
| DELETE | `/api/account/resumes/{id}` | Delete saved resume |
| GET | `/api/account/resumes/{id}/download` | Download saved resume |
| POST | `/api/account/resumes/{id}/create-session` | Create session from library resume |
| POST | `/api/resume/upload` | Upload & parse resume; create session |
| POST | `/api/resume/sample-format?session_id=` | Upload formatting reference CV |
| GET | `/api/profile/prefill?session_id=` | AI-extract profile fields |
| POST | `/api/profile?session_id=` | Save session profile |
| POST | `/api/job-description?session_id=` | Save job description |
| GET | `/api/jobs/search` | JSearch job search (Plus+, cached) |
| GET | `/api/jobs/quota` | Monthly quota stats |
| POST | `/api/jobs/save` | Save a job |
| GET | `/api/jobs/saved` | List saved jobs |
| DELETE | `/api/jobs/saved/{job_id}` | Unsave a job |
| GET | `/api/jobs/alerts` | List job alerts (Plus+) |
| POST | `/api/jobs/alerts` | Create job alert |
| PATCH | `/api/jobs/alerts/{id}` | Update job alert |
| DELETE | `/api/jobs/alerts/{id}` | Delete job alert |
| PATCH | `/api/jobs/alerts/{id}/toggle` | Enable / disable alert |
| POST | `/api/jobs/alerts/send-test` | Send test alert email |
| GET | `/api/catalog/roles?q=` | Role autocomplete |
| GET | `/api/catalog/skills?q=` | Skills autocomplete |
| GET | `/api/templates` | List templates |
| POST | `/api/templates/upload` | Upload custom template |
| PATCH | `/api/sessions/{id}/template` | Attach template to session |
| PUT | `/api/sessions/{id}/locked-facts` | Update locked facts |
| PUT | `/api/sessions/{id}/resume` | Sync client-side resume to session |
| POST | `/api/generate?session_id=` | Run full pipeline |
| POST | `/api/export?session_id=` | Export DOCX + PDF |
| GET | `/api/download/{file_id}` | Download generated file |
| GET/POST/PUT/DELETE | `/api/professions` | Profession profile CRUD |

---

## Deployment (Railway)

1. Create two Railway services: `tailormycv-backend` (root: `/backend`) and `tailormycv-frontend` (root: `/frontend`)
2. Set environment variables per service (see tables above)
3. Run seed scripts once after first deploy:
   ```
   python seed_templates.py
   python seed_professions.py
   ```

Minimum backend env vars for launch:
```
ANTHROPIC_API_KEY=sk-ant-...
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<openssl rand -base64 32>
ALLOWED_ORIGINS=https://your-frontend.up.railway.app
FRONTEND_URL=https://your-frontend.up.railway.app
```

Minimum frontend env vars:
```
NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app
NEXTAUTH_URL=https://your-frontend.up.railway.app
NEXTAUTH_SECRET=<openssl rand -base64 32>
```

To enable Google OAuth on production (add to both services):
```
# Frontend
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true

# Backend
GOOGLE_CLIENT_ID=<same>
GOOGLE_CLIENT_SECRET=<same>
```

To enable job alert emails:
```
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=your-verified-sender@gmail.com
ALERT_SEND_HOUR=8
ALERT_MAX_JOBS_PER_EMAIL=10
```

# User Requirements Document
## TailorMyCv — AI-Powered Resume Builder

**Version:** 1.6
**Date:** May 2026
**App Name:** TailorMyCv
**Support Email:** samorsameer@gmail.com
**Deployment Target:** Railway.com

---

## 1. Project Overview

**TailorMyCv** is a full-stack web application that takes three inputs — an existing resume, a user profile, and a job description — and uses a multi-agent AI pipeline to generate a tailored, professionally formatted resume in a user-selected template. The primary output is a `.docx` file; PDF export is an optional server-side feature.

The AI pipeline is profession-aware and tier-driven:
- A **Job Analyzer** agent extracts the top-N skills from the job description before generation begins
- A **Generator** agent writes the resume tailored to the role and profession
- One or more **Evaluator** agents score the result using profession-specific criteria
- An **Aggregator** consolidates feedback; the generator refines until the quality threshold is met or max cycles are reached

Users authenticate with email/password or Google OAuth. A persistent **Account Profile** stores career information, a primary skill, and a Resume Library — all of which power job search pre-fill and one-click resume tailoring from job listings.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend | Python 3.13 + FastAPI |
| Auth | NextAuth v4 (Credentials + Google OAuth) + FastAPI JWT (python-jose + passlib[bcrypt]) |
| Pipeline Orchestration | LangGraph 1.2.1 (`StateGraph` with cyclic evaluator-optimizer loop) |
| Database | MongoDB Atlas + Motor (async) |
| AI — Job Analyzer | Anthropic Claude API |
| AI — Generator | Anthropic Claude API (`GENERATOR_MODEL` env var) |
| AI — Evaluators | Anthropic + OpenAI + Google (models via `*_EVALUATOR_MODEL` env vars; active set per tier) |
| Job Search | JSearch via RapidAPI — Indeed, LinkedIn, Glassdoor aggregator |
| Profession Profiles | MongoDB `professions` collection; managed via `/settings/professions` admin UI |
| File Parsing | `pdfplumber` (PDF), `python-docx` (DOCX) |
| File Generation | `python-docx` (DOCX); `reportlab` (PDF — no LibreOffice required) |
| Storage | Pluggable: `LocalStorageBackend` (dev) or `S3StorageBackend` (prod) via `get_storage()` factory |
| Token Efficiency | `toon-format==0.9.0b1` — 40–45% token reduction on structured inputs |
| Observability | LangSmith tracing (optional; auto-detected from env vars) |
| Email | Brevo HTTP API — job alert digest emails + no-results notifications |
| Job Alert Scheduler | APScheduler (in-process) — daily cron at `ALERT_SEND_HOUR` UTC |
| Deployment | Railway.com — two services: `tailormycv-frontend` (Next.js) + `tailormycv-backend` (FastAPI) |

---

## 3. Authentication

### 3.1 Auth Flows

**Email/password:**
NextAuth Credentials provider → `POST /api/auth/login` → backend issues JWT → stored in NextAuth session cookie.

**Google OAuth:**
NextAuth Google provider → `signIn` callback → `POST /api/auth/sync` → backend creates/finds/links user → JWT in session. If the Google email matches an existing email/password account, `google_id` is linked automatically.

**Token sync:**
`AuthProvider` calls `setApiToken()` on session change → sets axios `Authorization: Bearer <token>` globally.

**Dev bypass:**
`NEXT_PUBLIC_DEV_BYPASS_AUTH=true` (frontend) + `DEV_BYPASS_AUTH=true` (backend) skips all auth. `DevProvider` replaces `SessionProvider`; plan switcher appears in Navbar dropdown for tier testing.

**Google OAuth production flag:**
`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` (frontend only) controls whether the Google sign-in button is visible. Set `false` (or omit) on localhost — button is hidden. Set `true` on production together with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### 3.2 Backend Auth Files

| File | Purpose |
|---|---|
| `models/user.py` | `User`, `UserPublic`; `tier: free \| plus \| pro` |
| `services/auth_service.py` | JWT signing (24h expiry), bcrypt hashing, user CRUD |
| `dependencies/auth.py` | `get_current_user` (Bearer dep), `require_tier(min_tier)` factory |
| `routers/auth.py` | `/api/auth/register`, `/login`, `/sync`, `/me` |

### 3.3 Frontend Auth Files

| File | Purpose |
|---|---|
| `lib/nextauth.ts` | NextAuth config — Credentials + Google providers; JWT/session callbacks |
| `providers/AuthProvider.tsx` | `SessionProvider` + `TokenSync` component |
| `providers/DevProvider.tsx` | Dev bypass with plan switcher |
| `lib/useAuth.ts` | `useAuth()` hook — wraps `useSession`; works in real and dev mode |
| `components/Navbar.tsx` | Avatar dropdown, tier badge, sign in/out |

---

## 4. Application Flow

### Step 1 — Upload Resume
- User uploads their existing resume as a `.pdf` or `.docx` file (max 5 MB)
- Optional **Additional Instructions** textarea for prioritisation guidance
- Backend parses the file; session created; raw text and instructions stored
- **One-click tailor banner** shown when arriving from Jobs page (job description + employer pre-loaded)

### Step 2 — Complete User Profile
- Claude AI pre-fills profile from resume: name, email, phone, LinkedIn, location, target role, skills, summary
- User reviews and confirms; stored in session `user_profile`

### Step 3 — Paste Job Description
- User pastes the full job description; stored in session
- Pre-filled when arriving via the one-click Tailor Resume flow from Jobs page

### Step 4 — Select Template + Optional Extras
- Template gallery (prebuilt or custom upload)
- Optional formatting reference CV — layout mirrored, content never copied
- Optional **Additional Instructions** textarea — passed to generator as `additional_instructions`

### Step 5 — AI Resume Generation
1. **Profession resolution** — `target_role` matched against keyword lists; falls back to `FEATURED_PROFESSION_SLUG`
2. **Job Analyzer** — one LLM call extracts top-N skills (N per tier)
3. **Generator** — writes resume JSON using resume + profile + JD + profession + skills + locked facts + sample CV + instructions
4. **Evaluators** — run in parallel; score 0–100
5. **Aggregator** — if all pass `PASS_THRESHOLD` → exit; else send feedback → next cycle
6. Repeats up to `MAX_EVAL_CYCLES`; best result always returned

Quality scores never shown to users — qualitative labels only (Excellent / Strong / Good / Reviewed).

### Step 6 — Download
- DOCX always generated; PDF via reportlab (no LibreOffice)
- Files stored in GridFS; auto-expire after 24 hours

---

## 5. Account Profile (`/profile`)

A persistent profile stored in the `user_profiles` MongoDB collection — separate from builder sessions and preserved across sessions.

### 5.1 Fields

| Field | Type | Notes |
|---|---|---|
| `full_name` | string | |
| `email` | string | |
| `phone` | string | |
| `linkedin` | string | Full URL |
| `location` | string | City + country/state |
| `target_roles` | string[] | TagInput (multi); used to seed job searches |
| `primary_skill` | string | TagInput (single); one core technical/professional skill — combined with roles on job search pre-fill |
| `key_skills` | string[] | TagInput (multi); async autocomplete from `/api/catalog/skills` |
| `summary` | string | 2–3 sentence professional summary |
| `resume_text` | string (internal) | Raw text from uploaded resume |

### 5.2 Resume Upload + AI Prefill
- Accept PDF / DOCX; max 5 MB
- Claude extracts: `full_name`, `email`, `phone`, `linkedin`, `location`, `target_role` → `target_roles`, `primary_skill`, `key_skills`, `summary`
- Fields only overwritten if AI returns a non-empty value; existing values preserved otherwise
- `primary_skill` — model instructed to return the single most defining technical or professional skill (one short phrase)

### 5.3 Resume Library (Plus+)
- Upload resumes directly or save tailored ones from the builder
- Plus: max 5 resumes; Pro: unlimited
- Actions: rename, download, delete
- Used by "Apply with Saved" on the Jobs page (`ResumePickerModal`)

---

## 6. Job Search (`/jobs`) — Plus+ only

### 6.1 Search Bar
- **Query field** uses `TagInput` — roles, keywords, or companies added as bubble tags
- Autocomplete from `/api/catalog/roles`; free-text entry also supported
- **Location field** — plain text input; pre-filled from profile on load
- Pre-fill on load: profile `target_roles` + `primary_skill` become search tags; `location` pre-fills the location field; auto-search runs immediately

Example: profile has `target_roles: ["Vice President"]` and `primary_skill: "Java"` → search tags `["Vice President", "Java"]` → query sent as `"Vice President Java"`.

### 6.2 Job Cards
- Employer logo (Clearbit), job title (clickable — opens listing in new tab), employer name, publisher, location, employment type, remote badge, salary, posted date
- **Tailor Resume** — stores JD + job title + employer to localStorage → redirects to `/builder/upload`
- **Apply with Saved** — opens `ResumePickerModal`; shows Resume Library or "Tailor New Resume" option
- **Save / Unsave** — bookmark icon; saved jobs retrievable across sessions

### 6.3 Result Caching
- Same query + location + page served from MongoDB cache if within `JSEARCH_CACHE_TTL_S` seconds
- Cache hit costs zero RapidAPI quota
- TTL configurable via `.env` (`JSEARCH_CACHE_TTL_S`, default 7200 = 2 hours)
- Cache stored in `search_cache` MongoDB collection with `cached_at` timestamp

### 6.4 Quota Management
- Monthly call counter in MongoDB; resets on the 1st of each month
- Warning banner shown in UI when usage crosses `JSEARCH_QUOTA_WARN_PCT` (default 50%)
- Hard limit: `JSEARCH_MONTHLY_LIMIT` (default 500); returns HTTP 429 when exhausted

### 6.5 Loading State
- Skeleton cards shown during API call — matching job card structure (logo placeholder + title/subtitle/button bars)
- Prevents empty page during slow RapidAPI responses

### 6.6 Job Alerts (Plus+ only)

Users save named search queries as alerts and receive daily email digests.

**Alert model:**
- `name` — user-chosen label
- `query_tags` — array of role/keyword tags (same as search bar)
- `location_tags` — array of location strings
- Enabled/disabled toggle per alert
- `seen_job_ids[]` — deduplication list, capped at 1000; prevents re-sending same listings (scheduler only; send-test ignores)

**Limits:** Plus = max 5 alerts; Pro = unlimited; Free = blocked.

**Duplicate detection:** tags normalised (sorted lowercase) on save; 409 returned if duplicate detected.

**Email digest (Brevo HTTP API):**
- Sent daily at `ALERT_SEND_HOUR` UTC by APScheduler cron
- Content: employer logo (JSearch CDN; initials avatar fallback), job title, employer "via publisher", Apply button, salary, posted date, location, remote badge, skill chips
- Subject: `Your job alert: {name} — Top N jobs`
- No-results notification sent when JSearch returns empty for an active alert

**send-test endpoint** (`POST /api/jobs/alerts/send-test`):
- Finds the user's first active alert; calls JSearch with real query
- Sends digest email if results found; sends no-results email if empty
- No mock data; returns `jsearch_query`, job count, or `note` field

**Known limitation:** `job_apply_link` for company-hosted jobs (e.g. Monzo, DeepMind) points to the general careers page — this is a JSearch data limitation. Jobs sourced from LinkedIn/Indeed/Glassdoor have specific listing URLs.

---

## 7. Functional Requirements

### 7.1 Resume Upload & Parsing
- Accept `.pdf` and `.docx`, max 5 MB
- Extract structured raw text; store in session
- Accept optional additional instructions alongside file upload

### 7.2 User Profile Form (builder session)
- Fields: Full Name, Email, Phone, LinkedIn, Location, Target Role, Preferred Tone, Key Skills, Additional Notes
- Required: Full Name, Email
- Persisted to MongoDB session

### 7.3 Job Description Input
- Large textarea; min 50 characters enforced
- Stored in MongoDB against the session

### 7.4 Template System
- **Prebuilt templates**: `.docx` files with named placeholder tags
- **Custom template upload**: accept `.docx`; validate required placeholders
- **Sample CV for formatting reference**: layout mirrored, content never copied

### 7.5 Profession Profile Management (Admin — `/settings/professions`)
Schema, resolution logic, and built-in professions unchanged from v1.4.

### 7.6 AI Resume Generation Pipeline
See §3 (pipeline diagram) — unchanged from v1.4.

#### Fact-Locking
- Users pin specific facts on Preview page
- Injected as "LOCKED FACTS — MUST NOT BE CHANGED" in generator system prompt
- Persisted via `PUT /api/sessions/{id}/locked-facts`

### 7.7 Editable Preview
- Inline editing; changes persisted to `localStorage`
- Full pipeline regeneration and per-section regeneration
- Qualitative quality labels (no raw scores)
- Locked Facts panel (collapsible)
- Custom section addition

### 7.8 File Generation & Download
- DOCX always generated; PDF optional (`PDF_EXPORT_ENABLED=true`)
- Files stored in GridFS; expire after 24 hours
- Filenames derived from `name` in generated resume JSON

### 7.9 Subscription Tiers

| Feature | Free | Plus | Pro |
|---|---|---|---|
| Resume builder (6-step flow) | ✅ | ✅ | ✅ |
| DOCX + PDF export | ✅ | ✅ | ✅ |
| Persistent profile | ✅ | ✅ | ✅ |
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

## 8. Non-Functional Requirements

- **Responsiveness**: Desktop, tablet, and mobile
- **Performance**: AI generation non-streaming (spinner shown); job search results cached; profession resolution adds zero in-loop latency
- **Scalability**: Agents stateless; evaluators run concurrently; aggregator pure computation; new professions require no code change
- **Error handling**: Graceful errors for failed uploads, API failures, invalid templates; evaluator failures score 0; job analyzer failures return empty list
- **Security**: API keys in Railway env vars; JWT auth for all account/profile/jobs endpoints; scores not shown in UI
- **File cleanup**: Generated files auto-deleted from GridFS after 24 hours

---

## 9. Data Model (MongoDB)

### `users` collection
```json
{
  "_id": "ObjectId",
  "email": "string (unique index)",
  "name": "string",
  "hashed_password": "string (optional — absent for Google-only accounts)",
  "google_id": "string (sparse unique index)",
  "tier": "free | plus | pro",
  "is_active": true,
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### `user_profiles` collection
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (ref users)",
  "full_name": "string",
  "email": "string",
  "phone": "string",
  "linkedin": "string",
  "location": "string",
  "target_roles": ["string"],
  "primary_skill": "string",
  "key_skills": ["string"],
  "summary": "string",
  "resume_text": "string",
  "resume_file_key": "string (storage path)",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### `sessions` collection
```json
{
  "_id": "ObjectId",
  "created_at": "datetime (TTL index — expires after 24h)",
  "resume_parsed": { "raw_text": "string", "filename": "string" },
  "upload_instructions": "string",
  "user_profile": {},
  "job_description": "string",
  "selected_template_id": "string",
  "sample_cv_text": "string",
  "locked_facts": ["string"],
  "generated_resume": {},
  "output_files": { "docx_file_id": "GridFS ObjectId", "pdf_file_id": "GridFS ObjectId" }
}
```

### `saved_jobs` collection
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (ref users)",
  "job_id": "string",
  "job_data": {},
  "saved_at": "datetime"
}
```

### `search_cache` collection
```json
{
  "_id": "ObjectId",
  "key": "string (MD5 of query|location|page)",
  "payload": {},
  "cached_at": "datetime"
}
```

### `job_alerts` collection
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (ref users)",
  "name": "string",
  "query_tags": ["string"],
  "location_tags": ["string"],
  "enabled": true,
  "seen_job_ids": ["string"],
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### `saved_resumes` collection
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId (ref users)",
  "name": "string",
  "type": "uploaded | tailored",
  "file_key": "string (storage path)",
  "tailored_for_employer": "string (optional)",
  "created_at": "datetime"
}
```

---

## 10. API Endpoints (FastAPI)

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Email/password sign-up |
| POST | `/api/auth/login` | Email/password sign-in → JWT |
| POST | `/api/auth/sync` | Google OAuth → backend JWT |
| GET | `/api/auth/me` | Current user |

### Account Profile
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/account/profile` | Get persistent profile |
| PUT | `/api/account/profile` | Save profile (all fields including `primary_skill`) |
| POST | `/api/account/profile/resume` | Upload resume → AI prefill |
| POST | `/api/sessions/from-profile` | Create builder session from profile |

### Resume Library (Plus+)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/account/resumes` | List saved resumes |
| POST | `/api/account/resumes/upload` | Upload to library |
| POST | `/api/account/resumes/from-session` | Save tailored resume from builder |
| PATCH | `/api/account/resumes/{id}` | Rename |
| DELETE | `/api/account/resumes/{id}` | Delete |
| GET | `/api/account/resumes/{id}/download` | Download file |
| POST | `/api/account/resumes/{id}/create-session` | Create session from library resume |

### Job Search (Plus+)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/jobs/search` | JSearch — cached by `JSEARCH_CACHE_TTL_S` |
| GET | `/api/jobs/quota` | Monthly usage stats |
| POST | `/api/jobs/save` | Save a job |
| GET | `/api/jobs/saved` | List saved jobs |
| DELETE | `/api/jobs/saved/{job_id}` | Unsave |

### Job Alerts (Plus+)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/jobs/alerts` | List all alerts for current user |
| POST | `/api/jobs/alerts` | Create alert |
| PATCH | `/api/jobs/alerts/{id}` | Update alert (name, tags, location) |
| DELETE | `/api/jobs/alerts/{id}` | Delete alert |
| PATCH | `/api/jobs/alerts/{id}/toggle` | Enable / disable alert |
| POST | `/api/jobs/alerts/send-test` | Trigger test email with real JSearch data |

### Builder
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/resume/upload` | Upload & parse resume; create session |
| POST | `/api/resume/sample-format?session_id=` | Upload formatting reference CV |
| GET | `/api/profile/prefill?session_id=` | AI-extract profile fields |
| POST | `/api/profile?session_id=` | Save session profile |
| POST | `/api/job-description?session_id=` | Save job description |
| GET | `/api/templates` | List templates |
| POST | `/api/templates/upload` | Upload custom template |
| PATCH | `/api/sessions/{id}/template` | Attach template |
| PUT | `/api/sessions/{id}/locked-facts` | Update locked facts |
| PUT | `/api/sessions/{id}/resume` | Sync client-side resume to session |
| POST | `/api/generate?session_id=` | Run full pipeline |
| POST | `/api/export?session_id=` | Export DOCX + PDF |
| GET | `/api/download/{file_id}` | Download file |

### Catalog & Admin
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/catalog/roles?q=` | Role autocomplete |
| GET | `/api/catalog/skills?q=` | Skills autocomplete |
| GET/POST/PUT/DELETE | `/api/professions` | Profession profile CRUD |

---

## 11. Frontend Pages (Next.js App Router)

| Route | Page |
|---|---|
| `/` | Landing — hero, how it works, CTA |
| `/auth/login` | Sign in — credentials + Google OAuth |
| `/auth/register` | Email/password registration |
| `/profile` | Account profile — resume upload (AI prefill), personal info, career fields (target roles, primary skill, key skills), Resume Library |
| `/jobs` | Job search — TagInput query bar (pre-filled from profile), JSearch results, save/tailor/apply actions, My Alerts tab (Plus+) |
| `/builder/upload` | Step 1 — drag-and-drop resume upload |
| `/builder/profile` | Step 2 — AI pre-filled profile confirmation |
| `/builder/job` | Step 3 — paste job description |
| `/builder/template` | Step 4 — template gallery + sample CV + additional instructions |
| `/builder/preview` | Step 5 — editable preview; locked facts; section regen; custom sections |
| `/builder/download` | Step 6 — download DOCX / PDF |
| `/settings/professions` | Admin — profession profile CRUD |

---

## 12. Environment Variables

### Backend (FastAPI)
```
# API keys
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=

# Auth
JWT_SECRET=                          # Required in prod; generate: python -c "import secrets; print(secrets.token_hex(32))"
JWT_ALGORITHM=HS256
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DEV_BYPASS_AUTH=false                # Set true on localhost only

# Model names
GENERATOR_MODEL=claude-sonnet-4-20250514
ANTHROPIC_EVALUATOR_MODEL=claude-sonnet-4-20250514
OPENAI_EVALUATOR_MODEL=gpt-4o-mini
GOOGLE_EVALUATOR_MODEL=gemini-1.5-pro

# Evaluator flags
ANTHROPIC_EVALUATOR_ENABLED=true
OPENAI_EVALUATOR_ENABLED=false
GOOGLE_EVALUATOR_ENABLED=false

# Pipeline controls
PASS_THRESHOLD=50
MAX_EVAL_CYCLES=3
MAX_AI_CALLS_PER_SESSION=10
SKILL_EXTRACTION_COUNT=3             # Free=3 | Plus=5 | Pro=10

# Job search
RAPIDAPI_KEY=                        # RapidAPI key for JSearch
JSEARCH_MONTHLY_LIMIT=500
JSEARCH_QUOTA_WARN_PCT=50
JSEARCH_CACHE_TTL_S=7200             # Cache TTL in seconds (2 hours default)

# Feature flags
PDF_EXPORT_ENABLED=false
FEATURED_PROFESSION_SLUG=software_engineer

# Storage
STORAGE_BACKEND=local                # local | s3
STORAGE_LOCAL_PATH=./uploads
AWS_S3_BUCKET=
AWS_S3_PREFIX=uploads/
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Infrastructure
MONGODB_URI=
ALLOWED_ORIGINS=https://your-frontend.railway.app
SUPPORT_EMAIL=samorsameer@gmail.com

# Email — Brevo HTTP API (job alert digests)
BREVO_API_KEY=                       # xkeysib-... from Brevo dashboard
BREVO_SENDER_EMAIL=                  # Verified sender address in Brevo
ALERT_SEND_HOUR=8                    # UTC hour for daily digest (0–23)
ALERT_MAX_JOBS_PER_EMAIL=10          # Max job cards per email

# Observability
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=tailormycv
```

### Frontend (Next.js)
```
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
NEXTAUTH_URL=https://your-frontend.railway.app
NEXTAUTH_SECRET=                     # Random string; generate: openssl rand -base64 32
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true # false (or omit) on localhost — hides Google button
NEXT_PUBLIC_DEV_BYPASS_AUTH=false    # true on localhost only
```

---

## 13. Out of Scope (v1)

- Subscription billing and per-user tier enforcement (tier is a global env flag; per-user lookup is a future milestone)
- Resume version history
- Cover letter generation
- LinkedIn import
- Mobile app
- Team / multi-user accounts
- Role-based access control for `/settings/professions`

---

## 14. AI Prompts Architecture

Prompts organised by two axes:

1. **Provider axis** — `prompts/anthropic.py`, `prompts/openai.py`, `prompts/google.py`
2. **Profession axis** — `prompts/professions/<slug>.py`; stored in MongoDB; editable via admin UI

---

## 15. Token Efficiency — TOON Encoding

All structured LLM inputs serialised with **TOON** (`toon-format==0.9.0b1`); outputs remain plain JSON. Wrapper at `backend/services/pipeline/toon.py`; falls back to compact JSON if unavailable.

Typical savings: 40–45% on structured inputs (~650 tokens → ~370–400 tokens per resume payload).

| Tier | Active evaluators | Tokens saved / generation |
|---|---|---|
| Free | 1 | ~280 |
| Plus | 2 | ~950 |
| Pro | 3 | ~2,500 |

---

## 16. Naming Conventions

| Context | Format |
|---|---|
| Brand / UI | `TailorMyCv` |
| GitHub repo | `tailormycv` |
| Railway services | `tailormycv-frontend`, `tailormycv-backend` |
| MongoDB database | `tailormycv` |
| localStorage keys | `tailormycv_` prefix (all lowercase) |
| Agent class names | Provider-based: `AnthropicEvaluatorAgent`, `OpenAIEvaluatorAgent`, `GoogleEvaluatorAgent` |
| Profession slugs | `lowercase_underscored` |
| API routes | `lowercase-hyphenated` |

---

*End of User Requirements Document — TailorMyCv v1.5*

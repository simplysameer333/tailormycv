# User Requirements Document
## TailorMyCv — AI-Powered Resume Builder

**Version:** 1.7
**Date:** 2026-05-31
**App Name:** TailorMyCv
**Support Email:** samorsameer@gmail.com
**Deployment Target:** Railway.com

---

## 1. Project Overview

**TailorMyCv** is a full-stack web application that takes three inputs — an existing resume or LinkedIn profile, a user profile, and a job description — and uses a multi-agent AI pipeline to generate a tailored, professionally formatted resume in a user-selected template. The primary output is a `.docx` file; PDF export is an optional server-side feature.

The AI pipeline is profession-aware and tier-driven:
- A **Job Analyzer** agent extracts the top-N skills from the job description before generation begins
- A **Generator** agent writes the resume tailored to the role and profession
- One or more **Evaluator** agents score the result using profession-specific criteria
- An **Aggregator** consolidates feedback; the generator refines until the quality threshold is met or max cycles are reached

Users authenticate with email/password or Google OAuth. A persistent **Account Profile** stores career information, a primary skill, and a Resume Library — all of which power job search pre-fill and one-click resume tailoring from job listings. Users can import their LinkedIn profile directly to auto-fill the profile.

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
| LinkedIn Profile Import | LinkdAPI (`linkdapi.com`) — free tier available |
| Profession Profiles | MongoDB `professions` collection; managed via admin UI |
| File Parsing | `pdfplumber` (PDF), `python-docx` (DOCX) |
| File Generation | `python-docx` (DOCX); `reportlab` (PDF — no LibreOffice required) |
| Storage | Pluggable: `LocalStorageBackend` (dev) or `S3StorageBackend` (prod) via `get_storage()` factory |
| Token Efficiency | `toon-format==0.9.0b1` — 40–45% token reduction on structured inputs |
| Observability | LangSmith tracing (optional; auto-detected from env vars) |
| Email | Brevo HTTP API — job alert digest, no-results, and scheduler failure emails |
| Job Alert Scheduler | APScheduler (in-process) — daily cron at `ALERT_SEND_HOUR` UTC; 3-retry JSearch; quota integration |
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
| `dependencies/auth.py` | `get_current_user` (Bearer dep), `require_tier(min_tier)` factory, `require_superadmin` dep |
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

### Step 1 — Upload Resume or Import LinkedIn
- User uploads their existing resume as a `.pdf` or `.docx` file (max 5 MB), **OR** pastes a LinkedIn profile URL
- **Resume upload:** Backend parses the file; session created; raw text stored
- **LinkedIn import:** Backend calls `POST /api/linkedin/parse` → `linkedin_service.py` extracts the username slug from the URL and calls `GET https://linkdapi.com/api/v1/profile/full?username=<slug>` → extracts profile data (name, location, summary, key skills); raw text stored in session
- Optional **Additional Instructions** textarea for prioritisation guidance
- **One-click tailor banner** shown when arriving from Jobs page

### Step 2 — Complete User Profile
- Claude AI pre-fills profile from resume or LinkedIn: name, email, phone, LinkedIn, location, target role, skills, summary (max_tokens: 1024)
- User reviews and confirms; stored in session `user_profile`

### Step 3 — Paste Job Description
- User pastes the full job description; stored in session
- Pre-filled when arriving via the one-click Tailor Resume flow from Jobs page

### Step 4 — Select Template + Optional Extras
- Template gallery (prebuilt or custom upload)
- Output format selector — DOCX only (Free) or DOCX + PDF (Plus/Pro); **PDF and Both buttons locked/disabled for free users**
- Optional formatting reference CV — layout mirrored, content never copied (Pro only)
- Optional **Additional Instructions** textarea — passed to generator as `additional_instructions`

### Step 5 — AI Resume Generation
1. **Profession resolution** — `target_role` matched against keyword lists
2. **Job Analyzer** — one LLM call extracts top-N skills (N from `get_limit(tier, "key_skills")`)
3. **Generator** — writes resume JSON
4. **Evaluators** — run in parallel; score 0–100
5. **Aggregator** — if all pass `PASS_THRESHOLD` → exit; else send feedback → next cycle
6. Repeats up to `MAX_EVAL_CYCLES`; best result always returned

Quality scores never shown to users — qualitative labels only (Excellent / Strong / Good / Reviewed).

### Step 6 — Download
- DOCX always generated; PDF via reportlab (Plus/Pro only)
- Files stored in GridFS; auto-expire after 24 hours

---

## 5. Account Profile (`/profile`)

A persistent profile stored in the `user_profiles` MongoDB collection.

### 5.1 Fields

| Field | Type | Notes |
|---|---|---|
| `full_name` | string | |
| `email` | string | |
| `phone` | string | |
| `linkedin` | string | Full URL |
| `location` | string | City + country/state |
| `target_roles` | string[] | TagInput (multi); used to seed job searches |
| `primary_skill` | string | TagInput (single); one core technical/professional skill |
| `key_skills` | string[] | TagInput (multi); async autocomplete from `/api/catalog/skills` |
| `summary` | string | 2–3 sentence professional summary |
| `resume_text` | string (internal) | Raw text from uploaded resume |

### 5.2 Resume Upload + AI Prefill
- Accept PDF / DOCX; max 5 MB
- Claude extracts (max_tokens 1024): `full_name`, `email`, `phone`, `linkedin`, `location`, `target_role` → `target_roles`, `primary_skill`, `key_skills`, `summary`
- Fields only overwritten if AI returns a non-empty value

### 5.3 LinkedIn Profile Import
- User pastes full LinkedIn profile URL (e.g. `https://www.linkedin.com/in/username/`)
- UI: "Import Profile" button inline with the LinkedIn URL field
- Backend: `POST /api/linkedin/parse` → `linkedin_service.py`
  - Extracts username slug from URL
  - Calls `GET https://linkdapi.com/api/v1/profile/full?username=<slug>`
  - API: LinkdAPI (`linkdapi.com`); requires separate `LINKDAPI_KEY` env var
- Returns: `{full_name, headline, location, email, summary, skills[], raw_text}`
- Profile fields patched: name, email, location, summary, key_skills (non-empty only)
- Builder Step 1: also available as "or import from LinkedIn" section — creates session without file upload

### 5.4 Resume Library (Plus+)
- Upload resumes directly or save tailored ones from the builder
- Plus: max 5 resumes (enforced via `get_limit(tier, "resume_library")`); Pro: unlimited
- Actions: rename, download, delete
- Used by "Apply with Saved" on the Jobs page (`ResumePickerModal`)

---

## 6. Job Search (`/jobs`) — Plus+ only

### 6.1 Search Bar
- **Query field** uses `TagInput`; autocomplete from `/api/catalog/roles`
- **Location field** — plain text TagInput; pre-filled from profile on load
- Pre-fill: profile `target_roles` + `primary_skill` → search tags; auto-search on Plus/Pro

### 6.2 Job Cards
- Employer logo, job title (clickable → opens listing in new tab), employer name, publisher, location, employment type, remote badge, salary, posted date
- **Tailor Resume** — stores JD + job title + employer to localStorage → redirects to `/builder/upload`
- **Apply with Saved** — opens `ResumePickerModal`
- **Save / Unsave** — bookmark icon; saved jobs retrievable across sessions

### 6.3 Result Caching
- Same query + location + page served from MongoDB cache within `JSEARCH_CACHE_TTL_S` seconds
- Cache stored in `search_cache` collection

### 6.4 Quota Management
- Monthly call counter; warning at `JSEARCH_QUOTA_WARN_PCT`%; hard limit `JSEARCH_MONTHLY_LIMIT`
- Alert scheduler calls also count toward this budget

### 6.5 Job Alerts (Plus+ only)

**Alert model:**
- `name`, `query_tags[]`, `location_tags[]`, `is_active`, `seen_job_ids[]` (capped 1000)

**Limits:** Plus = max 5 alerts; Pro = unlimited (both via `get_limit(tier, "job_alerts")`).

**Duplicate detection:** tags normalised (sorted+stripped) on both create AND update; 409 on duplicate.

**Email digest (Brevo HTTP API):**
- Sent daily at `ALERT_SEND_HOUR` UTC by APScheduler cron
- Subject: `Your job alert: {name} — Top N jobs`
- No-results notification when JSearch returns empty

**Scheduler reliability (updated v1.7):**
- `_search_jobs()` returns `None` (error/quota-exhausted) vs `[]` (genuine zero results)
- `None` → alert silently skipped, retried tomorrow; user gets no false "no results" email
- 3 retries with 1-second delay between attempts before returning `None`
- Quota checked before each JSearch call; counter incremented on success
- After daily run: ONE summary email to `settings.support_email` if any alerts failed

**send-test endpoint** (`POST /api/jobs/alerts/send-test`):
- **Requires superadmin authentication**
- Sends digest or no-results email for user's first active alert
- Returns 502 if JSearch unavailable (not a false no-results email)

---

## 7. Functional Requirements

### 7.1 Resume Upload & Parsing
- Accept `.pdf` and `.docx`, max 5 MB

### 7.2 LinkedIn Profile Import
- Accept LinkedIn profile URL; extract username slug; call `linkdapi.com/api/v1/profile/full`
- Available on Profile page and Builder Step 1

### 7.3 User Profile Form (builder session)
- Fields: Full Name, Email, Phone, LinkedIn, Location, Target Role, Preferred Tone, Key Skills, Additional Notes
- Required: Full Name, Email

### 7.4 Job Description Input
- Large textarea; min 50 characters enforced

### 7.5 Template System
- Prebuilt templates, custom upload, optional formatting reference CV (Pro)
- **Output format**: DOCX only (Free); PDF/Both buttons unlocked for Plus/Pro; buttons locked with "Plus+" badge for free users at Step 4

### 7.6 AI Resume Generation Pipeline
See §4 — unchanged from v1.6 except skill count now uses `get_limit(tier, "key_skills")`.

### 7.7 Editable Preview
- Inline editing; full + per-section regeneration; locked facts (Pro); custom sections; quality labels

### 7.8 File Generation & Download
- DOCX always; PDF (Plus/Pro only); files expire 24h from GridFS

### 7.9 Subscription Tiers

| Feature | Free | Plus | Pro |
|---|---|---|---|
| Resume builder (6-step flow) | ✅ | ✅ | ✅ |
| DOCX export | ✅ | ✅ | ✅ |
| PDF export | ❌ | ✅ | ✅ |
| LinkedIn profile import | ✅ | ✅ | ✅ |
| Persistent profile | ✅ | ✅ | ✅ |
| AI evaluators | Anthropic only | Anthropic + OpenAI | All three |
| Key skills extracted from JD | 3 | 5 | 10 |
| Resume sessions | 5 | 20 | Unlimited |
| Job search (JSearch) | Browse only | ✅ | ✅ |
| Saved jobs | ❌ | Up to 25 | Unlimited |
| One-click Tailor | ❌ | ✅ | ✅ |
| Resume Library | ❌ | Up to 5 | Unlimited |
| Job Alerts (daily digest) | ❌ | Up to 5 alerts | Unlimited |
| Section-level regeneration | ❌ | ❌ | ✅ |
| Locked Facts panel | ❌ | ❌ | ✅ |
| Sample CV formatting reference | ❌ | ❌ | ✅ |

> All limits and feature gates are dynamically configurable via Admin → Tier Config without code changes. No hardcoded tier dicts remain in the codebase.

---

## 8. Non-Functional Requirements

- **Responsiveness**: Desktop, tablet, and mobile
- **Performance**: AI generation non-streaming (spinner shown); job search results cached
- **Scalability**: Agents stateless; evaluators run concurrently; aggregator pure computation
- **Error handling**: Graceful errors at all levels; LinkedIn import failure surfaces user-friendly message; scheduler errors send support notification
- **Security**: API keys in Railway env vars; JWT auth for all account endpoints; `send-test` requires superadmin; scores not shown in UI
- **File cleanup**: Generated files auto-deleted from GridFS after 24 hours
- **Dynamic limits**: All tier limits via `get_limit()` / `getTierLimitDynamic()` — admin-configurable

---

## 9. Data Model (MongoDB)

### `users` collection
```json
{
  "_id": "ObjectId",
  "email": "string (unique index)",
  "name": "string",
  "hashed_password": "string (optional)",
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
  "user_id": "ObjectId (ref users, nullable for anonymous sessions)",
  "linkedin_imported": "boolean",
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
  "user_id": "string (str(ObjectId))",
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
  "query_tags": ["string (sorted)"],
  "location_tags": ["string (sorted)"],
  "is_active": true,
  "seen_job_ids": ["string"],
  "last_sent_at": "datetime (nullable)",
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
  "content_type": "string",
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
| PUT | `/api/account/profile` | Save profile |
| POST | `/api/account/profile/resume` | Upload resume → AI prefill |
| POST | `/api/sessions/from-profile` | Create builder session from profile |

### LinkedIn Import
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/linkedin/parse` | Parse LinkedIn URL → extract profile data |

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

### Job Search
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/jobs/search` | JSearch — cached |
| GET | `/api/jobs/quota` | Monthly usage stats |
| POST | `/api/jobs/save` | Save a job (Plus+) |
| GET | `/api/jobs/saved` | List saved jobs |
| DELETE | `/api/jobs/saved/{job_id}` | Unsave |

### Job Alerts (Plus+)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/jobs/alerts` | List all alerts |
| POST | `/api/jobs/alerts` | Create alert |
| PATCH | `/api/jobs/alerts/{id}` | Update alert |
| DELETE | `/api/jobs/alerts/{id}` | Delete alert |
| PATCH | `/api/jobs/alerts/{id}/toggle` | Enable / disable alert |
| POST | `/api/jobs/alerts/send-test` | Trigger test email (superadmin only) |

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
| `/profile` | Account profile — resume upload + LinkedIn import, personal info, career fields, Resume Library |
| `/jobs` | Job search — TagInput query bar, JSearch results, save/tailor/apply actions, My Alerts tab |
| `/builder/upload` | Step 1 — drag-and-drop upload OR LinkedIn import |
| `/builder/profile` | Step 2 — AI pre-filled profile confirmation |
| `/builder/job` | Step 3 — paste job description |
| `/builder/template` | Step 4 — template gallery; PDF locked for free users |
| `/builder/preview` | Step 5 — editable preview; locked facts; section regen; custom sections |
| `/builder/download` | Step 6 — download DOCX / PDF; PDF locked for free users |
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
JWT_SECRET=
JWT_ALGORITHM=HS256
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DEV_BYPASS_AUTH=false

# Model names
GENERATOR_MODEL=claude-sonnet-4-20250514
ANTHROPIC_EVALUATOR_MODEL=claude-sonnet-4-20250514
OPENAI_EVALUATOR_MODEL=gpt-4o-mini
GOOGLE_EVALUATOR_MODEL=gemini-2.5-flash

# Evaluator flags
ANTHROPIC_EVALUATOR_ENABLED=true
OPENAI_EVALUATOR_ENABLED=false
GOOGLE_EVALUATOR_ENABLED=false

# Pipeline controls
PASS_THRESHOLD=50
MAX_EVAL_CYCLES=3
MAX_AI_CALLS_PER_SESSION=10
SKILL_EXTRACTION_COUNT=3        # Fallback only; tier limits override via tier_config_service

# Job search & LinkedIn import
RAPIDAPI_KEY=                   # Used for JSearch (job search) only
LINKDAPI_KEY=                   # Used for LinkedIn profile import (linkdapi.com — free tier available)
JSEARCH_MONTHLY_LIMIT=500
JSEARCH_QUOTA_WARN_PCT=50
JSEARCH_CACHE_TTL_S=7200

# Feature flags
PDF_EXPORT_ENABLED=false
FEATURED_PROFESSION_SLUG=software_engineer

# Storage
STORAGE_BACKEND=local
STORAGE_LOCAL_PATH=./uploads
AWS_S3_BUCKET=
AWS_S3_PREFIX=uploads/
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Infrastructure
MONGODB_URI=
ALLOWED_ORIGINS=https://your-frontend.railway.app
SUPPORT_EMAIL=samorsameer@gmail.com   # Recipient for error + scheduler failure emails

# Email — Brevo HTTP API
BREVO_API_KEY=
BREVO_SENDER_EMAIL=
ALERT_SEND_HOUR=8
ALERT_MAX_JOBS_PER_EMAIL=10

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
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true
NEXT_PUBLIC_DEV_BYPASS_AUTH=false
```

---

## 13. Out of Scope (v1)

- Subscription billing and payment processor integration
- Resume version history
- Cover letter generation
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

All structured LLM inputs serialised with **TOON** (`toon-format==0.9.0b1`); outputs remain plain JSON. Wrapper at `backend/services/pipeline/toon.py`.

| Tier | Active evaluators | Tokens saved / generation |
|---|---|---|
| Free | 1 | ~280 |
| Plus | 2 | ~950 |
| Pro | 3 | ~2,500 |

---

## 16. Dynamic Tier Configuration

All tier-based limits enforced via `tier_config_service` — no hardcoded dicts in any router or page.

**Backend:** `get_limit(tier, key)` from `tier_config_service` — used in `resume_library.py`, `job_alerts.py`, `jobs.py`, `generate.py`.

**Frontend:** `getTierLimitDynamic(tier, key)` from `lib/tierConfig.ts` — used in all limit displays and gating logic. `buildFeatures(tierId)` in `PricingTiers.tsx` computes pricing card features at render time.

**Admin UI:** Admin → Tier Config → Numeric Limits table — edit any limit value; changes take effect immediately.

**TIER_LIMITS keys:**

| Key | Free | Plus | Pro | Description |
|---|---|---|---|---|
| `resume_sessions` | 5 | 20 | Unlimited | Builder sessions started |
| `resume_library` | 0 | 5 | Unlimited | Saved resumes in library |
| `saved_jobs` | 0 | 25 | Unlimited | Bookmarked job listings |
| `job_alerts` | 0 | 5 | Unlimited | Daily alert searches |
| `evaluators` | 1 | 2 | 3 | AI evaluators active |
| `key_skills` | 3 | 5 | 10 | Skills extracted from JD |

---

## 17. Naming Conventions

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

*End of User Requirements Document — TailorMyCv v1.7*

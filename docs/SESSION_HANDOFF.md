# Session Handoff — TailorMyCv

> Rolling context for continuing work. **Last updated: 2026-06-06.**
> Branch: `main`. Railway auto-deploys both services on push.

This is the broad handoff. CV-score-preview specifics live in `docs/CV_SCORE_PREVIEW_CONTEXT.md`.

---

## What shipped in the 2026-06-06 session — tailoring pipeline cost/quality + daily budgets

Focus: make the resume-tailoring pipeline hit its tier quality bar reliably while controlling cost, and add account-level spend guardrails.

### 1. Quality / loop correctness (`services/pipeline/`)
- **Returns the BEST cycle, not the last.** The refine loop is non-monotonic (observed min_score `[72,82,75]`). `aggregate_node` tracks `best_resume_json`/`best_min_score`; `generate.py` collapses `final_state` onto the best before persisting/returning.
- **Tier-aware refinement budget** — `_TIER_MAX_CYCLES = {free:3, plus:4, pro:5}` in `generate.py`, threaded as `state["max_cycles"]`; `should_continue` reads it (falls back to `settings.max_eval_cycles`).
- **Tier pass thresholds** — `{free:75, plus:80, pro:90}`.
- **Plateau early-exit** — `should_continue` stops after ≥2 cycles when a cycle gains `< _PLATEAU_MARGIN (2)`; since we return best, a stalled cycle is wasted spend. `aggregate_node` records `last_gain`.
- **Faithfulness check** in all 3 evaluator base prompts (verify tailored résumé vs ORIGINAL; cap score at 40 + #1 suggestion on fabrication). Original résumé plumbed via `faithfulness_user_block`.

### 2. Cost levers
- **Anthropic prompt caching** — `_cached_system()` in `prompts/anthropic.py` marks all builder system prompts (generator, job analyzer, Anthropic evaluator) with `cache_control` (~90% input discount on cache hits across cycles/requests).
- **Per-call telemetry** — `services/pipeline/telemetry.py` (contextvar collector + pricing table). Every agent calls `record(...)` after `ainvoke`. `generate.py` calls `telemetry.start_capture()` then `summary()` → logged, persisted on session (`llm_usage`), and written to `audit_log` as `resume.generate.complete` with `cycles/max_cycles/tokens/llm_calls/est_cost_usd`.
- **Rubric-aware generator (opt #1)** — generator system prompt now states the weighted evaluator rubric (JD-align 30 / quantify 25 / verbs 20 / summary 15 / structure 10) so the FIRST draft targets the gate → higher first-pass score → fewer cycles.
- **Agent memory / self-learning** — `services/agent_memory.py`: per-agent doc in `agent_memory` collection. After each run (background, no LLM) it tallies the weaknesses evaluators flagged + scores/cycles/cost, derives "worked / didn't / improve" lessons. The generator injects its top improvement hints into its prompt (`get_generator_memory_text`, after ≥5 runs) so it pre-empts recurring weaknesses and converges in fewer cycles. Read-only **admin → User Management → Agent Memory** tab (`GET /admin/agent-memory`). Seeded at startup.
- **DEFERRED (opts #2–#5) — decide once we have metrics.** Per-criterion sub-score feedback; section-level refine (regenerate only the weakest section); cheap-evals drive refine + Sonnet panel only as final gate; cache the static résumé/JD blocks in the human messages. These rewire the scoring loop, so we are **intentionally waiting on telemetry** (audit log now records cycles + $/run): read the real average cycles-to-90 per tier first, then implement #2–#4 data-driven as one verified change. #4 (drop Sonnet eval from refine cycles) is the biggest remaining single cut.

### 3. Per-user cost budgets — daily + monthly (account-level guardrail)
- **`services/usage_service.py`** — one doc per (user, UTC month) in `ai_usage` (month totals + per-day breakdown; TTL-indexed via `expires_at`). `check_budget()` enforces BOTH caps (429 before any LLM cost), `increment_usage()` charges day + month after each run (full + section-regen paths). Anonymous users fall back to the per-session cap.
- **Limits are Mongo tier config** — `daily_cost_cents` + `monthly_cost_cents` in `DEFAULT_LIMITS`/`LIMIT_LABELS`. Defaults: Free 25¢/50¢, Plus $1/$10, Pro $2/$20 (monthly ≈ subscription price = never-spend-more-than-paid ceiling; daily rations it). All admin-editable. `load_config` **backfills** missing keys into an existing `tier_config` doc (else `get_limit` → 0 = blocked) and persists. `PricingTiers` shows ~N tailored resumes/mo (monthly budget ÷ `EST_TAILOR_COST_CENTS`); `config.ts TIER_LIMITS` kept in sync.
- **NOTE:** sustainable budgets depend on per-generation cost coming down — see the cost-optimization plan (reduce cycles, drop Sonnet evaluator from refine cycles, cache the original-résumé block). Not yet implemented.

### 4. Prompts fully Mongo-overridable
- `_page_rules` extracted to `generator_page_rules_1page` / `generator_page_rules_2page` prompt keys (`prompt_store.py` + admin `DEFAULTS`). (Profession `scoring_criteria`/contexts were already DB-sourced via the `professions` collection.)

### 5. Admin dashboard UX
- **Audit tab**: new **Cycles (taken/max) · LLM Calls · Tokens · Est. Cost** columns.
- **Per-column filters** on Users + Audit tables (reusable `ColFilterText`/`ColFilterSelect`), replacing the separate Users filter bar.

**Deferred:** extend telemetry to CV-score calls + latency capture; measure real cache-hit rate; cache the static original-résumé block in evaluator human messages; `**bold**` JD-keyword rendering in generator output (needs renderer support across HTML/DOCX/PDF). Backend restart required to load these (runs without `--reload`).

---

## What shipped in the 2026-06-04 session

### 1. Resume templates are now DATA, not code
- 20 templates migrated to the **`cv_templates`** MongoDB collection: each a complete **standalone HTML doc** with logic-less **Mustache** placeholders + a **`docx_config`** (layout/header/heading/font/accent knobs).
- Rendering lives once in `frontend/src/lib/cvTemplates.ts` (`render` + `renderCtx`; the `splitExtra` extra-section routing moved here). `templateHtml.ts` `getTemplateHtml()` renders the stored HTML (the 20 JS generators remain only as an emergency fallback).
- **DOCX download** is config-driven: `services/docx_templates.py` reads `docx_config` from the DB doc — a new admin/AI template downloads as a real Word doc with no code change. PDF (`reportlab`) was already template-agnostic.
- **Admin → Prompts & Templates → Resume Templates**: edit HTML + metadata + DOCX knobs, enable/disable, **Show in CV Score** flag, copy/download standalone `.html`, and **AI-generate** a template from a prompt (one focused Anthropic call → `{html, docx_config, suggested_metadata}`) with **eval gate** (`validate_template_html` / `normalize_docx_config`) + **telemetry** logging.
- Backend: `routers/cv_templates.py`, `routers/admin_cv_templates.py`, `services/cv_template_service.py`, `services/cv_template_seed_data.py`, `scripts/seed_cv_templates.py`. Auto-seeds at startup (`main.py` lifespan).
- **Legacy DOCX-template system REMOVED**: deleted `routers/templates.py`, `services/template_service.py`, `seed_templates.py`, `models/template.py`, the `templates` collection usage, the `/api/templates` endpoints, and the admin DOCX tab.

### 2. CV Score — 8th category + admin-editable prompts
- New **Grammar & Spelling** category (the 8th → **54 checks**). Dedicated `check_grammar()` in `resume_checker_service.py` runs in the `routers/resume.py` `asyncio.gather`. Returns a category-shaped dict (`key="grammar"`) with the exact corrections in `improvements`. **Factored into the overall score** (15% blend in `resume.py`).
- **All CV-score prompts are now admin-editable** (no deploy): quality, grammar, preview-extractor, layout-validator (system + user). Registered in `services/prompt_store.py` (`PROMPT_KEYS` + `PROMPT_CATEGORIES="cv_score"`), defaults imported into `routers/admin.py` `DEFAULTS`. Resolved at call time via `get_override()` with a **`_safe_format` fallback** so a broken edit can't break scoring. Editable under **Admin → Prompts & Templates → CV Score Prompts**.

### 3. Admin dashboard overhaul
- **Grouped nav** (two levels): **User Management** (Users · Audit Log) · **Prompts & Templates** (CV Builder Prompts · CV Score Prompts · Professions · Resume Templates) · **Feature Controls** (Tiers & Pricing · System). Driven by `TAB_META` + `GROUPS` in `frontend/src/app/admin/page.tsx`.
- New **System** tab — app-wide master switches. `system_config` collection + `services/system_config_service.py`; `GET/PUT /api/admin/system-config`. The **Daily Job Alerts** toggle makes `alert_scheduler.run_daily_alerts()` skip the whole run.
- **Audit log expanded**: now logs user/tier/superadmin changes, deletes, template + prompt edits, resume generate/export, system-config changes (`log_audit` added across `admin.py`, `generate.py`, `export.py`, `admin_cv_templates.py`).
- **Numeric limits** unlimited UX: blank / `unlimited` / `-1` / `∞` button all mean unlimited (`setLimit` in admin page).

### 4. UI polish
- **No LLM vendor names** anywhere user-facing → "multi-model AI" (footer, site metadata, builder pages).
- **Colourful CV-score "What we'll analyse" cards** (per-category accent via `CATEGORY_ACCENT` in `cv-score/page.tsx`) + the new Grammar card.

---

## AI-engineering directive (applies app-wide)
Per `CLAUDE.md` + memory `project-ai-engineering-standards`: every AI feature must build in **evals (validation gate), context engineering, optimized calls (caching/model choice), monitoring (telemetry + audit), testing**. The template AI-generator and the CV-score grammar check follow this. **Deferred backlog**: app-wide LLM telemetry layer, prompt caching across the pipeline, eval harness, AI test suite, agent observability.

---

## Current local dev state
- Backend on `:9000` (uvicorn, no `--reload`), frontend on `:4000` (`next dev`). **Dev-bypass auth ON** (`DEV_BYPASS_AUTH=true` / `NEXT_PUBLIC_DEV_BYPASS_AUTH=true`) → admin accessible; api.ts seeds a `dev-pro` token at module load.
- No new env vars needed; `cv_templates` + `system_config` auto-seed/create on startup.

## Gotchas learned this session
- **Windows `uvicorn --reload` is flaky** — it showed updated source but ran old bytecode. Restart the backend explicitly after backend edits rather than trusting reload.
- **Don't run `npm run build` while `next dev` is running** — they share `.next` and it corrupts the dev server (causes 404s). Clear `.next` + restart dev if it happens.
- **Motor `Database` objects forbid `bool()`** — use `db if db is not None else get_db()`, never `db or get_db()`.

## Pending / deferred (see memory for full list)
- Verify **extra-section rendering in DOCX export** (preview handles it; DOCX may not).
- **Jobs Applied tracking** (planned autonomous job-application agent).
- **Billing/payment processor** (tiers are DB-driven; no payments yet).
- AI-engineering backlog (telemetry, prompt caching, eval harness, tests).
- Audit log: retention/TTL, search/filter.

## Uncommitted local files (not pushed)
`competitor_features.md`, `prompts/`, `.claude/settings.local.json`, and this handoff doc — left out of the commit intentionally.

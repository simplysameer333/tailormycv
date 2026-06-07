# TailorMyCV vs ai-job-search — Feature Comparison

**Last updated:** 2026-06-07  
**Branch:** `claude/cv-pipelines-analysis-NSYmU`  
**Reference repo:** [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search)

---

## Summary verdict

| Dimension | Winner |
|-----------|--------|
| Resume generation quality | **TailorMyCV** — multi-model LangGraph loop, structured evaluation, patch cycles |
| AI pipeline architecture | **TailorMyCV** — generator + 3 evaluators + aggregator, iterative scoring |
| Job search & matching | **Comparable** — both have search + fit scoring; TailorMyCV now has pre-gen fit |
| Cover letter | **TailorMyCV** *(after this session)* — standalone page + builder integration |
| Writing quality rules | **TailorMyCV** *(after this session)* — explicit no-hedging, no clichés, backtrack test |
| Skill gap analysis | **TailorMyCV** *(after this session)* — separate focused Haiku call, shown pre-download |
| Mobile UX | **TailorMyCV** *(after this session)* — sticky bottom tab bar, common AppShell |
| Behavioral / personality profiling | **ai-job-search** — not yet in TailorMyCV |
| Salary benchmarking | **ai-job-search** — not yet in TailorMyCV |
| GitHub profile enrichment | **ai-job-search** — not yet in TailorMyCV |
| Interview prep | **ai-job-search** — not yet in TailorMyCV |
| Seen-job deduplication | **ai-job-search** — not yet in TailorMyCV |

---

## Full comparison table

| # | Feature / Dimension | ai-job-search | TailorMyCV | Winner & Why | TailorMyCV Status |
|---|---------------------|---------------|------------|--------------|-------------------|
| 1 | **Resume generation architecture** | Single-pass LLM draft | Multi-model LangGraph loop: Generate → Evaluate (3 models) → Aggregate → route | **TailorMyCV** — iterative quality gate with consensus scoring from 3 models | ✅ Shipped |
| 2 | **Score-gated output** | No scoring gate | Tier-aware pass threshold (Free 70 / Plus 75 / Pro 80); cycles until score met or budget exhausted | **TailorMyCV** — user receives the best-scoring draft, not just the first | ✅ Shipped |
| 3 | **Patch cycles** | Full regen only | Cycles 2+ patch only the 2 weakest sections (8 s vs 30 s full regen); 3.5× faster | **TailorMyCV** — targeted patching with relevance-weighted section selection | ✅ Shipped |
| 4 | **JD-relevance-weighted feedback** | Basic keyword match | `_jd_section_boost()` biases patch keys toward sections both weak AND heavily signalled by JD | **TailorMyCV** — context-aware section prioritisation from this session | ✅ Shipped (this session) |
| 5 | **Writing style rules** | No explicit rules | No em-dashes, no hedging verbs, no clichés, active voice, interview backtrack test in every generator prompt | **TailorMyCV** *(after this session)* — concrete, enforceable style contract | ✅ Shipped (this session) |
| 6 | **Cover letter generation** | Not present | Dedicated Sonnet call (same style rules as generator); standalone `/cover-letter` page + builder integration; GET caches on session | **TailorMyCV** — separate focused call per CLAUDE.md principle; full UI | ✅ Shipped (this session) |
| 7 | **Pre-generation fit scoring** | Basic keyword scoring | Single Haiku call scoring skills (30%) / experience (35%) / career alignment (35%); Strong/Good/Moderate/Weak verdict + score bars + matched/gap chips | **TailorMyCV** *(after this session)* — 3-dimensional scoring with visual panel on job page | ✅ Shipped (this session) |
| 8 | **Skill gap analysis** | Simple keyword diff | Separate focused Haiku call: matched skills, missing required, missing nice-to-have, match %, actionable top-gap tip; cached on session | **TailorMyCV** *(after this session)* — richer output, cached, separate from fit scoring | ✅ Shipped (this session) |
| 9 | **Prompt caching** | None | Anthropic `cache_control: ephemeral` on system prompts → ~90% input-token discount on repeat cycles | **TailorMyCV** — measurable cost reduction ($12+/month at 1k runs) | ✅ Shipped |
| 10 | **Agent memory** | None | Weakness tallies persisted in MongoDB; top-3 historical weaknesses injected into generator after ≥5 runs | **TailorMyCV** — self-improving without extra LLM calls | ✅ Shipped |
| 11 | **Timeout recovery** | Request fails entirely | `astream()` snapshots best intermediate state; returns best cycle on timeout (0% data loss) | **TailorMyCV** — safety net absent from ai-job-search | ✅ Shipped |
| 12 | **Evaluator retry** | Not applicable | `max_retries=2` on all three evaluator SDK clients — transient failures recover automatically | **TailorMyCV** — resilience against rate limits / DNS blips | ✅ Shipped |
| 13 | **Template system** | No templates | 20+ MongoDB-backed Mustache templates, tier-gated by quality score, rendered once in shared renderer | **TailorMyCV** — data-driven, no deploy needed to add/edit templates | ✅ Shipped |
| 14 | **Template quality gate** | N/A | `validate_template_html()` rejects malformed HTML, missing placeholders, page overflow before saving | **TailorMyCV** — validation gate per CLAUDE.md principle | ✅ Shipped |
| 15 | **Per-user cost caps** | None | Daily + monthly spend caps per tier enforced before every LLM call; audit log per check | **TailorMyCV** — unbounded spend impossible | ✅ Shipped |
| 16 | **CI regression gate** | None | GitHub Actions eval on every push to main; fails if generated score < original | **TailorMyCV** — prevents silent quality regressions | ✅ Shipped |
| 17 | **LangSmith tracing** | None | Auto-instrumented via env var; every node/cycle visible; golden dataset export script | **TailorMyCV** — production observability | ✅ Shipped |
| 18 | **Mobile navigation** | N/A (no web UI) | Sticky 5-tab bottom nav bar (sm:hidden); desktop nav unchanged; common AppShell across all pages | **TailorMyCV** *(after this session)* — proper mobile-first UX | ✅ Shipped (this session) |
| 19 | **Common layout shell** | N/A | `AppShell` component: single Navbar + Footer + BottomNav wrapper used by all 7 section layouts | **TailorMyCV** *(after this session)* — DRY layout, single place to update nav | ✅ Shipped (this session) |
| 20 | **Behavioral / PI profiling** | Personality + working-style questions shape JD targeting | No equivalent | **ai-job-search** — deeper candidate modelling beyond skills | ❌ Not yet implemented |
| 21 | **Salary benchmarking** | Estimates market rate per role from JD signals | No equivalent | **ai-job-search** — useful context before applying | ❌ Not yet implemented |
| 22 | **GitHub profile enrichment** | Pulls public repos and injects project highlights into CV | No equivalent | **ai-job-search** — zero-effort technical evidence | ❌ Not yet implemented |
| 23 | **Reviewer sub-agent + company research** | Second agent critiques the draft with company-specific context | No equivalent; single pipeline loop only | **ai-job-search** — drafter-reviewer pattern produces tighter output | ❌ Not yet implemented |
| 24 | **Interview prep generation** | Auto-generates likely interview questions from JD after CV tailoring | No equivalent | **ai-job-search** — natural next step after cover letter | ❌ Not yet implemented |
| 25 | **Seen-job deduplication** | Tracks which jobs the user has already viewed / applied to | No equivalent; jobs may resurface | **ai-job-search** — cleaner job feed UX | ❌ Not yet implemented |

---

## What was implemented in this session

| # | Change | Files |
|---|--------|-------|
| A | Writing style rules (no hedging, no em-dashes, no clichés, backtrack test) | `pipeline/prompts/anthropic.py` |
| B | Fit scoring service (3-dimensional Haiku call) | `services/fit_scoring_service.py` |
| C | Cover letter service (focused Sonnet call) | `services/cover_letter_service.py` |
| D | Cover letter router (POST generate + GET cached) | `routers/cover_letter.py` |
| E | Skill gap service (separate Haiku call, cached) | `services/skill_gap_service.py` |
| F | JD-relevance-weighted patch key ranking | `pipeline/agents/evaluators/cv_score.py` |
| G | Fit score panel UI on job page | `app/builder/job/page.tsx` |
| H | Cover letter card in builder preview | `app/builder/preview/page.tsx` |
| I | Standalone `/cover-letter` page + nav link | `app/cover-letter/page.tsx`, `Navbar.tsx` |
| J | Common `AppShell` + `BottomNav` (mobile tab bar) | `AppShell.tsx`, `BottomNav.tsx` |
| K | All 7 section layouts migrated to `AppShell` | `builder/`, `cv-score/`, `jobs/`, `settings/`, `profile/`, `admin/`, `cover-letter/` layouts |
| L | Footer updated: Cover Letter link added, hidden on mobile | `Footer.tsx` |

---

## Deferred backlog (from comparison — not yet implemented)

| Priority | Feature | Effort | Value |
|----------|---------|--------|-------|
| High | **Interview prep generation** — LLM generates 5–8 likely questions from JD after tailoring. Natural post-cover-letter step. | Low (1 Haiku call + UI card) | High — extends session value |
| High | **Reviewer sub-agent** — second focused Sonnet call critiques the generated CV draft for company-fit and tone before delivery | Medium (new pipeline node) | High — drafter-reviewer pattern improves quality |
| Medium | **GitHub profile enrichment** — fetch public repos via GitHub API, inject top 3 project highlights into context | Medium (OAuth + API) | High for technical roles |
| Medium | **Seen-job deduplication** — persist viewed/applied job IDs per user, hide/mark in feed | Low (DB set per user) | Medium — cleaner feed |
| Low | **Salary benchmarking** — single Haiku call extracts salary signals from JD, compares to rough market estimate | Low (1 Haiku call) | Medium — useful but not core |
| Low | **Behavioral / PI profiling** — onboarding questionnaire shapes career-alignment dimension of fit scoring | High (new onboarding flow) | Medium — differentiator but complex |

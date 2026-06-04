# CV-Score Preview & Resume Generator — Session Context

> Handoff doc for continuing work. Last updated 2026-06-03.
> Branch: `main`. NOTE (2026-06-03): the template system was migrated to MongoDB (`cv_templates`) — see **Template migration** below. That work is in the working tree (not yet committed at time of writing).

## Big picture

Two separate flows, **decoupled by design**:

| Flow | What it does | Rules live in |
|---|---|---|
| **CV-score preview** | Shows the user's **uploaded** CV faithfully, curated, in **admin-selected** templates (`show_in_cv_score`; defaults to the original 4) | `frontend/.../TemplatePreviews.tsx` → `PREVIEW_RULES`; templates from `cv_templates` (Mongo) |
| **Builder (generator)** | AI **writes** a tailored resume for ONE chosen template → DOCX | `backend/.../prompts/anthropic.py` → `_page_rules()` |

## Template migration (2026-06-03)

The 20 templates are now **data, not code** — stored in the `cv_templates` MongoDB collection as standalone HTML docs with logic-less **Mustache** placeholders, rendered by `frontend/src/lib/cvTemplates.ts` (`render` + `renderCtx`; `splitExtra` routing moved here). `templateHtml.ts` `getTemplateHtml()` now renders the stored HTML (the 20 JS generators remain as a zero-regression fallback). The CV-score gallery uses `show_in_cv_score`; the builder gallery uses the active set. DOCX downloads render from each template's `docx_config` via `services/docx_templates.py` (now config-from-DB). Admin → **Manage Templates** tab adds edit / enable-disable / CV-score flag / copy-download HTML / **AI generation** (one call + eval gate + telemetry). Backend: `services/cv_template_service.py`, `services/cv_template_seed_data.py`, `routers/cv_templates.py`, `routers/admin_cv_templates.py`, `scripts/seed_cv_templates.py`.

**Rule:** preview rules and generator rules are independent — even for the same template, the preview may curate differently from the generated resume. Tune separately. (Both code spots carry a header comment pointing at the other.)

## Update (2026-06-04)

- **Grammar & Spelling = 8th CV-Score category.** New dedicated `check_grammar()` in `resume_checker_service.py` runs in the `routers/resume.py` `asyncio.gather` (alongside quality + extractor). Returns a category-shaped dict (`key="grammar"`) with the exact corrections in `improvements`; **factored into the overall score** (15% blend in `resume.py`). Counts updated to **8 categories · 54 checks** in the cv-score UI.
- **CV-Score prompts are now admin-editable.** All CV-Score prompts (quality, grammar, extractor, validator — system + user) registered in `prompt_store.py` (`PROMPT_CATEGORIES = "cv_score"`), resolved at call time via `get_override` with a `_safe_format` fallback. Editable under **Admin → Prompts & Templates → CV Score Prompts**.
- **Legacy DOCX-template system removed** (the old `templates` collection / `templates.py` / `template_service.py` / `seed_templates.py`). Resume templates live only in `cv_templates`; admin tab renamed **Resume Templates**.

---

## What was built this session

### 1. Dedicated LLM resume extractor (the key quality fix)
- `extract_resume_for_preview(raw_text, key)` in `resume_checker_service.py` — a SEPARATE focused LLM call (Haiku, 8k tokens) that faithfully parses the full resume. Runs **in parallel** with `check_resume` (51-check quality analysis) via `asyncio.gather` in `routers/resume.py`.
- Why: extraction was bolted onto the quality prompt → overloaded LLM → merged roles, truncated bullets, dropped sections. Splitting fixed all of it.
- Returns: name, title, email, phone, location, linkedin, summary, skills[], experience[{role,company,location,dates,bullets[]}], education[{degree,institution,dates}], extra_sections[{title,items[]}].
- Regex parser `extract_full_profile` (alias `extract_contact_regex`) is the per-field fallback.
- **Principle established:** one dedicated LLM call per purpose; parallelise. See `CLAUDE.md` + memory `feedback_dedicated_llm_calls`.

### 2. Dynamic sections (template + uploaded resume)
- ALL non-core sections (Certifications, Languages, Projects, Awards, etc.) flow through as `extra_sections[]` — never hardcoded names.
- `templateHtml.ts` → `splitExtra(d)` routes them by content shape:
  - **highlights** (Accomplishments/Achievements via `HIGHLIGHT_RE`) → featured right after the summary in the main column
  - **compact** (short label lists ≤8 items, ≤40 chars each) → sidebar in 2-col templates
  - **longform** (Projects, Publications, White Papers) → main column
- Education added to ALL template generators (was missing from several).

### 3. Generator counts (resume-writing best practice) — `_page_rules()`
- Skills HARD CAP: 6–8 (1-page) / 8–10 (2-page), with prioritisation order.
- Inverted-pyramid bullets: recent role 3–5, older taper to 1–2.
- NEVER drop a section to fit — compress content within sections.
- `_TEMPLATE_PAGES` map in `generate.py` → `template_pages` flows through PipelineState → generator prompt.

### 4. Resume QA validator — `validate_resume_layout()`
- Dedicated focused LLM call. Returns: `estimated_pages`, `truncated`, `page_breaks_clean`, `optimized`, `page_fit`, `issues[]`, `missing_sections[]`, `suggestions[]`.
- `truncated` = content exceeds page budget (deterministic safety net from estimated_pages).
- `page_breaks_clean` = False if a role/section would straddle a page boundary.
- Wired into builder `generate.py` (best-effort, logs warnings, returns `layout_validation`).

### 5. Page-break hygiene
- Generator prompt: PAGE-BREAK HYGIENE section (one-line bullets, role fits one page, no stranded headings).
- Validator: `page_breaks_clean` field.
- Preview rendering: in-iframe `PAGINATE_SCRIPT` in `templateHtml.ts` pushes any straddling `li`/`.prose` block to start cleanly on the next page. Needs `allow-scripts` on the preview iframe (content is our own escaped HTML — safe).

### 6. Preview UX (competitor-style)
- Curated preview: `PREVIEW_RULES` caps skills (10) + inverted-pyramid bullets ([5,4,3,3], default 2).
- Scrollable fixed one-A4-page-tall frame (not a long stretched view); dashed page-break guides; "scroll to view" hint + overflow banner.
- Measures iframe `body.scrollHeight` (onLoad) to size the scroll area. `min-height:100vh` removed from sidebar templates so measurement is accurate (flex stretch fills sidebars).
- No dummy data anywhere — `SAMPLE`/`SAMPLE_THUMB` are empty stubs; `previewData` is `null` → re-score CTA.

---

## Key files
- `backend/services/resume_checker_service.py` — `check_resume`, `extract_resume_for_preview`, `validate_resume_layout`, `extract_full_profile` (regex)
- `backend/routers/resume.py` — `/api/resume/check` (parallel gather), `/api/resume/check/{id}` permalink
- `backend/services/pipeline/prompts/anthropic.py` — generator system prompt + `_page_rules()`
- `backend/routers/generate.py` — `_TEMPLATE_PAGES`, pipeline wiring, validator call
- `frontend/src/components/TemplatePreviews.tsx` — `PREVIEW_RULES`, `TemplateSuggestions` (cv-score 4-template preview), scroll frame
- `frontend/src/lib/templateHtml.ts` — 20 template HTML generators, `splitExtra`, `PAGINATE_SCRIPT`
- `frontend/src/lib/api.ts` — `ExtractedProfile` type

## Important runtime notes
- **CV-score cache is DISABLED** (`and False` guard in `resume.py`) for testing. Re-enable when preview quality is stable.
- All cache collections were wiped 2026-06-02. Generation cache key includes template_id + sample_cv fingerprint + instructions.
- CV-score preview templates are now admin-controlled via `show_in_cv_score` (default set: Horizon (2pg), Vivid (2pg), Catalyst (1pg), Swift (1pg)).

## Open / next steps
- Re-enable cv-score cache once preview is signed off.
- Decide exact `PREVIEW_RULES` vs `_page_rules` values (currently sensible defaults; user wants to finalise later).
- Optional: keep-together tagging so a section heading always travels with its first bullet to the next page (currently only li/.prose paginate).
- Optional: apply curation/section-placement to the remaining 16 builder-gallery templates (only the 4 cv-score + their bases are fully done).
- DONE (2026-06-03): templates fully migrated to MongoDB (`cv_templates`) — metadata + standalone HTML + docx_config; admin Manage Templates tab + AI generation. See README "Resume Templates (data-driven)". (Supersedes the old `project_pending_mongodb_templates` task.)

## Recent commits (newest first)
- `4852174` page-break hygiene in generator + validator + preview pagination
- `2a77a5e` competitor-style scrollable preview + curated content + smart section placement
- `3eac645` CV-score preview sizes to real content
- `9e8de9e` dedicated resume QA validator with truncation detection
- `fa293c4` expert resume-writing counts in generator prompt
- `75d80b8` dedicated LLM resume extractor
- `ba24a27` dynamic extra_sections

# TailorMyCV — Engineering Improvements Log

A running record of every meaningful engineering change made to the project, with
the problem it solved and the measured or estimated impact. Kept for retrospectives,
cost/quality analysis, and onboarding.

---

## Pipeline Speed & Cost

### 1. Targeted section patching (cycles 2+)
**Commit:** `ce9a891`  
**Files:** `backend/services/pipeline/agents/generator.py`, `backend/services/pipeline/nodes.py`

**Problem:** Every refine cycle regenerated the entire resume JSON (~2 000–3 000 output
tokens, ~30 s per cycle), even when only one or two sections were below the score bar.

**Change:**
- Added `GeneratorAgent.run_patch()` — generates only the failing resume JSON keys
  (`contact`, `summary`, `experience`, `education`, `sections`) rather than the whole doc.
- `generate_node()` in `nodes.py` switches to patch mode at cycle ≥ 2 when specific
  failing sections can be identified from evaluator feedback.
- Merge logic: patch output is a partial dict; unchanged keys are carried over from
  `best_resume_json` so the full resume is always consistent.

**Impact:**
- Patch cycles: ~200–600 output tokens → ~7–9 s per cycle.
- Full-regen cycles: 2 000–3 000 tokens → ~25–30 s per cycle.
- Net saving on a 4-cycle Plus run: ~44 s (2 patch cycles × ~22 s saved each).
- Reduces timeout risk: 4-cycle Plus run measured at 197.9 s vs ~242 s estimated without patching.

---

### 2. Top-2 key selection in `_weak_patch_keys()`
**Commit:** `9c7ff08`  
**Files:** `backend/services/pipeline/nodes.py`

**Problem:** `_weak_patch_keys()` returned every section key that matched any keyword in
the feedback — up to 5 keys. On first-pass CVs where all sections need work, this made
patch output nearly as large as a full regeneration, defeating the purpose.

**Change:**
- Rewrote to count regex pattern hits per section key using `pattern.findall()`.
- Returns only the **top-2 by hit frequency** (most-mentioned = worst sections first).
- Added `logger.info` to label each cycle PATCH or FULL inline in harness output.

**Impact:**
- Consistently caps patch output at 2 keys regardless of how many sections the feedback
  mentions.
- Patch cycles remain fast (~7–9 s) even when CVs need broad improvement.
- Converges faster: fixing the 2 worst sections per cycle is more effective than trying
  to fix 5 mediocre sections simultaneously.

---

### 3. Patch prompt + `check_resume` token reduction
**Commit:** `736e1a6`  
**Files:** `backend/services/pipeline/prompts/anthropic.py`, `backend/services/resume_checker_service.py`

**Change:**
- Added `patch_messages()` and `_build_patch_schema()` to `anthropic.py`: a focused
  prompt that asks the model to output only the patch keys, with a minimal JSON schema
  restricted to just those fields. Reuses the same cached system prompt as the full
  generator so prompt-cache hits carry over.
- Reduced `max_tokens` in `check_resume()` Haiku call from 6 000 → 3 500.

**Impact:**
- `check_resume` saves ~2 500 output tokens per score call (≈ 5 s with Haiku).
- Patch prompt schema keeps the model from "leaking" unrequested sections.

---

### 4. Pipeline timeout recovery via streaming
**Commits:** `a7a56a9`, `9aa2880`, `f37103e`  
**Files:** `backend/routers/generate.py`

**Problem:** When a pipeline run hit the timeout ceiling, the entire request returned an
error and the user got nothing, despite the pipeline having produced a good intermediate
result in earlier cycles.

**Change:**
- Switched from `pipeline.ainvoke()` to `pipeline.astream(stream_mode="values")` in the
  generate router.
- A mutable `_snap[0]` closure captures the last emitted state after each node.
- On `asyncio.TimeoutError`, the router falls back to `_snap[0]` (the best intermediate
  state seen) rather than raising.
- Simplified to a flat 300 s timeout across all tiers (streaming recovery makes
  tier-specific caps unnecessary).

**Impact:**
- Pro tier (5 cycles × ~30 s = ~150 s) comfortably within 300 s.
- Users now always receive the best CV produced so far even if the run times out mid-cycle.
- Eliminated the class of "empty response on slow runs" production errors.

---

## Quality & Intelligence

### 5. Rubric-aware generator + per-agent self-learning memory
**Commit:** `bed5d58`  
**Files:** `backend/services/pipeline/agents/generator.py`, `backend/services/agent_memory.py`

**Change:**
- Generator system prompt ingests profession-specific `generator_context` and
  `scoring_criteria` so it targets the exact rubric the evaluator will score against.
- Introduced `agent_memory` MongoDB collection: each completed run upserts a doc with
  running totals (first score, cycles, cost, pass rate) and weakness tallies derived
  from evaluator suggestions.
- `get_generator_memory_text()` injects the top-3 historical weaknesses back into the
  generator system prompt after ≥ 5 runs, so the first draft pre-empts recurring
  shortfalls without extra LLM calls.

**Impact:**
- Memory is cost-free (one Mongo upsert per run; no extra LLM call).
- Over time: fewer refine cycles as the generator learns what the evaluator penalises.
- Admin dashboard shows per-agent stats (avg first-draft score, avg cycles, pass rate,
  top weaknesses) for monitoring.

---

### 6. Harness memory recording
**Commit:** `9c7ff08`  
**Files:** `backend/tests/pipeline_harness.py`

**Problem:** `record_generation_outcome()` was only wired into the HTTP router, so
harness runs (the primary testing loop) never fed the agent memory system. The generator
was learning nothing from local/CI test runs.

**Change:**
- Added `record_generation_outcome()` call at the end of `_run_attempt()` in the harness.

**Impact:**
- Every harness run now counts toward the 5-run minimum required to unlock memory injection.
- Testers and CI build up shared weakness signal alongside production traffic.

---

### 7. CV Score pipeline refactor for cost and quality
**Commit:** `e779bb9`

**Change:**
- Separated CV scoring and resume extraction into independent parallel LLM calls
  (`asyncio.gather`) instead of one combined call.
- Each call has a focused, single-task system prompt (one call = one job, per CLAUDE.md).

**Impact:**
- Fixed: merged job entries, truncated bullets, and dropped sections that the combined
  call produced.
- Parallelism means no added latency despite running two calls.

---

### 8. User actions needed — gap-bridging guidance
**Commit:** `f10c6b7`  
**Files:** `backend/services/user_actions_service.py`, `backend/routers/generate.py`

**Change:**
- When the pipeline exhausts all cycles without clearing the tier bar, the API now
  returns `user_actions_needed`: a prioritised list of concrete actions the user can
  take (add LinkedIn URL, add graduation year, quantify achievements, etc.) along with
  an estimated points-available total.
- The harness also surfaces this table so test runs immediately show what the AI cannot
  fix without real user data.

**Impact:**
- Honest UX: instead of returning a "best-effort" CV with no explanation, the product
  tells the user exactly what information gaps are holding their score back.
- Prevents the user from thinking the AI is at fault when the CV is missing verifiable facts.

---

## Observability & Tooling

### 9. Per-segment timing in the eval harness
**Commit:** `9c7ff08`  
**Files:** `backend/tests/pipeline_harness.py`

**Problem:** `pipeline.ainvoke()` returned only after all cycles completed — no visibility
into which node was slow or whether a cycle used patch vs full-regen.

**Change:**
- Replaced `pipeline.ainvoke()` with `pipeline.astream(stream_mode="updates")` in
  `_run_attempt()`.
- Each `{node_name: update}` chunk is timestamped; the harness prints a per-row table:

  ```
  Cycle  Node          Mode   Time
  ────────────────────────────────────
      1  generate      FULL   18.4s
      1  evaluate             2.1s
      1  aggregate            0.0s  → score=68
      2  generate      FULL   22.1s
      2  evaluate             2.0s
      2  aggregate            0.0s  → score=72
      3  generate      PATCH   7.3s
      3  evaluate             1.9s
      3  aggregate            0.0s  → score=74
  ```

**Impact:**
- Immediately shows whether patch cycles are actually faster than full-regen cycles.
- Makes plateau early-exit visible (last cycle scores close together → loop stopped).
- Enables empirical cost/latency optimisation without adding instrumentation code.

---

### 10. Template quality scores + tier gating
**Commit:** `57745f3`, `64a06c0`

**Change:**
- Each resume template in MongoDB now stores a `quality_score` derived by running the
  CV-Score evaluator against the template's rendered output.
- Templates are gated by tier: Free users see templates scoring ≥ threshold; Plus/Pro
  unlock higher-quality templates.
- CV Builder pipeline uses tier-matched templates as the rendering target, so the
  generator knows the visual constraints it is writing for.

**Impact:**
- Prevents low-quality templates from being used for paid tiers.
- Generator prompt includes the target template's page constraints → fewer page-overflow
  failures in generated output.

---

### 11. Per-user cost budgets
**Commits:** `ddf08c4`, `f5fb158`

**Change:**
- Daily and monthly cost caps per user, stored per-account and enforced in the generate
  router before any LLM call is made.
- Separate Free / Plus / Pro budget ceilings.
- Audit log entry written for every budget check (hit or pass).

**Impact:**
- Prevents runaway spend from a single account.
- Admin dashboard shows per-user cost vs budget in real time.

---

## Resume Extraction & Preview

### 12. Dedicated LLM resume extractor for template previews
**Commit:** `75d80b8`

**Problem:** Template preview thumbnails were rendering with generic placeholder data
rather than the user's actual CV content, making the preview useless for choosing a template.

**Change:**
- Added a dedicated Haiku extraction call (`extract_resume_for_preview`) with a focused
  system prompt that outputs a structured JSON matching the template schema.
- Runs in parallel with `check_resume` (same `asyncio.gather` block) so total latency
  does not increase.

**Impact:**
- Preview thumbnails now show the user's real name, job title, and content.
- Fixed: merged job entries and dropped sections that the prior combined-call approach
  produced (same root cause as improvement #7 above).

---

### 13. Page-break hygiene in generator + validator
**Commit:** `4852174`

**Change:**
- Generator prompt now includes explicit page-break rules (no orphan headings, no widow
  bullets, experience entries must not split across pages).
- `validate_template_html()` added a page-overflow check: if rendered content exceeds
  the A4 page height, the template is rejected before saving.

**Impact:**
- Eliminated the most common visual defect in generated DOCX/PDF output.
- Reduces "re-download after noticing overflow" support requests.

---

### 14. Dedicated resume QA validator with truncation detection
**Commit:** `9e3e31a`

**Change:**
- New `ResumeValidator` runs after every generator call; checks for truncated bullets,
  empty sections, missing required fields, and JSON schema violations.
- Truncation detection: if any bullet ends mid-sentence (no terminal punctuation after
  ≥ 8 words), the validator flags it and the cycle is retried.

**Impact:**
- Catches the main class of generator quality failures before they reach the user.
- Keeps validators pure and unit-testable (no LLM call — just structural checks).

---

## Infrastructure

### 15. LLM cache indexes + 7-day TTL
**Commit:** `2a43fd4`

**Change:**
- MongoDB LLM response cache now has compound indexes on `(prompt_hash, model)` and
  a TTL index on `created_at` (7 days).

**Impact:**
- Cache hits survive server restarts (previously in-memory only).
- Stale entries auto-expire; collection does not grow unbounded.

---

### 16. Prompt caching with Anthropic `cache_control`
**Files:** `backend/services/pipeline/prompts/anthropic.py`

**Change:**
- System prompt messages in generator and evaluator calls include
  `cache_control: {"type": "ephemeral"}`.
- Patch calls reuse the same cached system prompt as full-regen calls.

**Impact:**
- ~90% input-token discount on the system prompt for cycles 2+ (Anthropic cache hit).
- Patch + cache means later cycles can cost < 10% of cycle 1 in input tokens.

---

## Summary Table

| # | Area | Commit | Key metric |
|---|------|--------|----------|
| 1 | Speed | `ce9a891` | Patch cycles ~8 s vs ~30 s full-regen |
| 2 | Speed | `9c7ff08` | Patch always ≤ 2 keys, never 5 |
| 3 | Cost  | `736e1a6` | −2 500 tokens per score call; focused patch schema |
| 4 | Reliability | `a7a56a9` | No more empty responses on timeout |
| 5 | Quality | `bed5d58` | Generator learns from past runs (0 extra LLM calls) |
| 6 | Quality | `9c7ff08` | Harness runs now feed agent memory |
| 7 | Quality | `e779bb9` | Parallel score + extract = no merged/dropped sections |
| 8 | UX | `f10c6b7` | User told exactly what data gaps block their score |
| 9 | Observability | `9c7ff08` | Per-node timing table in harness output |
| 10 | Product | `57745f3` | Template quality gated by tier |
| 11 | Cost control | `ddf08c4` | Daily + monthly per-user spend caps |
| 12 | Quality | `75d80b8` | Preview thumbnails show real CV data |
| 13 | Quality | `4852174` | No orphan headings or overflowed pages |
| 14 | Reliability | `9e3e31a` | Truncation/empty-section detection before user sees output |
| 15 | Infrastructure | `2a43fd4` | Cache persists across restarts; 7-day TTL auto-cleanup |
| 16 | Cost | prompts file | ~90% input-token discount on repeat cycles via Anthropic cache |

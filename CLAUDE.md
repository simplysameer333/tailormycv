# TailorMyCV — Engineering Directions

## LLM / Agent design

**One dedicated LLM call per purpose. Each call targets a single task, with a focused, clean system prompt.**

- Never make one call multi-task (e.g. scoring + extracting + formatting in a single mega-prompt). An overloaded call spreads attention and produces lazy, low-quality output for every job it's juggling.
- Give each call its own tight system prompt that describes only that one job.
- When you need multiple outputs from the same input, run separate focused calls **concurrently** (`asyncio.gather`) — you get higher quality with no added latency.
- Proven in this codebase: CV-score quality analysis (`check_resume`) and resume extraction (`extract_resume_for_preview`) are separate parallel calls. Splitting them fixed merged job entries, truncated bullets, and dropped sections that the combined call produced.

## Production AI-engineering standards (apply to EVERY AI feature, app-wide)

These are not optional polish — build them into any feature that calls an LLM/agent. If a feature can't yet meet one, note it in the deferred backlog rather than skipping silently.

- **Evals / validation gate** — never trust raw LLM output. Validate before use/persistence with pure, unit-testable functions. Example: the CV-template AI generator (`services/cv_template_service.py` → `validate_template_html` / `normalize_docx_config`) rejects malformed HTML, missing placeholders, unbalanced Mustache sections, or out-of-vocabulary config before a template can be saved.
- **Context engineering** — one focused system prompt stating the exact output contract, plus a minimal in-context reference (few-shot) where it helps. No multi-task bloat.
- **Optimizing LLM calls** — cache static system prompts with Anthropic `cache_control`; bound `max_tokens`; pick the right model per task (Haiku for extract/validate, Sonnet for authoring); serialise structured inputs with TOON.
- **Monitoring** — log structured telemetry per call (model, latency, input/output tokens, cache hits, validation result) and an `audit_log` entry for admin AI actions.
- **Testing** — keep validators/renderers/parsers pure and deterministic so they unit-test; isolate the LLM call behind a service so it can be mocked.

## Resume templates are DATA, not code

The 20+ resume templates live in MongoDB (`cv_templates`) as standalone HTML (logic-less Mustache) + a `docx_config`. Add/edit/AI-generate them from Admin → Manage Templates with **no deploy**. Rendering logic lives once in `frontend/src/lib/cvTemplates.ts` (`render`/`renderCtx`); DOCX is config-driven in `services/docx_templates.py`. Don't reintroduce per-template hardcoding — extend the data model or the shared renderer instead.

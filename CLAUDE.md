# TailorMyCV — Engineering Directions

## LLM / Agent design

**One dedicated LLM call per purpose. Each call targets a single task, with a focused, clean system prompt.**

- Never make one call multi-task (e.g. scoring + extracting + formatting in a single mega-prompt). An overloaded call spreads attention and produces lazy, low-quality output for every job it's juggling.
- Give each call its own tight system prompt that describes only that one job.
- When you need multiple outputs from the same input, run separate focused calls **concurrently** (`asyncio.gather`) — you get higher quality with no added latency.
- Proven in this codebase: CV-score quality analysis (`check_resume`) and resume extraction (`extract_resume_for_preview`) are separate parallel calls. Splitting them fixed merged job entries, truncated bullets, and dropped sections that the combined call produced.

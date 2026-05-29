"""Prompts for all LLM calls made to the Anthropic API.

Covers:
  - GeneratorAgent.run()          — full resume generation
  - GeneratorAgent.run_section()  — single-section regeneration
  - AnthropicEvaluatorAgent.run() — resume scoring via Claude

All message builders accept a `profession_config` dict so prompts are
tailored to the candidate's target profession. Pass an empty dict or
the GENERIC_CONFIG to use baseline prompts with no profession context.
"""
from __future__ import annotations
from langchain_core.messages import SystemMessage, HumanMessage
from ..toon import encode as toon_encode, TOON_LEGEND

# ── Generator ─────────────────────────────────────────────────────────────────

_GENERATOR_SYSTEM_BASE = """You are an expert resume writer for TailorMyCv.

You will be given:
1. A candidate's existing resume (parsed text)
2. A candidate profile with additional information
3. A job description for the role they are applying to
4. (Optional) Feedback from evaluator agents from a previous attempt

Your task is to write the best possible resume for this candidate for this specific role.

## CONTENT RULES
- Do NOT fabricate any experience, skills, or qualifications not present in the inputs
- Preserve ALL information from the source resume — include every job role, every education entry, every certification, and every significant detail. Never drop, merge, or omit any position or qualification
- Reorder and emphasise existing experience to highlight relevance to the job, but do not remove any roles
- Capture ALL contact details present in the source resume: email, phone, LinkedIn URL, GitHub URL, personal website, and location. Copy URLs exactly as they appear — do not shorten, paraphrase, or remove them
- Write in a {tone} tone (Professional / Conversational / Executive)
- Keep the summary to 3–4 sentences that directly position the candidate for this specific role
- If evaluator feedback is provided, address every suggestion before returning

## BULLET POINT RULES
- Every experience bullet MUST start with a strong past-tense action verb (Led, Delivered, Built, Designed, Managed, Reduced, Grew, Launched, Automated, Secured, Negotiated, Resolved, Streamlined, Architected, Implemented)
- Bullet text must be clean plain text only — no dashes, hyphens, asterisks, or special characters inside the bullet string itself; the renderer adds the bullet marker
- Quantify impact wherever the source data supports it: use numbers, percentages, currency amounts, team sizes, time savings, or rankings
- Each bullet must describe a distinct achievement or contribution — not a generic job duty
- Write 3–5 bullets per role; longer tenures or senior roles may have up to 6

## OUTPUT RULES
- Return ONLY a valid JSON object matching the schema below — no preamble, no markdown fences, no trailing text
- All URL fields (linkedin, github, website) must contain the full URL string exactly as found in the source resume, or an empty string if not present
- skills and certifications must be arrays of individual strings — never a single comma-separated string

{
  "name": "string",
  "contact": {
    "email": "string",
    "phone": "string",
    "linkedin": "string",
    "github": "string",
    "website": "string",
    "location": "string"
  },
  "summary": "string",
  "experience": [{"company": "string", "role": "string", "dates": "string", "bullets": ["string"]}],
  "education": [{"institution": "string", "degree": "string", "dates": "string"}],
  "skills": ["string"],
  "certifications": ["string"]
}"""


async def _get_generator_base() -> str:
    try:
        from services.prompt_store import get_override
        override = await get_override("generator_system")
        return override if override else _GENERATOR_SYSTEM_BASE
    except Exception:
        return _GENERATOR_SYSTEM_BASE


async def _get_job_analyzer_system(n: int) -> str:
    try:
        from services.prompt_store import get_override
        override = await get_override("job_analyzer_system")
        base = override if override else _JOB_ANALYZER_SYSTEM
        return base.format(n=n)
    except Exception:
        return _JOB_ANALYZER_SYSTEM.format(n=n)


async def _get_anthropic_evaluator_base() -> str:
    try:
        from services.prompt_store import get_override
        override = await get_override("anthropic_evaluator_base")
        return override if override else _ANTHROPIC_EVALUATOR_BASE
    except Exception:
        return _ANTHROPIC_EVALUATOR_BASE


async def _build_generator_system(tone: str, profession_config: dict, locked_facts: list) -> str:
    """Compose the full generator system prompt from base + profession context + locked facts."""
    base = await _get_generator_base()
    system = TOON_LEGEND + "\n\n" + base.replace("{tone}", tone)
    ctx = profession_config.get("generator_context", "")
    if ctx:
        system += f"\n\n## {ctx}"
    if locked_facts:
        facts_block = "\n".join(f"- {f}" for f in locked_facts)
        system += (
            f"\n\n## LOCKED FACTS — MUST NOT BE CHANGED\n"
            f"The user has explicitly locked the following facts. "
            f"Preserve them verbatim in the output — do not rephrase, remove, or contradict them:\n"
            f"{facts_block}"
        )
    return system


async def generator_messages(
    resume_text: str,
    user_profile: dict,
    job_description: str,
    tone: str,
    feedback: str | None,
    profession_config: dict,
    locked_facts: list,
    key_skills: list,
    sample_cv_text: str | None = None,
) -> list:
    """Build the full message list for a generator run (full resume generation)."""
    system = await _build_generator_system(tone, profession_config, locked_facts)
    parts = [
        f"## EXISTING RESUME\n{resume_text}",
        f"## CANDIDATE PROFILE\n{toon_encode(user_profile)}",
        f"## JOB DESCRIPTION\n{job_description}",
    ]
    if sample_cv_text:
        parts.append(
            f"## FORMATTING REFERENCE (mirror structure and section order — do NOT copy content)\n"
            f"{sample_cv_text}"
        )
    if key_skills:
        skills_block = "\n".join(f"- {s}" for s in key_skills)
        parts.append(
            f"## KEY SKILLS TO EMPHASISE (pre-analysed from the job description)\n"
            f"Prioritise these in bullet points, skills section, and summary — "
            f"only include those the candidate genuinely has:\n{skills_block}"
        )
    if feedback:
        parts.append(
            f"## EVALUATOR FEEDBACK (from previous cycle — address every suggestion)\n{feedback}"
        )
    parts.append("Generate the tailored resume JSON now.")
    return [SystemMessage(content=system), HumanMessage(content="\n\n".join(parts))]


async def section_messages(
    resume_text: str,
    user_profile: dict,
    job_description: str,
    tone: str,
    section: str,
    existing_resume: dict,
    profession_config: dict,
    locked_facts: list,
    key_skills: list,
    sample_cv_text: str | None = None,
) -> list:
    """Build the full message list for a section-only regeneration."""
    system = await _build_generator_system(tone, profession_config, locked_facts)
    parts = [
        f"## EXISTING RESUME\n{resume_text}",
        f"## CANDIDATE PROFILE\n{toon_encode(user_profile)}",
        f"## JOB DESCRIPTION\n{job_description}",
    ]
    if sample_cv_text:
        parts.append(
            f"## FORMATTING REFERENCE (mirror structure and section order — do NOT copy content)\n"
            f"{sample_cv_text}"
        )
    if key_skills:
        skills_list = "\n".join(f"- {s}" for s in key_skills)
        parts.append(f"## KEY SKILLS TO EMPHASISE\n{skills_list}")
    parts.append(f"## CURRENT FULL RESUME (for context)\n{toon_encode(existing_resume)}")
    parts.append(
        f'Regenerate ONLY the "{section}" section. '
        f"Return the complete resume JSON with the regenerated section replacing the existing one."
    )
    return [SystemMessage(content=system), HumanMessage(content="\n\n".join(parts))]


# ── Job Analyzer ──────────────────────────────────────────────────────────────

_JOB_ANALYZER_SYSTEM = """You are a resume strategist. Given a job description and a candidate's existing resume and profile, identify the most important skills, technologies, and qualifications from the job description that the candidate already has evidence of (or can credibly demonstrate).

Rules:
- Select exactly {n} items.
- Prefer specific, measurable skills over generic ones (e.g. "Kubernetes" over "cloud experience").
- Only include skills supported by the candidate's resume or profile — do not invent.
- Order by relevance to the role (most important first).
- Return ONLY a valid JSON array of strings — no preamble, no markdown:

["skill one", "skill two", ...]"""


async def job_analyzer_messages(
    resume_text: str,
    user_profile: dict,
    job_description: str,
    n: int,
) -> list:
    """Build messages for JobAnalyzerAgent to extract top-N key skills."""
    system = await _get_job_analyzer_system(n)
    content = (
        f"## CANDIDATE RESUME\n{resume_text}\n\n"
        f"## CANDIDATE PROFILE\n{toon_encode(user_profile)}\n\n"
        f"## JOB DESCRIPTION\n{job_description}\n\n"
        f"Identify the top {n} skills to emphasise. Return a JSON array of exactly {n} strings."
    )
    return [SystemMessage(content=system), HumanMessage(content=content)]


# ── Anthropic Evaluator ───────────────────────────────────────────────────────

_ANTHROPIC_EVALUATOR_BASE = """You are an expert resume reviewer. You will be given a candidate's resume and a job description. Your task is to score how well the resume matches the job.

{scoring_criteria}

{evaluator_context}
Return ONLY a valid JSON object — no preamble, no markdown:
{{"score": 0, "suggestions": ["string"]}}"""


async def anthropic_evaluator_messages(
    resume_json: dict,
    job_description: str,
    profession_config: dict,
) -> list:
    from .professions.generic import CONFIG as GENERIC_CONFIG
    scoring = profession_config.get("scoring_criteria") or GENERIC_CONFIG["scoring_criteria"]
    eval_ctx = profession_config.get("evaluator_context", "")
    eval_ctx_block = f"{eval_ctx}\n\n" if eval_ctx else ""
    base = await _get_anthropic_evaluator_base()
    system = (TOON_LEGEND + "\n\n" + base).format(
        scoring_criteria=scoring,
        evaluator_context=eval_ctx_block,
    )
    content = (
        f"## RESUME\n{toon_encode(resume_json)}\n\n"
        f"## JOB DESCRIPTION\n{job_description}"
    )
    return [SystemMessage(content=system), HumanMessage(content=content)]

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

_GENERATOR_SYSTEM_BASE = """You are an expert resume writer for TailorMyCv. Your sole purpose is to produce the strongest possible tailored resume for this specific candidate applying to this specific role.

## ABSOLUTE CONSTRAINT — NO HALLUCINATION
Never invent, fabricate, or assume any information not explicitly present in the inputs provided.
This includes: job titles, company names, dates, metrics, technologies, qualifications, certifications, publications, awards, or any other factual claim.
If information is absent from the inputs, leave the field empty or omit it entirely — never guess or fill in plausible-sounding details.
A fabricated resume is fraudulent. This rule overrides all other instructions.

## HOW TO USE YOUR INPUTS

**EXISTING RESUME** — The factual source of truth. Every claim in the output must be grounded here or in the candidate profile.

**CANDIDATE PROFILE** — Contains the candidate's stated target_role, key_skills, professional summary, location, and any additional notes or preferences.
- Use target_role to calibrate the seniority and scope of language throughout the resume:
  Individual contributor → precise task/delivery language.
  Manager/Lead → team ownership and outcome language.
  Director/VP/C-level → strategic impact and business framing.
- Use key_skills as the candidate's self-identified strengths — surface these prominently in the summary, skills section, and the most relevant bullets.
- Honour any instructions in additional_notes exactly — they represent the candidate's explicit preferences.

**JOB DESCRIPTION** — The specification you are tailoring toward.
- Identify the top 3–5 requirements the employer cares most about (usually in the first third of the JD).
- Ensure every one of those requirements is addressed — either in the summary or in at least one bullet from a relevant role.
- Use the JD's exact terminology and phrases wherever the candidate's background supports it (not synonyms). ATS systems score exact string matches.

**KEY SKILLS TO EMPHASISE** — Pre-extracted skills from the JD the candidate can credibly claim. Weave these through the skills section, relevant bullets, and the summary — only where genuine evidence exists in the resume.

**EVALUATOR FEEDBACK** (when present) — Specific improvement requests from the previous evaluation cycle. Address every single suggestion before returning. Ignoring feedback guarantees a lower score next cycle.

## CONTENT RULES
- Never fabricate — every fact must exist in the inputs (see ABSOLUTE CONSTRAINT above)
- Preserve ALL information from the source resume — every role, every education entry, every qualification. Never drop, merge, or omit any position
- Reorder and emphasise existing experience to highlight relevance, but never remove roles
- Capture ALL contact details exactly: email, phone, LinkedIn URL, GitHub URL, website, location. Copy URLs verbatim — do not shorten or alter them
- Write in a {tone} tone (Professional / Conversational / Executive)

## PROFESSIONAL SUMMARY RULES
Write exactly 3–4 sentences using this structure:
  1. Who the candidate is: title + years of experience + core domain/specialisation
  2. Their strongest relevant capability for THIS role (use a JD keyword)
  3. A concrete proof point or achievement that validates the fit (with a number if available)
  4. (Optional) What they bring to this employer specifically, or their next-step ambition
Forbidden phrases: "results-driven", "passionate about", "detail-oriented", "team player", "dynamic", "seasoned professional". Replace with specific facts.

## BULLET POINT RULES
- Every bullet MUST open with a strong past-tense action verb:
  Led, Delivered, Built, Designed, Architected, Managed, Reduced, Grew, Launched, Automated,
  Secured, Negotiated, Resolved, Streamlined, Implemented, Drove, Spearheaded, Established, Transformed, Scaled
- Structure: [Action verb] + [what was done, with specifics] + [measurable result or scale]
  Good: "Reduced cloud infrastructure costs by 34% by consolidating workloads across three AWS regions, saving £280K annually"
  Bad: "Helped with cloud cost reduction initiatives"
- Bullet text must be clean plain text — no leading dashes, hyphens, or asterisks; the renderer adds the bullet marker
- Quantify every achievement the source data supports: percentages, currency, headcount, timelines, rankings, NPS scores, uptime SLAs
- Each bullet describes a distinct achievement — not a copy of the job description
- Write 3–5 bullets per role; long-tenure or senior roles may have up to 6

The exact JSON output format and section structure will be specified in the user message."""


def _build_output_schema_instruction(has_reference_cv: bool) -> str:
    """Build the dynamic output schema instruction injected into the HumanMessage.

    Sections are derived from the FORMATTING REFERENCE (if present) or the
    EXISTING RESUME — never hardcoded. This keeps the output structure aligned
    with whatever template or reference the user has provided.
    """
    source = "the FORMATTING REFERENCE" if has_reference_cv else "the EXISTING RESUME"
    return (
        "## OUTPUT FORMAT\n\n"
        "Return ONLY a valid JSON object — no preamble, no markdown fences, no trailing text.\n\n"
        f"SECTION STRUCTURE: Mirror the sections present in {source} exactly — their names, "
        f"their order, and whether they are present at all. Do not add, rename, or invent "
        f"any section not present in {source}.\n\n"
        "The JSON must use this schema:\n\n"
        "{\n"
        '  "name": "string",\n'
        '  "contact": {\n'
        '    "email": "string",\n'
        '    "phone": "string",\n'
        '    "linkedin": "string — full URL or empty string",\n'
        '    "github": "string — full URL or empty string",\n'
        '    "website": "string — full URL or empty string",\n'
        '    "location": "string"\n'
        "  },\n"
        '  "summary": "string",\n'
        '  "experience": [\n'
        '    {"company": "string", "role": "string", "dates": "string", "bullets": ["string"]}\n'
        "  ],\n"
        '  "education": [\n'
        '    {"institution": "string", "degree": "string", "dates": "string"}\n'
        "  ],\n"
        '  "sections": [\n'
        '    {\n'
        f'      "title": "string — section heading exactly as it appears in {source}",\n'
        '      "items": ["string — one complete entry per item, ready to render as a bullet"]\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        'The "sections" array captures ALL sections other than experience and education, '
        f"in the exact order they appear in {source}:\n"
        "- Skills / Technical Skills / Core Competencies → items are individual skill strings\n"
        "- Certifications / Credentials / Licences → items are individual certification strings\n"
        "- Projects / Portfolio → items are complete sentences: what was built, how, and the outcome\n"
        "- Publications / Research → items are full citation or description strings\n"
        "- Awards / Achievements / Honours → items are individual award strings with context\n"
        "- Languages → items are individual language + proficiency level strings\n"
        "- Any other section → items are its content as individual complete strings\n\n"
        f"Only include sections that exist in {source}. Never invent sections."
    )


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
        return base.replace("{n}", str(n))
    except Exception:
        return _JOB_ANALYZER_SYSTEM.replace("{n}", str(n))


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
            f"## FORMATTING REFERENCE (mirror section names, order, and structure — do NOT copy content)\n"
            f"{sample_cv_text}"
        )
    if key_skills:
        skills_block = "\n".join(f"- {s}" for s in key_skills)
        parts.append(
            f"## KEY SKILLS TO EMPHASISE (pre-analysed from the job description)\n"
            f"Weave these through the output only where the candidate's resume genuinely supports them:\n"
            f"{skills_block}"
        )
    if feedback:
        parts.append(
            f"## EVALUATOR FEEDBACK (from previous cycle — address every suggestion)\n{feedback}"
        )
    # Dynamic output schema — always last before the generation trigger
    parts.append(_build_output_schema_instruction(has_reference_cv=bool(sample_cv_text)))
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
            f"## FORMATTING REFERENCE (mirror section names, order, and structure — do NOT copy content)\n"
            f"{sample_cv_text}"
        )
    if key_skills:
        skills_list = "\n".join(f"- {s}" for s in key_skills)
        parts.append(f"## KEY SKILLS TO EMPHASISE\n{skills_list}")
    parts.append(f"## CURRENT FULL RESUME (for context)\n{toon_encode(existing_resume)}")
    parts.append(_build_output_schema_instruction(has_reference_cv=bool(sample_cv_text)))
    parts.append(
        f'Regenerate ONLY the "{section}" section. '
        f"Return the complete resume JSON with the regenerated section replacing the existing one. "
        f"Preserve all other sections exactly as they are in the CURRENT FULL RESUME."
    )
    return [SystemMessage(content=system), HumanMessage(content="\n\n".join(parts))]


# ── Job Analyzer ──────────────────────────────────────────────────────────────

_JOB_ANALYZER_SYSTEM = """You are a senior resume strategist and hiring specialist. Your job is to identify the exact skills and qualifications to emphasise in this candidate's tailored resume.

You will receive the candidate's existing resume, their profile (target role, stated key skills, background), and the job description they are applying to.

## ABSOLUTE CONSTRAINT — NO HALLUCINATION
Only select skills and qualifications that are explicitly evidenced in the candidate's resume or profile. Never include a skill the candidate has no documented evidence for, even if it appears prominently in the job description.

## YOUR TASK
Select exactly {n} skills, technologies, or qualifications to prioritise in the tailored resume.

## SELECTION CRITERIA
Rank each item by a combined score of:
  (A) JD criticality — skills mentioned multiple times, listed as "required" / "must have", or in the role title score highest
  (B) Candidate evidence strength — deep, repeated, specific evidence scores higher than a single passing mention

Only include items where BOTH (A) > 0 and (B) > 0. If there are fewer than {n} qualifying items, return only the qualifying ones rather than padding with unsupported skills.

## TERMINOLOGY RULE
Use the EXACT phrasing from the job description, not synonyms or paraphrases.
If the JD says "stakeholder management", output "stakeholder management" — not "stakeholder engagement".
If the JD says "TypeScript", output "TypeScript" — not "JavaScript/TypeScript".
ATS systems match exact strings. Terminology precision is critical.

## SKILL SPECIFICITY RULE
Prefer specific, named skills over vague categories:
- "PostgreSQL" over "databases"
- "AWS Lambda" over "serverless"
- "P&L accountability" over "financial management"
- "Agile/Scrum" over "project management"

## OUTPUT
Return ONLY a valid JSON array of strings — no preamble, no explanation, no markdown:

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
        f"Identify the top {n} skills to emphasise. "
        f"Only include skills the candidate has genuine evidence for. "
        f"Return a JSON array of strings."
    )
    return [SystemMessage(content=system), HumanMessage(content=content)]


# ── Anthropic Evaluator ───────────────────────────────────────────────────────

_ANTHROPIC_EVALUATOR_BASE = """You are a senior hiring manager and career narrative specialist evaluating a tailored resume. Your perspective focuses on the PERSUASIVENESS and COHERENCE of the candidate's story — not just keyword presence, but whether the resume compellingly argues that this person is the right hire.

## ABSOLUTE CONSTRAINT — NO HALLUCINATION
Your suggestions must only reference skills, experiences, and qualifications that exist in the candidate's resume. Never suggest adding fabricated experience, invented metrics, or qualifications the candidate does not demonstrably have. If you suggest a rewrite, use placeholder brackets like [X] for values the candidate should fill in from their real experience.

{scoring_criteria}

{evaluator_context}

## YOUR EVALUATION LENS — NARRATIVE & PERSUASION
Beyond the scoring criteria above, actively probe for:

1. **Summary strength** — Does the opening summary immediately position the candidate for this specific role? Does it answer "why hire this person for THIS job"? Flag if it is generic, could apply to any role, or fails to reference the employer's stated priorities.

2. **Career story coherence** — Does the sequence of roles show logical progression toward the target position? Are there unexplained gaps or a mismatch between the trajectory and the role being applied to?

3. **Impact evidence quality** — Are achievements stated with enough specificity to be credible? Vague claims ("improved performance", "led initiatives") score lower than named, quantified outcomes. Identify the weakest 2–3 bullets and rewrite them using: [verb] + [specific action] + [measurable result — use brackets if the candidate must supply the number].

4. **Language strength** — Are bullets opening with strong ownership verbs? Flag any bullet starting with "Helped", "Assisted", "Responsible for", "Worked on", "Participated in" — these signal low ownership and must be rewritten.

5. **JD alignment of the summary and top bullet** — The first impression (summary + first bullet of most recent role) must directly address the job's top requirement. If it doesn't, that is the single highest-priority fix.

## SUGGESTION QUALITY RULES
Every suggestion must be SPECIFIC and ACTIONABLE — not generic advice.
BAD: "Add more metrics to your bullets"
GOOD: "The bullet 'Managed database migrations' at [Company] is too vague. Rewrite as: 'Led migration of [X]TB database to [platform], completing in [timeframe] with zero downtime and reducing infrastructure costs by [£/$ amount]' — fill in figures from your actual experience."

BAD: "Improve your professional summary"
GOOD: "The summary does not mention [top JD requirement]. Add a sentence connecting the candidate's [specific skill from their resume] to the employer's stated need for [JD phrase]."

Provide 4–7 specific, rewrite-level suggestions ordered by impact (highest first).

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

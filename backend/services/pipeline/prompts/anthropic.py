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


def _cached_system(text: str) -> SystemMessage:
    """Build a SystemMessage whose content is marked for Anthropic prompt caching.

    The builder system prompts are large and STATIC across refine cycles within a
    request (and identical across requests with the same tone/profession/pages), so
    caching the prefix gives a ~90% input-token discount on cache hits — the main
    cost lever for multi-cycle Plus/Pro runs. Anthropic silently ignores the marker
    when the prefix is below the cache minimum (~1024 tokens), so this is always safe.
    Only used on Anthropic calls (generator, job analyzer, Anthropic evaluator) —
    OpenAI/Google providers ignore this block shape via their own message builders.
    """
    return SystemMessage(content=[{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}])

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
- Capture ALL contact details exactly: email, phone, LinkedIn URL, GitHub URL, website, location. Copy URLs verbatim — do not shorten or alter them
- Preserve every education entry and qualification
- Experience entries: include all roles within the last 12 years. For roles older than 12 years, include them only if directly relevant to the target role; otherwise omit to stay within page count
- Write in a {tone} tone (Professional / Conversational / Executive)

## QUALITY PRESERVATION — CRITICAL
The candidate's existing resume may already contain strong, specific content. Your task is to IMPROVE it, not to replace or genericise it:
- If a bullet is already strong (specific, quantified, precise technical detail) — keep it as-is and only adjust keywords if needed for ATS alignment
- NEVER simplify specific technical language to make it "sound better". Example: if the original says "implemented FIX/JSON/XML trading gateway for 15+ institutional clients" — keep those exact technical terms. Do not replace with "developed trading platform"
- Specific numbers, technologies, company names, and metrics are the candidate's strongest assets — preserve them all verbatim
- The output must be at least as strong as the input. If you cannot meaningfully improve a bullet, preserve it exactly
- Prefer minimal edits over rewrites — change only what genuinely improves the candidate's positioning for this role

## PROFESSIONAL SUMMARY RULES
Follow the sentence count in the PAGE COUNT rules below (2 for 1-page, 3 for 2-page). Build it from this structure, in order, dropping the later optional points first when the count is tighter:
  1. Who the candidate is: title + years of experience + core domain/specialisation
  2. Their strongest relevant capability for THIS role (use a JD keyword)
  3. A concrete proof point or achievement that validates the fit (with a number if available)
  4. (Optional, 2-page/15+ years only) What they bring to this employer specifically, or their next-step ambition
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
- Prefer fewer, stronger bullets over padding with weak ones — a weak filler bullet hurts more than a missing one

## INVERTED-PYRAMID WEIGHTING — how a senior resume writer allocates space
Recruiters care most about the last 5 years. Concentrate detail on recent, relevant roles and taper older ones:
- The most recent (or most JD-relevant) role gets the MOST bullets and the strongest achievements.
- Each older role gets progressively fewer bullets.
- Roles older than ~12 years get 1–2 bullets, or a single summary line, or are omitted if irrelevant to the target role.
- Never give an old, junior role the same weight as the current senior one.
Exact per-role bullet counts are specified in the PAGE COUNT rules below — follow them precisely.

## SKILLS RULES — curate, never dump
- A long skills list is a red flag: it signals keyword-stuffing and dilutes the candidate's real strengths. A focused list reads as senior and intentional.
- Select ONLY the most relevant skills for THIS target role — prioritise in this order: (1) skills that appear in the JD and the candidate can credibly claim, (2) key_skills from the candidate profile, (3) the candidate's strongest differentiating technical skills.
- Drop generic/obvious skills (e.g. "Microsoft Word", "Email", "Teamwork") and anything not relevant to the target role.
- Exact skill counts are specified in the PAGE COUNT rules below — treat them as a hard cap, not a target to pad toward.

## SCORING PRIORITIES — get the FIRST draft past the bar (this saves expensive rework)
Independent evaluators grade this resume and it must clear a tier bar to ship without a rebuild (Plus ≥80, Pro ≥90). Each rebuild cycle is slow and costly — so nail the high-weight items on the FIRST pass. Spend effort in proportion to the weights:
- **JD alignment & keyword match (~30% — the biggest lever):** mirror the job description's exact terminology and core requirements wherever the candidate's background genuinely supports them.
- **Quantified achievements (~25%):** every bullet that can carry a number must — %, £/$, scale, volume, time saved. Bare responsibilities score nothing here.
- **Strong action verbs & bullet quality (~20%):** open with ownership verbs; cut filler and passive constructions.
- **Summary relevance (~15%):** position the candidate for THIS specific role and employer; no generic claims.
- **Structure & strategic ordering (~10%):** most JD-relevant content first; tight, no padding.
Run this as a final checklist before you output. A draft that fully covers alignment + quantification on the first pass typically needs zero refine cycles.

## SELF-SCORING TARGET — this resume will be graded across 8 quality dimensions
The result is ALSO scored by our own automated CV scorer. Build it to land in the top band on EVERY dimension — a resume we generate that fails our own score is a poor advertisement:
1. Contact — name, professional email, phone, LinkedIn URL and location all present (plus GitHub/portfolio if the source has them). Copy every URL verbatim.
2. Professional summary — present, the specified sentence count, names years of experience + target role/domain, includes one concrete achievement, and contains zero clichés.
3. Experience — reverse-chronological; every role has company + dates; bullets open with strong ownership verbs; a high share of bullets carry a quantified result.
4. Skills — focused and JD-relevant within the cap; no generic filler.
5. Education — every entry preserved with institution, degree and year.
6. ATS — exact JD terminology used where the candidate's background supports it; clean standard section headings; consistent date formatting.
7. Design/length — fits the page budget cleanly (see PAGE-BREAK HYGIENE); clear hierarchy; no padding.
8. Grammar & spelling — flawless. Re-read every line: no spelling mistakes, no grammar or verb-tense errors, consistent punctuation and capitalisation. A single typo is a visible defect.

## PAGE-BREAK HYGIENE — content must break cleanly across pages
The resume renders onto fixed A4 pages. Size content so no block is ever split awkwardly across a page boundary (one line on a page, the rest on the next):
- Keep every bullet to a SINGLE line (stay within the word limit) — a one-line bullet can never be cut mid-bullet across pages.
- Treat each role together with its bullets as one unit: a role plus its bullets should comfortably fit within a single page. Never write a role so long (too many or too-wordy bullets) that the role spills across a page break.
- Keep the summary tight (per the sentence count) so it sits cleanly near the top of page 1, not spilling over a boundary.
- A section heading must never be the last thing on a page with its content starting the next page — keep headings with their content.
- When content is near a page's capacity, prefer tightening earlier bullets over creating a block that straddles the break.

## PAGE COUNT — HARD TEMPLATE CONSTRAINT
{page_rules}

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


# Hard page-count rules for the resume GENERATOR (the builder).
# Counts reflect senior resume-writing best practice: tight skills lists,
# inverted-pyramid bullet weighting (recent roles get more, older taper), and
# never dropping a section to fit — compress within sections instead.
#
# NOTE: This is the GENERATOR ruleset, SEPARATE BY DESIGN from the CV-score
# PREVIEW ruleset (frontend: components/TemplatePreviews.tsx → PREVIEW_RULES).
# The two are decoupled — even for the same template, the preview may curate
# content differently from the generated resume. Tune them independently.
#
# Both are Mongo-overridable (prompt keys generator_page_rules_1page /
# generator_page_rules_2page) so admins can retune counts with no deploy.
_PAGE_RULES_1PAGE = (
    "The selected template fits exactly **1 A4 page**. This is a non-negotiable hard limit.\n"
    "You are a senior CV writer. NEVER remove a section (Education, Certifications, Awards, Languages, etc.) "
    "to save space — compress content WITHIN sections instead. Apply these exact counts:\n\n"
    "- Summary: 2 sentences maximum — the single most impactful positioning only.\n"
    "- Skills: 6–8 maximum. Hard cap. Only the most JD-relevant and differentiating skills. Never pad toward the cap.\n"
    "- Experience: show the 3 most recent / most relevant roles. Older roles → one summary line each, or omit if irrelevant.\n"
    "- Bullets (inverted pyramid): most recent role 3–4 bullets · 2nd role 2–3 · 3rd role 1–2.\n"
    "- Each bullet: 1 line, maximum 18 words. Cut filler words ruthlessly.\n"
    "- Education: all entries, one line each (degree · institution · year).\n"
    "- Other sections (Certifications, Awards, Languages): include but keep to 1 line per entry; most relevant only.\n\n"
    "All sections appear; only the content density changes to fit one page."
)

_PAGE_RULES_2PAGE = (
    "The selected template fits exactly **2 A4 pages**. This is a non-negotiable hard limit — fill 2 pages well, never spill to a 3rd.\n"
    "You are a senior CV writer. NEVER remove a section to save space — a missing section is always worse than a compressed one. "
    "Apply these exact counts:\n\n"
    "- Summary: 3 sentences (4 only if the candidate has 15+ years and each sentence earns its place).\n"
    "- Skills: 8–10 maximum. Hard cap. Prioritise JD-relevant + key_skills + strongest differentiators. A long dump signals keyword-stuffing — keep it tight.\n"
    "- Experience: show the 4–5 most recent / most relevant roles; for 6+ role careers keep the best 5.\n"
    "- Bullets (inverted pyramid): most recent role 4–5 bullets · mid roles 3 · oldest shown roles 2 · roles >12 years 1–2 (never remove the role).\n"
    "- Each bullet: maximum 22 words — concise and impactful.\n"
    "- Education: all entries, 1–2 lines each.\n"
    "- Other sections (Certifications, Awards, Languages, Projects): include all; keep each entry concise (1–2 lines).\n\n"
    "All sections appear. A tight, well-curated 2-page CV always beats a padded 3-page one."
)


async def _page_rules(pages: int) -> str:
    """Resolve the generator page-count rules, Mongo override winning over the default."""
    key = "generator_page_rules_1page" if pages == 1 else "generator_page_rules_2page"
    default = _PAGE_RULES_1PAGE if pages == 1 else _PAGE_RULES_2PAGE
    try:
        from services.prompt_store import get_override
        override = await get_override(key)
        return override if override else default
    except Exception:
        return default


async def _build_generator_system(tone: str, profession_config: dict, locked_facts: list,
                                   template_pages: int = 2) -> str:
    """Compose the full generator system prompt from base + profession context + locked facts."""
    base = await _get_generator_base()
    page_rules = await _page_rules(template_pages)
    system = TOON_LEGEND + "\n\n" + base.replace("{tone}", tone).replace("{page_rules}", page_rules)
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
    # Self-learning: fold in lessons distilled from past runs so the first draft
    # pre-empts the weaknesses that historically forced extra (costly) cycles.
    try:
        from database import get_db
        from services.agent_memory import get_generator_memory_text
        memory = await get_generator_memory_text(get_db())
        if memory:
            system += f"\n\n{memory}"
    except Exception:
        pass  # memory is best-effort; never block generation
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
    template_pages: int = 2,
) -> list:
    """Build the full message list for a generator run (full resume generation)."""
    system = await _build_generator_system(tone, profession_config, locked_facts, template_pages)
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
    return [_cached_system(system), HumanMessage(content="\n\n".join(parts))]


def _build_patch_schema(patch_keys: list[str]) -> str:
    """Build a minimal JSON schema string for only the requested patch keys."""
    schema_parts = []
    for k in patch_keys:
        if k == "contact":
            schema_parts.append(
                '  "contact": {"email": "string", "phone": "string", "linkedin": "string",'
                ' "github": "string", "website": "string", "location": "string"}'
            )
        elif k == "summary":
            schema_parts.append('  "summary": "string"')
        elif k == "experience":
            schema_parts.append(
                '  "experience": [{"company": "string", "role": "string",'
                ' "dates": "string", "bullets": ["string"]}]'
            )
        elif k == "education":
            schema_parts.append(
                '  "education": [{"institution": "string", "degree": "string", "dates": "string"}]'
            )
        elif k == "sections":
            schema_parts.append('  "sections": [{"title": "string", "items": ["string"]}]')
        else:
            schema_parts.append(f'  "{k}": <value>')
    return "{\n" + ",\n".join(schema_parts) + "\n}"


async def patch_messages(
    resume_text: str,
    user_profile: dict,
    job_description: str,
    tone: str,
    feedback: str,
    current_resume: dict,
    patch_keys: list[str],
    profession_config: dict,
    locked_facts: list,
    key_skills: list,
    template_pages: int = 2,
) -> list:
    """Build the message list for a targeted section patch (cycles 2+).

    Outputs a partial JSON containing only patch_keys — ~200–600 tokens instead
    of 2000–3000 for a full resume, so each patch cycle runs in ~8 s vs ~30 s.
    The caller merges the result back into the current resume.
    Reuses the same cached system prompt as generator_messages for cache hits.
    """
    system = await _build_generator_system(tone, profession_config, locked_facts, template_pages)
    current_subset = {k: current_resume[k] for k in patch_keys if k in current_resume}
    parts = [
        f"## EXISTING RESUME (source of truth — never fabricate)\n{resume_text}",
        f"## CANDIDATE PROFILE\n{toon_encode(user_profile)}",
        f"## JOB DESCRIPTION\n{job_description}",
    ]
    if key_skills:
        skills_block = "\n".join(f"- {s}" for s in key_skills)
        parts.append(f"## KEY SKILLS TO EMPHASISE\n{skills_block}")
    parts.append(
        f"## CURRENT SECTIONS TO FIX (improve these; do not regress what is already strong)\n"
        f"{toon_encode(current_subset)}"
    )
    parts.append(f"## EVALUATOR FEEDBACK (address every suggestion below)\n{feedback}")
    keys_str = ", ".join(f'"{k}"' for k in patch_keys)
    schema = _build_patch_schema(patch_keys)
    parts.append(
        f"## OUTPUT FORMAT\n\n"
        f"Return ONLY a valid JSON object with exactly these keys: {keys_str}.\n"
        f"Do NOT include any other resume sections — the output is merged with the unchanged sections.\n\n"
        f"{schema}"
    )
    parts.append(f"Rewrite {keys_str} to address the feedback above. Return only those keys.")
    return [_cached_system(system), HumanMessage(content="\n\n".join(parts))]


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
    return [_cached_system(system), HumanMessage(content="\n\n".join(parts))]


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
    return [_cached_system(system), HumanMessage(content=content)]


# ── Anthropic Evaluator ───────────────────────────────────────────────────────

_ANTHROPIC_EVALUATOR_BASE = """You are a senior hiring manager and career narrative specialist evaluating a tailored resume. Your perspective focuses on the PERSUASIVENESS and COHERENCE of the candidate's story — not just keyword presence, but whether the resume compellingly argues that this person is the right hire.

## ABSOLUTE CONSTRAINT — NO HALLUCINATION
Your suggestions must only reference skills, experiences, and qualifications that exist in the candidate's resume. Never suggest adding fabricated experience, invented metrics, or qualifications the candidate does not demonstrably have. If you suggest a rewrite, use placeholder brackets like [X] for values the candidate should fill in from their real experience.

## FAITHFULNESS — verify against the ORIGINAL résumé (provided in the user message)
You are given the candidate's ORIGINAL résumé. The tailored résumé must be a faithful, improved version of it — never a fabricated one. Check it rigorously against the ORIGINAL:
- FABRICATION (most serious): flag any company, job title, date, metric/number, technology, tool, certification, qualification, or achievement in the tailored résumé that is NOT supported by the ORIGINAL résumé or candidate background. If you find ANY fabrication, CAP your score at 40 and make it suggestion #1, naming the exact invented item. A faithful but plain résumé must always outrank an impressive but fabricated one.
- REGRESSION: flag any strong, specific, quantified content present in the ORIGINAL that was dropped, genericised, or weakened in the tailored version (e.g. "implemented FIX/JSON gateway for 15+ institutional clients" reduced to "built trading platform").
Faithfulness takes priority over keyword optimisation — gaming the JD by inventing experience is the worst possible outcome.

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


# Data helper shared by all three evaluators: supplies the candidate's ORIGINAL
# résumé into the evaluator's human message so it can verify faithfulness. The
# faithfulness INSTRUCTION lives in each evaluator's (Mongo-overridable) base
# prompt — this only plumbs the source data, like the RESUME / JD sections.
def faithfulness_user_block(source_resume_text: str | None) -> str:
    """The ORIGINAL résumé section appended to an evaluator's human message."""
    if not source_resume_text:
        return ""
    return (
        "\n\n## ORIGINAL RÉSUMÉ (the candidate's source of truth — verify the tailored "
        f"résumé against this; anything not supported here is a fabrication)\n{source_resume_text[:8000]}"
    )


async def anthropic_evaluator_messages(
    resume_json: dict,
    job_description: str,
    profession_config: dict,
    source_resume_text: str | None = None,
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
        f"{faithfulness_user_block(source_resume_text)}"
    )
    return [_cached_system(system), HumanMessage(content=content)]

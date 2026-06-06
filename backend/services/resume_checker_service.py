"""CV Score — AI-powered analysis across 7 quality categories."""
from __future__ import annotations

import json
import logging
import re

from anthropic import AsyncAnthropic

from services.prompt_store import get_override

logger = logging.getLogger("tailormycv.cv_score")


def _cache_system(text: str) -> list[dict]:
    """Wrap a system prompt in an Anthropic cache_control block for prompt caching."""
    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]


async def _resolved(key: str, default: str) -> str:
    """Return the admin override for a prompt key, else the hardcoded default."""
    try:
        return (await get_override(key)) or default
    except Exception:
        return default


def _safe_format(key: str, template: str, default_template: str, **kwargs) -> str:
    """Format a (possibly admin-overridden) prompt template. If a broken override
    fails to format (e.g. missing/extra placeholders), fall back to the default so
    CV scoring can never be taken down by a bad prompt edit."""
    try:
        return template.format(**kwargs)
    except (KeyError, IndexError, ValueError) as exc:
        logger.warning("CV-score prompt override %r failed to format (%s) — using default", key, exc)
        return default_template.format(**kwargs)


# ── Shared regex constants ─────────────────────────────────────────────────────

_DATE_RE = re.compile(
    r"\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"\s+\d{4}"
    r"|\b\d{4}\s*[-–—]\s*(?:\d{4}|Present|Current|Now|Today)\b",
    re.IGNORECASE,
)
_BULLET_STRIP = re.compile(r"^[•·▪▸►\-–—○●*→\s]+")
_IS_BULLET    = re.compile(r"^[•·▪▸►\-–—○●*→]")
_ALLCAPS_HDR  = re.compile(r"^[A-Z][A-Z\s&/\-]{2,34}$")
_KNOWN_HEADERS = {
    "professional summary", "work experience", "career history",
    "employment history", "education", "qualifications", "skills",
    "technical skills", "core competencies", "key skills",
    "certifications", "licences", "awards", "achievements",
    "projects", "publications", "languages", "interests",
    "references", "personal profile", "career objective", "objective",
    "profile", "summary", "experience", "training", "volunteer",
    "hobbies", "additional information", "other",
}


# ── Sub-parsers ────────────────────────────────────────────────────────────────

def _parse_experience(items: list[str]) -> list[dict]:
    """Convert flat experience lines into structured job entries.

    Strategy: date lines are strong anchors.  For each date line, look backward
    to claim role / company lines, then forward to collect bullet lines.
    """
    date_idxs = [i for i, item in enumerate(items) if _DATE_RE.search(item)]

    if not date_idxs:
        bullets = [_BULLET_STRIP.sub("", item).strip() for item in items if item.strip()]
        return [{"role": "", "company": "", "dates": "", "bullets": bullets}] if bullets else []

    # For each date line, claim up to 2 short preceding lines as role/company
    pre_by_date: dict[int, list[int]] = {}
    for date_idx in date_idxs:
        pre: list[int] = []
        k = date_idx - 1
        while k >= 0 and len(pre) < 2:
            item = items[k]
            if _DATE_RE.search(item) or _IS_BULLET.match(item):
                break
            if len(item.strip()) < 90:
                pre.insert(0, k)
                k -= 1
            else:
                break
        pre_by_date[date_idx] = pre

    pre_used: set[int] = {i for idxs in pre_by_date.values() for i in idxs}

    jobs: list[dict] = []
    for j, date_idx in enumerate(date_idxs):
        pre_indices = pre_by_date[date_idx]
        pre_items   = [items[i] for i in pre_indices]
        role    = pre_items[0] if pre_items else ""
        company = pre_items[1] if len(pre_items) > 1 else ""
        dates   = items[date_idx]

        next_date_idx = date_idxs[j + 1] if j + 1 < len(date_idxs) else len(items)
        next_pre      = pre_by_date.get(date_idxs[j + 1], []) if j + 1 < len(date_idxs) else []
        bullet_end    = min(next_pre) if next_pre else next_date_idx

        bullets: list[str] = []
        for i in range(date_idx + 1, bullet_end):
            if i in pre_used:
                continue
            clean = _BULLET_STRIP.sub("", items[i]).strip()
            if clean:
                bullets.append(clean)

        if role or bullets:
            jobs.append({"role": role, "company": company, "dates": dates, "bullets": bullets})

    return jobs


def _parse_education(items: list[str]) -> list[dict]:
    """Convert flat education lines into structured entries."""
    YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
    entries: list[dict] = []
    cur: dict = {"degree": "", "institution": "", "dates": ""}

    for item in items:
        year_m = YEAR_RE.search(item)
        if year_m:
            year_str = year_m.group(0)
            # Strip the year (and surrounding separators) to get any institution text
            rest = item[:year_m.start()].strip().strip("|–-–").strip()
            if cur.get("degree") or cur.get("institution"):
                if rest and not cur.get("institution"):
                    cur["institution"] = rest
                cur["dates"] = year_str
                entries.append(cur)
                cur = {"degree": "", "institution": "", "dates": ""}
            else:
                if rest:
                    cur["institution"] = rest
                cur["dates"] = year_str
        elif not cur.get("degree"):
            cur["degree"] = item
        elif not cur.get("institution"):
            cur["institution"] = item
        else:
            if cur.get("degree"):
                entries.append(cur)
            cur = {"degree": item, "institution": "", "dates": ""}

    if cur.get("degree") or cur.get("institution"):
        entries.append(cur)

    return entries


def _parse_skills(items: list[str]) -> list[str]:
    """Split skill lines into individual skill strings."""
    SPLIT_RE = re.compile(r"[,|•·]")
    skills: list[str] = []
    for item in items:
        parts = [s.strip() for s in SPLIT_RE.split(item) if s.strip()]
        skills.extend(parts if len(parts) > 1 else ([item.strip()] if item.strip() else []))
    return skills


# ── Main profile extractor ────────────────────────────────────────────────────

def extract_full_profile(raw_text: str) -> dict:
    """Extract a fully structured CV profile from raw text — no LLM needed.

    Returns:
        name, title, email, phone, location, linkedin, summary,
        skills[], experience[{role,company,dates,bullets}],
        education[{degree,institution,dates}]
    """
    lines = [l.strip() for l in raw_text.split("\n") if l.strip()]

    email_m    = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", raw_text)
    phone_m    = re.search(r"(?:\+\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,5}", raw_text)
    linkedin_m = re.search(r"linkedin\.com/in/[\w\-]+", raw_text, re.IGNORECASE)
    location_m = re.search(
        r"\b([A-Z][a-zA-Z ]{2,25},\s*(?:UK|US|USA|UAE|Canada|Australia|Ireland|India|Germany|France|[A-Z]{2,}))\b",
        raw_text[:600],
    )

    # ── Name detection ────────────────────────────────────────────────────────
    _name_re  = re.compile(r"^[A-Z][a-zA-Z'\-]+(?: [A-Z][a-zA-Z'\-]+){1,3}$")
    _skip_kws = {"cv", "resume", "curriculum", "vitae", "page", "profile", "address"}
    name = title = ""
    name_line_idx = 0
    for i, line in enumerate(lines[:8]):
        if (_name_re.match(line)
                and len(line) < 50
                and not any(kw in line.lower() for kw in _skip_kws)
                and not re.search(r"\d", line)):
            name = line
            title = lines[i + 1] if i + 1 < len(lines) else ""
            name_line_idx = i
            break
    if not name:
        name = lines[0] if lines else ""
        title = lines[1] if len(lines) > 1 else ""

    # ── Section header detection ───────────────────────────────────────────────
    _contact_kw = {"@", "http", "linkedin", "phone", "email", "tel:"}

    def _is_section_header(line: str) -> bool:
        stripped = line.rstrip(":").strip()
        if not stripped or len(stripped) > 40:
            return False
        if any(kw in line.lower() for kw in _contact_kw):
            return False
        if _ALLCAPS_HDR.match(stripped):
            return True
        if stripped.lower() in _KNOWN_HEADERS:
            return True
        return False

    # ── Collect raw sections (flat items per section) ─────────────────────────
    raw_sections: list[dict] = []
    cur_title: str | None = None
    cur_items: list[str] = []

    # Start at first real section header after the name/contact block
    body_start = name_line_idx + 2
    for i, line in enumerate(lines[name_line_idx + 1:], start=name_line_idx + 1):
        if _is_section_header(line):
            body_start = i
            break

    for line in lines[body_start:]:
        clean = line.lstrip("•·▪▸►-–—○●*").strip()
        if not clean:
            continue
        if _is_section_header(line):
            if cur_title and cur_items:
                raw_sections.append({"title": cur_title, "items": cur_items})
            cur_title = line.rstrip(":").strip()
            cur_items = []
        elif cur_title and clean:
            cur_items.append(clean)

    if cur_title and cur_items:
        raw_sections.append({"title": cur_title, "items": cur_items})

    # ── Parse each section into structured fields ──────────────────────────────
    _CORE_KW = {
        "summary":    ["summary", "profile", "objective", "about", "statement"],
        "experience": ["experience", "employment", "work", "career", "history", "role"],
        "skills":     ["skill", "competenc", "technolog", "expertise", "tool"],
        "education":  ["education", "qualification", "degree", "academic", "study"],
    }

    summary    = ""
    skills:        list[str]  = []
    experience:    list[dict] = []
    education:     list[dict] = []
    extra_sections: list[dict] = []

    for sec in raw_sections:
        t     = sec["title"].lower()
        items = sec["items"]
        if any(kw in t for kw in _CORE_KW["summary"]):
            summary = " ".join(items)
        elif any(kw in t for kw in _CORE_KW["experience"]):
            experience = _parse_experience(items)
        elif any(kw in t for kw in _CORE_KW["skills"]):
            skills = _parse_skills(items)
        elif any(kw in t for kw in _CORE_KW["education"]):
            education = _parse_education(items)
        else:
            # All other sections (Certifications, Languages, Projects, Awards…)
            # are preserved verbatim so templates can render them in the best position
            extra_sections.append({"title": sec["title"], "items": items})

    return {
        "name":           name,
        "title":          title,
        "email":          email_m.group(0)    if email_m    else "",
        "phone":          phone_m.group(0)    if phone_m    else "",
        "location":       location_m.group(1) if location_m else "",
        "linkedin":       linkedin_m.group(0) if linkedin_m else "",
        "summary":        summary,
        "skills":         skills,
        "experience":     experience,
        "education":      education,
        "extra_sections": extra_sections,
    }


# Alias so existing imports keep working
extract_contact_regex = extract_full_profile


# ═══════════════════════════════════════════════════════════════════════════════
# LLM-based CV quality analyser
# ═══════════════════════════════════════════════════════════════════════════════

logger = logging.getLogger("tailormycv")

_SYSTEM = (
    "You are an expert CV reviewer and ATS specialist with 10+ years of experience "
    "evaluating CVs for top-tier companies. Analyse CVs rigorously but fairly — "
    "most strong professional CVs score 65–85. Always return valid JSON only."
)

_PROMPT = """\
Analyse this CV rigorously and return a JSON evaluation. Respond with ONLY the JSON object, no extra text.

CV:
{resume_text}

Return this exact JSON structure with ALL 51 checks populated:
{{
  "overall_score": <integer 0-100>,
  "summary": "<2-sentence overall assessment mentioning the strongest and weakest area>",
  "categories": [
    {{
      "key": "contact",
      "name": "Contact Information",
      "score": <integer 0-100>,
      "status": <"excellent"|"good"|"needs_work"|"missing">,
      "checks": [
        {{"label": "Full name clearly displayed", "passed": <bool>}},
        {{"label": "Professional email address", "passed": <bool>}},
        {{"label": "Phone number with country code", "passed": <bool>}},
        {{"label": "LinkedIn profile URL", "passed": <bool>}},
        {{"label": "City / location listed", "passed": <bool>}},
        {{"label": "GitHub or portfolio URL", "passed": <bool>}},
        {{"label": "No unprofessional email domain (e.g. hotmail, yahoo)", "passed": <bool>}}
      ],
      "improvements": ["<specific actionable suggestion>", "<specific actionable suggestion>"]
    }},
    {{
      "key": "summary",
      "name": "Professional Summary",
      "score": <integer 0-100>,
      "status": <"excellent"|"good"|"needs_work"|"missing">,
      "checks": [
        {{"label": "Summary or objective section present", "passed": <bool>}},
        {{"label": "Appropriate length (3–6 sentences)", "passed": <bool>}},
        {{"label": "States years of experience", "passed": <bool>}},
        {{"label": "Names current or target role/industry", "passed": <bool>}},
        {{"label": "Highlights a key achievement or value", "passed": <bool>}},
        {{"label": "Avoids clichés ('hard-working', 'team player', 'passionate')", "passed": <bool>}},
        {{"label": "Written in third person or omits personal pronouns", "passed": <bool>}},
        {{"label": "Tailored to apparent target role (not generic)", "passed": <bool>}}
      ],
      "improvements": ["<specific actionable suggestion>", "<specific actionable suggestion>", "<specific actionable suggestion>"]
    }},
    {{
      "key": "experience",
      "name": "Work Experience",
      "score": <integer 0-100>,
      "status": <"excellent"|"good"|"needs_work"|"missing">,
      "checks": [
        {{"label": "At least 2 relevant roles listed", "passed": <bool>}},
        {{"label": "Company name and job title for every role", "passed": <bool>}},
        {{"label": "Start and end dates for every role", "passed": <bool>}},
        {{"label": "Reverse chronological order (most recent first)", "passed": <bool>}},
        {{"label": "Uses quantified achievements (numbers, %, $, scale)", "passed": <bool>}},
        {{"label": "Starts bullet points with strong action verbs", "passed": <bool>}},
        {{"label": "At least 3 bullet points per recent role", "passed": <bool>}},
        {{"label": "No unexplained employment gaps longer than 6 months", "passed": <bool>}},
        {{"label": "Current role described in present tense, past roles in past tense", "passed": <bool>}}
      ],
      "improvements": ["<specific actionable suggestion>", "<specific actionable suggestion>", "<specific actionable suggestion>"]
    }},
    {{
      "key": "skills",
      "name": "Skills",
      "score": <integer 0-100>,
      "status": <"excellent"|"good"|"needs_work"|"missing">,
      "checks": [
        {{"label": "Dedicated skills section present", "passed": <bool>}},
        {{"label": "At least 8 technical or hard skills listed", "passed": <bool>}},
        {{"label": "Skills organised by category or type", "passed": <bool>}},
        {{"label": "No generic soft skills only (e.g. 'communication')", "passed": <bool>}},
        {{"label": "Skills relevant to apparent target role", "passed": <bool>}},
        {{"label": "Programming languages or tools included (if technical role)", "passed": <bool>}},
        {{"label": "No outdated or irrelevant technologies listed", "passed": <bool>}}
      ],
      "improvements": ["<specific actionable suggestion>", "<specific actionable suggestion>"]
    }},
    {{
      "key": "education",
      "name": "Education & Certifications",
      "score": <integer 0-100>,
      "status": <"excellent"|"good"|"needs_work"|"missing">,
      "checks": [
        {{"label": "Highest degree / qualification listed", "passed": <bool>}},
        {{"label": "Institution name present", "passed": <bool>}},
        {{"label": "Graduation year included", "passed": <bool>}},
        {{"label": "Relevant certifications or licences listed", "passed": <bool>}},
        {{"label": "Certification issuer mentioned", "passed": <bool>}},
        {{"label": "Field of study specified", "passed": <bool>}}
      ],
      "improvements": ["<specific actionable suggestion>", "<specific actionable suggestion>"]
    }},
    {{
      "key": "ats",
      "name": "ATS Compatibility",
      "score": <integer 0-100>,
      "status": <"excellent"|"good"|"needs_work"|"missing">,
      "checks": [
        {{"label": "Standard section headings (e.g. 'Experience', not 'My Journey')", "passed": <bool>}},
        {{"label": "Consistent date format throughout (e.g. MM/YYYY)", "passed": <bool>}},
        {{"label": "Industry-specific keywords present", "passed": <bool>}},
        {{"label": "No tables, columns, or text boxes (ATS cannot parse these)", "passed": <bool>}},
        {{"label": "No headers or footers with critical contact info", "passed": <bool>}},
        {{"label": "No embedded images or graphics", "passed": <bool>}},
        {{"label": "Role title appears in summary or title line", "passed": <bool>}},
        {{"label": "No excessive use of abbreviations without spelling out first", "passed": <bool>}}
      ],
      "improvements": ["<specific actionable suggestion>", "<specific actionable suggestion>", "<specific actionable suggestion>"]
    }},
    {{
      "key": "design",
      "name": "Design & Format",
      "score": <integer 0-100>,
      "status": <"excellent"|"good"|"needs_work"|"missing">,
      "checks": [
        {{"label": "Appropriate CV length (1–2 pages for <10 years; up to 3 for 15+ years)", "passed": <bool>}},
        {{"label": "Consistent font and text size throughout", "passed": <bool>}},
        {{"label": "Clear visual hierarchy (headings larger than body)", "passed": <bool>}},
        {{"label": "Adequate white space — not cluttered", "passed": <bool>}},
        {{"label": "Bullet points used consistently (not mixed with paragraphs)", "passed": <bool>}},
        {{"label": "Consistent alignment and indentation", "passed": <bool>}},
        {{"label": "No spelling errors detected in section headings", "passed": <bool>}}
      ],
      "improvements": ["<specific actionable suggestion>", "<specific actionable suggestion>"]
    }}
  ]
}}

SCORING RULES (be rigorous — most CVs score 45–65, not 75+):
- overall_score = weighted average: experience 25%, skills 20%, ats 20%, summary 15%, design 10%, contact 7%, education 3%
- Be conservative: a CV needs to pass 80%+ of checks in a category to score above 75
- status thresholds: 85-100 = excellent (rare), 65-84 = good, 40-64 = needs_work, 0-39 = missing/poor
- Every failed check MUST reduce the score meaningfully — failing 2 checks should not still give 80+
- improvements: 2-3 specific, actionable suggestions per category — even for high scorers
- Be concrete and critical: "Your summary contains the cliché 'passionate about' — remove it" not "Improve your summary"
- Assume the CV needs improvement unless the evidence is overwhelming
"""


async def check_resume(resume_text: str, anthropic_key: str) -> dict:
    """Analyse CV text and return structured quality check results."""
    client = AsyncAnthropic(api_key=anthropic_key)

    system = await _resolved("cv_score_quality_system", _SYSTEM)
    prompt = _safe_format(
        "cv_score_quality_prompt",
        await _resolved("cv_score_quality_prompt", _PROMPT), _PROMPT,
        resume_text=resume_text[:8000],
    )

    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=6000,
        system=_cache_system(system),
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown code fences if the model wrapped the JSON
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    return json.loads(raw)


def extract_weak_categories(check_result: dict, score_threshold: int = 85) -> list[dict]:
    """Return categories below score_threshold with their improvement hints.

    Pure function — no LLM call. Used by both the CvScoreEvaluatorAgent and the
    CV Score refinement loop to build structured issue lists for the next pass.
    """
    categories = check_result.get("categories") or []
    weak = []
    for cat in sorted(categories, key=lambda c: int(c.get("score", 100) or 100)):
        score = int(cat.get("score", 100) or 100)
        if score >= score_threshold:
            continue
        improvements = (cat.get("improvements") or [])[:3]
        if improvements:
            weak.append({
                "key": cat.get("key") or cat.get("name") or "category",
                "name": cat.get("name") or cat.get("key") or "category",
                "score": score,
                "improvements": improvements,
            })
    return weak


# ═══════════════════════════════════════════════════════════════════════════════
# Dedicated resume extractor — powers the live template preview
# ═══════════════════════════════════════════════════════════════════════════════
# This is a SEPARATE, focused LLM call (run in parallel with check_resume).
# Its only job is to faithfully reconstruct the candidate's resume as structured
# JSON so it can be rendered in any template. Decoupling it from the 51-check
# quality analysis dramatically improves fidelity: every role is separated, every
# bullet captured verbatim, and every section preserved — no truncation, no merging.

_EXTRACT_SYSTEM = (
    "You are a meticulous resume parser. You extract the COMPLETE contents of a "
    "resume into structured JSON, faithfully and verbatim. This powers a live "
    "preview of the candidate's own CV, so you must never summarise, rewrite, "
    "shorten, reorder, or invent. Never drop a role, a bullet, or a section. "
    "Return valid JSON only — no preamble, no markdown."
)

_EXTRACT_PROMPT = """\
Extract this resume into the exact JSON structure below. Respond with ONLY the JSON object.

RESUME:
{resume_text}

Return EXACTLY this structure:
{{
  "name":     "<candidate's full name>",
  "title":    "<professional headline or most recent job title>",
  "email":    "<email or empty string>",
  "phone":    "<phone or empty string>",
  "location": "<city, country or empty string>",
  "linkedin": "<LinkedIn URL or empty string>",
  "summary":  "<the full professional summary / profile / objective text, verbatim — empty string if none>",
  "skills":   ["<each individual skill as its own string>"],
  "experience": [
    {{
      "role":     "<exact job title>",
      "company":  "<exact company / employer name>",
      "location": "<work location if stated, else empty string>",
      "dates":    "<date range exactly as written, e.g. Jan 2020 – Present>",
      "bullets":  ["<every bullet under this role, verbatim, in order>"]
    }}
  ],
  "education": [
    {{
      "degree":      "<qualification name exactly as written>",
      "institution": "<university / school name>",
      "dates":       "<year or date range>"
    }}
  ],
  "extra_sections": [
    {{
      "title": "<the EXACT section heading from the CV>",
      "items": ["<each entry under it, verbatim, one per item>"]
    }}
  ]
}}

EXTRACTION RULES — follow precisely:
- Extract EVERY role as a separate experience object. NEVER merge two roles into one.
- Capture EVERY bullet under each role, verbatim and in original order. Do not truncate, summarise, or skip any.
- Strip leading bullet symbols (•, -, ▸, *) from bullet text — keep the words only.
- skills: split comma/pipe/semicolon-separated lists so each skill is its own array element.
- summary: the complete profile/summary/objective paragraph, word-for-word. Empty string if the CV has none.
- Core sections (Summary/Profile, Experience/Employment, Skills, Education) go in their dedicated fields.
- EVERY other section (Certifications, Licences, Languages, Projects, Awards, Publications, Volunteer Work, Memberships, Interests, etc.) goes in extra_sections with its EXACT heading from the CV.
- Preserve original order — experience most-recent-first as written.
- If a field is absent, use an empty string or empty array. NEVER invent content that is not in the CV.
"""


async def extract_resume_for_preview(resume_text: str, anthropic_key: str) -> dict:
    """Faithfully extract a full structured resume from raw text via a focused LLM call.

    Returns a dict with: name, title, email, phone, location, linkedin, summary,
    skills[], experience[{role,company,location,dates,bullets[]}],
    education[{degree,institution,dates}], extra_sections[{title,items[]}].

    Designed to run concurrently with check_resume(). On any failure the caller
    should fall back to extract_full_profile() (the regex parser).
    """
    client = AsyncAnthropic(api_key=anthropic_key)

    system = await _resolved("cv_score_extract_system", _EXTRACT_SYSTEM)
    prompt = _safe_format(
        "cv_score_extract_prompt",
        await _resolved("cv_score_extract_prompt", _EXTRACT_PROMPT), _EXTRACT_PROMPT,
        resume_text=resume_text[:12000],
    )

    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=8000,
        system=_cache_system(system),
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    data = json.loads(raw)

    # Normalise: guarantee every expected key exists with the right type
    return {
        "name":           data.get("name", "") or "",
        "title":          data.get("title", "") or "",
        "email":          data.get("email", "") or "",
        "phone":          data.get("phone", "") or "",
        "location":       data.get("location", "") or "",
        "linkedin":       data.get("linkedin", "") or "",
        "summary":        data.get("summary", "") or "",
        "skills":         data.get("skills") or [],
        "experience":     data.get("experience") or [],
        "education":      data.get("education") or [],
        "extra_sections": data.get("extra_sections") or [],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Dedicated resume QA validator — checks fit, optimisation, completeness
# ═══════════════════════════════════════════════════════════════════════════════
# A SEPARATE focused LLM call (one job: QA a structured resume against the page
# budget and best-practice counts). Used after generation in the builder and
# after extraction in the CV-score preview. Best-effort — callers should tolerate
# failure and treat a missing verdict as "not validated", never a hard error.

_VALIDATE_SYSTEM = (
    "You are a senior resume QA reviewer. You receive a structured resume and a page "
    "budget, and you judge three things only: (1) does the content fit the page budget "
    "without overflowing or leaving the page badly underfilled, (2) is each section sized "
    "to best practice, (3) are all expected sections present. You return a strict JSON "
    "verdict and nothing else."
)

# Best-practice targets the validator scores against — kept in sync with
# _page_rules() in services/pipeline/prompts/anthropic.py.
_VALIDATE_TARGETS = {
    1: "1 A4 page. Targets: summary ≤2 sentences; skills 6–8; show 3 most recent roles; "
       "bullets per role most-recent 3–4, then 2–3, then 1–2; each bullet ≤18 words.",
    2: "2 A4 pages. Targets: summary 3 sentences; skills 8–10; show 4–5 roles; "
       "bullets per role most-recent 4–5, mid 3, oldest 1–2; each bullet ≤22 words.",
}

_VALIDATE_PROMPT = """\
Validate this resume against its page budget. Respond with ONLY the JSON object.

PAGE BUDGET: {page_count} A4 page(s).
BEST-PRACTICE TARGETS: {targets}

{source_block}RESUME (structured JSON):
{resume_json}

Return EXACTLY this structure:
{{
  "estimated_pages": <number — how many A4 pages this content actually needs when rendered, e.g. 1.0, 1.5, 2.3>,
  "truncated": <true if estimated_pages exceeds the PAGE BUDGET — i.e. content will overflow and be cut off>,
  "page_breaks_clean": <true if every role/section fits cleanly within a page, false if any block would be split across a page boundary>,
  "optimized": <true if section sizes follow the best-practice targets, else false>,
  "page_fit": "<good | overflow_risk | underfilled>",
  "issues": ["<each concrete problem, e.g. 'Skills list has 14 items (max 8 for 1 page)'>"],
  "missing_sections": ["<any section heading present in the SOURCE but absent from the resume>"],
  "suggestions": ["<each concrete fix, e.g. 'Cut oldest role from 5 bullets to 2'>"]
}}

HOW TO ESTIMATE PAGES (a single A4 page holds roughly 45–50 text lines at this font size):
- Header + contact ≈ 3 lines. Summary ≈ 1 line per ~14 words. Skills ≈ 1 line per ~8 skills.
- Each experience role ≈ 2 lines (title/company/dates) + 1 line per bullet (more if a bullet is long).
- Education ≈ 1 line per entry. Each extra section ≈ 1 line heading + its items.
- Sum the lines, divide by ~47 lines/page, round to one decimal.

RULES:
- truncated: TRUE whenever estimated_pages > the page budget. This is the most important field — a truncated resume has content cut off at the bottom and looks broken.
- page_breaks_clean: FALSE if any single role (with its bullets) or section is so large it would straddle a page boundary — leaving part of the block on one page and the rest on the next (e.g. a role's header at the bottom of page 1 with its bullets on page 2, or a bullet split across the boundary). When false, add a suggestion naming the block to resize so it sits within one page.
- page_fit: "overflow_risk" if estimated_pages exceeds the budget; "underfilled" if content fills less than ~70% of the budget (large empty space); otherwise "good".
- optimized: false if ANY section breaks its best-practice target (too many skills, too many bullets on old roles, summary too long, etc.).
- missing_sections: ONLY sections present in the SOURCE resume but absent from the structured resume. Empty array if none or no source provided.
- When truncated, suggestions MUST say exactly what to cut to fit (e.g. 'Reduce to 4 most recent roles', 'Trim role X to 2 bullets', 'Cut skills from 14 to 8').
- Be specific and quantitative. Empty arrays when there is nothing to report.
"""


async def validate_resume_layout(
    resume: dict,
    page_count: int,
    anthropic_key: str,
    source_resume_text: str | None = None,
) -> dict:
    """QA a structured resume against its page budget via a focused LLM call.

    Returns: {estimated_pages: float, truncated: bool, page_breaks_clean: bool,
    optimized: bool, page_fit: str, issues: [], missing_sections: [],
    suggestions: []}. `truncated` flags content overflowing the budget;
    `page_breaks_clean` is False when a role/section would be split across a
    page boundary. Raises on LLM/parse failure — callers treat as best-effort.
    """
    client = AsyncAnthropic(api_key=anthropic_key)

    targets = _VALIDATE_TARGETS.get(page_count, _VALIDATE_TARGETS[2])
    source_block = ""
    if source_resume_text:
        source_block = f"SOURCE RESUME (the candidate's original — for completeness check):\n{source_resume_text[:6000]}\n\n"

    system = await _resolved("cv_score_validate_system", _VALIDATE_SYSTEM)
    prompt = _safe_format(
        "cv_score_validate_prompt",
        await _resolved("cv_score_validate_prompt", _VALIDATE_PROMPT), _VALIDATE_PROMPT,
        page_count=page_count,
        targets=targets,
        source_block=source_block,
        resume_json=json.dumps(resume, ensure_ascii=False)[:8000],
    )

    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1500,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    data = json.loads(raw)

    # Derive truncated deterministically from estimated_pages as a safety net,
    # in case the model sets the boolean inconsistently with its own estimate.
    try:
        est_pages = float(data.get("estimated_pages") or 0)
    except (TypeError, ValueError):
        est_pages = 0.0
    truncated = bool(data.get("truncated", False)) or (est_pages > page_count + 0.05)

    return {
        "estimated_pages":   round(est_pages, 1),
        "truncated":         truncated,
        "page_breaks_clean": bool(data.get("page_breaks_clean", True)),
        "optimized":         bool(data.get("optimized", False)),
        "page_fit":          data.get("page_fit", "good") or "good",
        "issues":            data.get("issues") or [],
        "missing_sections":  data.get("missing_sections") or [],
        "suggestions":       data.get("suggestions") or [],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Dedicated grammar & spelling check — its own focused LLM call (runs in parallel
# with check_resume). Finds genuine spelling/grammar errors and proposes the exact
# correction for each, returned as a CV-Score category so it renders in the UI.
# ═══════════════════════════════════════════════════════════════════════════════

_GRAMMAR_SYSTEM = (
    "You are a meticulous proofreader for professional CVs. You find spelling, grammar, "
    "punctuation, capitalisation and verb-tense errors and propose the exact correction "
    "for each. You are precise and never invent errors — when in doubt, leave it out. "
    "Always return valid JSON only."
)

_GRAMMAR_PROMPT = """\
Proofread this CV for spelling and grammar mistakes. Respond with ONLY the JSON object.

CV:
{resume_text}

Report GENUINE errors only. Do NOT flag: valid technical terms, programming languages,
frameworks, brand/company names, acronyms, intentional capitalisation, or stylistic choices.
For each error, give the smallest exact original snippet and its correction.

Return EXACTLY this structure:
{{
  "score": <integer 0-100 — 100 = flawless; deduct ~5 per error, more for careless ones>,
  "summary": "<one sentence on overall language quality>",
  "issues": [
    {{"type": "spelling"|"grammar"|"punctuation",
      "original": "<exact incorrect text>",
      "suggestion": "<corrected text>",
      "where": "<section/role it appears in, e.g. 'Summary' or 'Experience – Acme Corp'>"}}
  ]
}}

RULES:
- Empty "issues" array if the CV is clean.
- List at most 25 issues, most important first.
- "original" must be copied verbatim from the CV so it can be located.
"""


def _grammar_to_category(data: dict) -> dict:
    """Shape the grammar LLM output into a standard CV-Score category so the
    existing UI renders it (score, status, checks, improvements)."""
    issues = [i for i in (data.get("issues") or []) if isinstance(i, dict)]
    try:
        score = int(data.get("score", 100))
    except (TypeError, ValueError):
        score = 100
    score = max(0, min(100, score))
    spelling = [i for i in issues if i.get("type") == "spelling"]
    grammar = [i for i in issues if i.get("type") in ("grammar", "punctuation")]
    status = ("excellent" if score >= 85 else "good" if score >= 65
              else "needs_work" if score >= 40 else "missing")

    def _fmt(i: dict) -> str:
        kind = (i.get("type") or "issue").capitalize()
        orig = i.get("original", "")
        sugg = i.get("suggestion", "")
        where = i.get("where", "")
        loc = f"  ({where})" if where else ""
        return f"{kind}: “{orig}” → “{sugg}”{loc}"

    return {
        "key": "grammar",
        "name": "Grammar & Spelling",
        "score": score,
        "status": status,
        "checks": [
            {"label": "No spelling mistakes", "passed": len(spelling) == 0},
            {"label": "No grammar errors", "passed": len(grammar) == 0},
            {"label": "Clean punctuation & capitalisation", "passed": len(issues) == 0},
        ],
        "improvements": [_fmt(i) for i in issues[:25]],
    }


async def check_grammar(resume_text: str, anthropic_key: str) -> dict:
    """Dedicated grammar/spelling proofreading call. Returns a CV-Score category
    dict (key='grammar') with the specific corrections in `improvements`."""
    client = AsyncAnthropic(api_key=anthropic_key)

    system = await _resolved("cv_score_grammar_system", _GRAMMAR_SYSTEM)
    prompt = _safe_format(
        "cv_score_grammar_prompt",
        await _resolved("cv_score_grammar_prompt", _GRAMMAR_PROMPT), _GRAMMAR_PROMPT,
        resume_text=resume_text[:9000],
    )

    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2500,
        system=_cache_system(system),
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    return _grammar_to_category(json.loads(raw))

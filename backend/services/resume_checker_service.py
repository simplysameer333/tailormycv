"""CV Score — AI-powered analysis across 7 quality categories."""
from __future__ import annotations

import json
import logging
import re

from anthropic import AsyncAnthropic


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
    summary    = ""
    skills:    list[str] = []
    experience: list[dict] = []
    education:  list[dict] = []

    for sec in raw_sections:
        t = sec["title"].lower()
        items = sec["items"]
        if any(kw in t for kw in ["summary", "profile", "objective", "about", "statement"]):
            summary = " ".join(items)
        elif any(kw in t for kw in ["experience", "employment", "work", "career", "history", "role"]):
            experience = _parse_experience(items)
        elif any(kw in t for kw in ["skill", "competenc", "technolog", "expertise", "tool"]):
            skills = _parse_skills(items)
        elif any(kw in t for kw in ["education", "qualification", "degree", "academic", "study"]):
            education = _parse_education(items)

    return {
        "name":       name,
        "title":      title,
        "email":      email_m.group(0)    if email_m    else "",
        "phone":      phone_m.group(0)    if phone_m    else "",
        "location":   location_m.group(1) if location_m else "",
        "linkedin":   linkedin_m.group(0) if linkedin_m else "",
        "summary":    summary,
        "skills":     skills,
        "experience": experience,
        "education":  education,
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
  ],
  "extracted_contact": {{
    "name":     "<candidate's full name exactly as written on the CV>",
    "title":    "<current or most recent job title from the CV>",
    "email":    "<email address if present, else empty string>",
    "phone":    "<phone number if present, else empty string>",
    "location": "<city and country e.g. London, UK — or empty string>",
    "linkedin": "<LinkedIn URL if present, else empty string>"
  }},
  "extracted_resume": {{
    "summary": "<professional summary or objective verbatim from the CV — empty string if none>",
    "skills": ["<skill>", "<skill>"],
    "experience": [
      {{
        "role":    "<exact job title from CV>",
        "company": "<exact company name from CV>",
        "dates":   "<date range exactly as written e.g. Jan 2020 – Present>",
        "bullets": ["<achievement or responsibility verbatim>", "<achievement or responsibility verbatim>"]
      }}
    ],
    "education": [
      {{
        "degree":      "<qualification name exactly as written>",
        "institution": "<university or school name>",
        "dates":       "<graduation year or date range>"
      }}
    ]
  }}
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

    prompt = _PROMPT.format(resume_text=resume_text[:8000])

    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=6000,
        system=_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown code fences if the model wrapped the JSON
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    return json.loads(raw)

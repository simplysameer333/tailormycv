"""CV Score — AI-powered analysis across 7 quality categories."""
from __future__ import annotations

import json
import logging
import re

from anthropic import AsyncAnthropic


def extract_full_profile(raw_text: str) -> dict:
    """Extract name, contact and ALL CV sections from raw text — no LLM required.

    Returns the same shape as the LLM-extracted extracted_contact so it can be
    used as a drop-in replacement for both fresh and cached result paths.
    """
    lines = [l.strip() for l in raw_text.split("\n") if l.strip()]

    email_m    = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", raw_text)
    phone_m    = re.search(r"(?:\+\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,5}", raw_text)
    linkedin_m = re.search(r"linkedin\.com/in/[\w\-]+", raw_text, re.IGNORECASE)

    # ── Name: first line in the header area that looks like a person's name ─────
    _name_re  = re.compile(r"^[A-Z][a-zA-Z'\-]+(?: [A-Z][a-zA-Z'\-]+){1,3}$")
    _skip_kws = {"cv", "resume", "curriculum", "vitae", "page", "profile", "address"}
    name = title = ""
    name_line_idx = 0
    for i, line in enumerate(lines[:8]):
        if (_name_re.match(line)
                and len(line) < 50
                and not any(kw in line.lower() for kw in _skip_kws)
                and not re.search(r"\d", line)):
            name  = line
            title = lines[i + 1] if i + 1 < len(lines) else ""
            name_line_idx = i
            break
    if not name:
        name  = lines[0] if lines else ""
        title = lines[1] if len(lines) > 1 else ""
        name_line_idx = 0

    # ── Section parser: detect headers then collect items beneath them ──────────
    # A section header is an ALL-CAPS or Title-Case short line (not contact data).
    _hdr_re = re.compile(
        r"^(?:[A-Z][A-Z\s&/\(\)\-]{2,35}|[A-Z][a-z]+(?:\s+[A-Z][a-z]*)*)\s*:?$"
    )
    _contact_skip = {"gmail", "yahoo", "hotmail", "linkedin", "http", "@", "phone", "email", "tel"}
    _hdr_skip = {"cv", "resume", "curriculum vitae", "page", "references available"}

    sections: list[dict] = []
    cur_title: str | None = None
    cur_items: list[str] = []

    # Skip lines that belong to the contact header block (first ~6 lines after name)
    body_start = name_line_idx + 4

    for line in lines[body_start:]:
        clean_line = line.lstrip("•·▪▸►-–—○●*").strip()
        if not clean_line:
            continue

        is_header = (
            _hdr_re.match(line)
            and len(line) <= 40
            and not any(kw in line.lower() for kw in _contact_skip)
            and line.lower().rstrip(":") not in _hdr_skip
        )

        if is_header:
            if cur_title and cur_items:
                sections.append({"title": cur_title, "items": cur_items})
            cur_title = line.rstrip(":").strip()
            cur_items = []
        elif cur_title and clean_line:
            cur_items.append(clean_line)

    if cur_title and cur_items:
        sections.append({"title": cur_title, "items": cur_items})

    return {
        "name":     name,
        "title":    title,
        "email":    email_m.group(0)    if email_m    else "",
        "phone":    phone_m.group(0)    if phone_m    else "",
        "linkedin": linkedin_m.group(0) if linkedin_m else "",
        "sections": sections,
    }


# Keep old name as alias so any existing imports don't break
extract_contact_regex = extract_full_profile

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
    "linkedin": "<LinkedIn URL if present, else empty string>",
    "sections": [
      {{
        "title": "<exact section heading from the CV e.g. 'Work Experience', 'Skills', 'Education', 'Publications', 'Certifications'>",
        "items": ["<one item per bullet / entry — for experience include role, company, dates and each bullet as separate items>"]
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
        max_tokens=6000,  # 51 checks + improvements across 7 categories
        system=_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        result = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("[cv_score] Failed to parse AI response: %s", exc)
        raise ValueError("CV analysis failed — please try again.") from exc

    return result

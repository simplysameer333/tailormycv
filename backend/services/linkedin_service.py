"""LinkedIn profile fetcher via LinkdAPI on RapidAPI."""
from __future__ import annotations

import logging
import re

import httpx

logger = logging.getLogger("tailormycv")

_RAPIDAPI_HOST = "linkdapi-best-unofficial-linkedin-api.p.rapidapi.com"
_BASE_URL = f"https://{_RAPIDAPI_HOST}"
_LINKEDIN_URL_RE = re.compile(
    r"^https?://(www\.)?linkedin\.com/in/[a-zA-Z0-9\-_%\.]+/?(\?.*)?$"
)


def is_valid_linkedin_url(url: str) -> bool:
    return bool(_LINKEDIN_URL_RE.match(url.strip()))


def _extract_username(linkedin_url: str) -> str:
    """Extract the profile slug from a linkedin.com/in/<username> URL."""
    clean = linkedin_url.strip().rstrip("/").split("?")[0]
    if "/in/" in clean:
        return clean.split("/in/")[-1].rstrip("/")
    return clean  # already a slug


def _parse_date_obj(d: dict | str | None) -> str:
    """Convert a date dict {year, month[, day]} or 'YYYY-MM' string to 'MM/YYYY'.

    LinkdAPI uses {year: 0, month: 0, day: 0} for current/open-ended positions,
    so we treat year==0 as empty (no date).
    """
    if not d:
        return ""
    if isinstance(d, dict):
        year  = d.get("year") or 0
        month = d.get("month") or 0
        if not year:
            return ""
        return f"{month}/{year}" if month else str(year)
    if isinstance(d, str):
        parts = d.split("-")
        return f"{parts[1]}/{parts[0]}" if len(parts) >= 2 else d
    return ""


def _get_location(data: dict) -> str:
    """Extract location from LinkdAPI response.

    LinkdAPI returns location under data.geo.full / data.geo.city,
    not as a top-level 'location' key.
    """
    geo = data.get("geo") or {}
    if isinstance(geo, dict):
        return geo.get("full") or geo.get("city") or geo.get("country") or ""
    # Fallback for other providers
    return (
        data.get("location") or data.get("addressWithCountry")
        or data.get("city") or data.get("geoLocation") or ""
    )


def _build_raw_text(data: dict) -> str:
    """Convert LinkdAPI response into structured text for the AI pipeline."""
    lines: list[str] = []

    full_name = (
        data.get("fullName") or data.get("full_name")
        or f"{data.get('firstName', '')} {data.get('lastName', '')}".strip()
    )
    headline  = data.get("headline") or data.get("occupation") or ""
    location  = _get_location(data)
    summary   = data.get("summary") or data.get("about") or data.get("description") or ""
    email     = data.get("email") or data.get("personal_email") or ""

    if full_name:
        lines.append(f"Name: {full_name}")
    if headline:
        lines.append(f"Headline: {headline}")
    if location:
        lines.append(f"Location: {location}")
    if email:
        lines.append(f"Email: {email}")
    if summary:
        lines += ["", "Summary:", summary]

    # Experience — LinkdAPI uses "position" array
    for exp in (data.get("position") or data.get("experience") or data.get("positions") or []):
        title   = exp.get("title") or exp.get("role") or ""
        company = exp.get("companyName") or exp.get("company") or exp.get("company_name") or ""
        start   = exp.get("start") or exp.get("startDate") or exp.get("starts_at")
        end     = exp.get("end")   or exp.get("endDate")   or exp.get("ends_at")

        s_str = _parse_date_obj(start)
        e_str = _parse_date_obj(end)
        date  = f"{s_str} – {e_str or 'Present'}" if s_str else ""

        role_line = title
        if company:
            role_line += f" at {company}"
        if date:
            role_line += f" ({date})"
        if role_line:
            lines.append("")
            lines.append(role_line)

        for dl in (exp.get("description") or "").strip().split("\n")[:6]:
            if dl.strip():
                lines.append(f"  {dl.strip()}")

    # Education — LinkdAPI uses "educations"
    for edu in (data.get("educations") or data.get("education") or []):
        school = edu.get("schoolName") or edu.get("school") or edu.get("school_name") or ""
        degree = edu.get("degreeName") or edu.get("degree") or edu.get("degree_name") or ""
        field  = edu.get("fieldOfStudy") or edu.get("field_of_study") or edu.get("field") or ""
        start  = _parse_date_obj(edu.get("start") or edu.get("startDate"))
        end    = _parse_date_obj(edu.get("end")   or edu.get("endDate"))

        edu_line = degree
        if field:
            edu_line += f" in {field}"
        if school:
            edu_line += f" · {school}"
        if start or end:
            edu_line += f" ({start}–{end})"
        if edu_line:
            lines.append("")
            lines.append(f"Education: {edu_line}")

    # Skills — array of {name, passedSkillAssessment} objects
    raw_skills = data.get("skills") or data.get("skills_v2") or []
    skill_names = [
        (s.get("name") if isinstance(s, dict) else str(s))
        for s in raw_skills[:25]
    ]
    skill_names = [s for s in skill_names if s]
    if skill_names:
        lines += ["", f"Skills: {', '.join(skill_names)}"]

    return "\n".join(lines)


def _normalize(data: dict) -> dict:
    full_name = (
        data.get("fullName") or data.get("full_name")
        or f"{data.get('firstName', '')} {data.get('lastName', '')}".strip()
    )
    username = data.get("username") or ""
    raw_skills = data.get("skills") or data.get("skills_v2") or []
    skills = [
        (s.get("name") if isinstance(s, dict) else str(s))
        for s in raw_skills[:25]
    ]
    return {
        "full_name":    full_name,
        "headline":     data.get("headline") or data.get("occupation") or "",
        "location":     _get_location(data),
        "email":        data.get("email") or data.get("personal_email") or "",
        "linkedin_url": f"https://www.linkedin.com/in/{username}" if username else "",
        "summary":      data.get("summary") or data.get("about") or data.get("description") or "",
        "skills":       [s for s in skills if s],
        "raw_text":     _build_raw_text(data),
    }


async def fetch_profile(linkedin_url: str, rapidapi_key: str) -> dict:
    """Fetch and normalise a LinkedIn profile via LinkdAPI on RapidAPI.

    Raises:
        ValueError: invalid URL format or API returned an error response
        httpx.HTTPStatusError: API-level HTTP error (caller maps to HTTPException)
    """
    if not is_valid_linkedin_url(linkedin_url):
        raise ValueError(
            "Invalid LinkedIn profile URL — expected linkedin.com/in/username."
        )

    username = _extract_username(linkedin_url)

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            f"{_BASE_URL}/api/v1/profile/full",
            params={"username": username},
            headers={
                "x-rapidapi-host": _RAPIDAPI_HOST,
                "x-rapidapi-key": rapidapi_key,
            },
        )
        resp.raise_for_status()

    body = resp.json()

    # LinkdAPI wraps all responses: {"success": bool, "statusCode": int, "message": str, "data": {...}}
    if isinstance(body, dict) and not body.get("success", True):
        logger.warning("[linkedin] API returned failure for @%s: %s", username, body.get("message", ""))
        raise ValueError("linkedin_api_unavailable")

    data = body.get("data") if isinstance(body.get("data"), dict) else body
    logger.info("[linkedin] Fetched profile for @%s", username)
    return _normalize(data)

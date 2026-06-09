import json
import logging
import re
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from anthropic import AsyncAnthropic
from database import get_db
from models.session import UserProfile
from config import settings

router = APIRouter()
logger = logging.getLogger("tailormycv")

_PREFILL_PROMPT = """Extract the following fields from the resume text and return as a single JSON object.
Use empty string "" for any field you cannot find.

Fields:
- full_name: candidate's full name
- email: email address
- phone: phone number
- linkedin: LinkedIn URL or username (full URL preferred)
- location: city and country/state
- target_role: current or most recent job title, or stated objective/target role
- key_skills: top 8-10 skills as a comma-separated string

Return only the JSON object, no markdown fences, no explanation."""


@router.get("/profile/prefill")
async def prefill_profile(session_id: str):
    db = get_db()
    session = await db.sessions.find_one(
        {"_id": ObjectId(session_id)}, {"resume_parsed": 1, "user_profile": 1}
    )
    if not session:
        raise HTTPException(404, "Session not found.")

    raw_text = (session.get("resume_parsed") or {}).get("raw_text", "")
    if not raw_text:
        # Fall back to user_profile already in session (e.g. loaded from library resume)
        existing = session.get("user_profile") or {}
        if any(existing.values()):
            return {
                "full_name":   existing.get("full_name", ""),
                "email":       existing.get("email", ""),
                "phone":       existing.get("phone", ""),
                "linkedin":    existing.get("linkedin", ""),
                "location":    existing.get("location", ""),
                "target_role": existing.get("target_role", ""),
                "key_skills":  ", ".join(existing.get("key_skills") or []),
            }
        return {}

    # LLM extraction — resilient. On ANY failure (bad/retired model, timeout,
    # non-JSON output) we don't 500 silently; we fall back to the deterministic
    # regex parser so the user still gets their basic contact info.
    data: dict = {}
    try:
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await client.messages.create(
            model=settings.anthropic_evaluator_model,
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": f"{_PREFILL_PROMPT}\n\nResume:\n{raw_text[:4000]}",
            }],
        )
        raw = message.content[0].text.strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            data = parsed
    except Exception as exc:
        logger.warning("[prefill] LLM extraction failed (%s) — falling back to regex.", exc)

    # Fill any missing core fields from the regex parser (no API needed, never fails hard).
    if not data.get("full_name") or not data.get("email"):
        try:
            from services.resume_checker_service import extract_full_profile
            rx = extract_full_profile(raw_text)
            data = {
                "full_name":   data.get("full_name") or rx.get("name", ""),
                "email":       data.get("email") or rx.get("email", ""),
                "phone":       data.get("phone") or rx.get("phone", ""),
                "linkedin":    data.get("linkedin") or rx.get("linkedin", ""),
                "location":    data.get("location") or rx.get("location", ""),
                "target_role": data.get("target_role") or rx.get("title", ""),
                "key_skills":  data.get("key_skills") or ", ".join(rx.get("skills") or []),
            }
        except Exception as exc:
            logger.warning("[prefill] regex fallback failed: %s", exc)

    return data


@router.get("/profile/session")
async def get_session_profile(session_id: str):
    """Return the saved user_profile for a session (used for template live preview)."""
    db = get_db()
    try:
        session = await db.sessions.find_one(
            {"_id": ObjectId(session_id)}, {"user_profile": 1}
        )
    except Exception:
        raise HTTPException(400, "Invalid session ID.")
    if not session or not session.get("user_profile"):
        raise HTTPException(404, "Profile not found for this session.")
    return session["user_profile"]


@router.post("/profile")
async def save_profile(session_id: str, profile: UserProfile):
    db = get_db()
    result = await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"user_profile": profile.model_dump()}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Session not found.")
    return {"ok": True}

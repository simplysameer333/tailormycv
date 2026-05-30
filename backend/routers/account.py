"""Account profile router — persistent user profile (separate from builder sessions).

GET  /api/account/profile            — get current user's profile
PUT  /api/account/profile            — save / update profile fields
POST /api/account/profile/resume     — upload resume → parse + AI prefill → store
POST /api/sessions/from-profile      — create a builder session pre-loaded from profile
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from typing import List

import httpx
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from config import settings
from database import get_db
from dependencies.auth import get_current_user
from services.resume_parser import parse_resume
from services.storage import get_storage
from services.audit import log_audit

router = APIRouter()

MAX_FILE_SIZE = 5 * 1024 * 1024
ACCEPTED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

_PREFILL_PROMPT = """Extract the following fields from the resume text and return a single JSON object.
Use empty string "" for any field you cannot find. Return key_skills as a JSON array of strings.

Fields:
- full_name
- email
- phone
- linkedin  (full URL preferred)
- location  (city + country/state)
- target_role  (most recent job title or stated objective)
- primary_skill  (the single most defining technical or professional skill, e.g. "Java", "Python", "Financial Modelling", "UX Design" — one short phrase, not a sentence)
- key_skills  (top 8-10 skills as a JSON array)
- summary  (2–3 sentence professional summary — write one if absent)

Return only the JSON object, no markdown fences, no explanation."""


async def _ai_prefill(resume_text: str) -> dict:
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    msg = await client.messages.create(
        model=settings.anthropic_evaluator_model,
        max_tokens=600,
        messages=[{"role": "user", "content": f"{_PREFILL_PROMPT}\n\nResume:\n{resume_text[:4000]}"}],
    )
    raw = msg.content[0].text.strip()
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)
    try:
        return json.loads(raw)
    except Exception:
        return {}


# ── Models ────────────────────────────────────────────────────────────────────

class ProfileBody(BaseModel):
    full_name: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    location: str = ""
    target_roles: List[str] = []
    primary_skill: str = ""
    key_skills: List[str] = []
    summary: str = ""


class FromProfileBody(BaseModel):
    job_description: str


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_profile(user_id: ObjectId) -> dict | None:
    db = get_db()
    return await db.user_profiles.find_one({"user_id": user_id})


def _serialize_profile(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    doc["user_id"] = str(doc["user_id"])
    return doc


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/account/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    profile = await _get_profile(user["_id"])
    if not profile:
        return None
    return _serialize_profile(profile)


@router.put("/account/profile")
async def save_profile(body: ProfileBody, user: dict = Depends(get_current_user)):
    db = get_db()
    now = datetime.utcnow()
    await db.user_profiles.update_one(
        {"user_id": user["_id"]},
        {"$set": {**body.model_dump(), "updated_at": now},
         "$setOnInsert": {"user_id": user["_id"], "resume_text": "", "resume_file_key": None, "created_at": now}},
        upsert=True,
    )
    profile = await _get_profile(user["_id"])
    log_audit(user, "profile.save", {"fields": list(body.model_dump().keys())})
    return _serialize_profile(profile)


@router.post("/account/profile/resume")
async def upload_profile_resume(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if file.content_type not in ACCEPTED_TYPES:
        raise HTTPException(400, "Only PDF and DOCX files are accepted.")
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(400, "File exceeds 5 MB limit.")

    try:
        parsed = parse_resume(file_bytes, file.filename)
    except Exception as exc:
        raise HTTPException(422, f"Failed to parse resume: {exc}")

    resume_text = parsed.get("raw_text", "")
    try:
        prefilled = await _ai_prefill(resume_text)
    except Exception:
        prefilled = {}  # AI extraction is best-effort; proceed without it

    # Persist file
    storage_key = None
    try:
        storage = get_storage()
        key = f"profile-resumes/{user['_id']}/{file.filename}"
        content_type = (
            "application/pdf" if file.filename.lower().endswith(".pdf")
            else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        await storage.save(key, file_bytes, content_type)
        storage_key = key
    except Exception:
        pass

    # Upsert profile with resume text
    db = get_db()
    now = datetime.utcnow()
    await db.user_profiles.update_one(
        {"user_id": user["_id"]},
        {
            "$set": {"resume_text": resume_text, "resume_file_key": storage_key, "updated_at": now},
            "$setOnInsert": {
                "user_id": user["_id"],
                "full_name": "", "email": "", "phone": "", "linkedin": "",
                "location": "", "target_roles": [], "primary_skill": "", "key_skills": [], "summary": "",
                "created_at": now,
            },
        },
        upsert=True,
    )

    return {"prefilled": prefilled, "resume_text": resume_text[:500]}


@router.post("/sessions/from-profile", status_code=201)
async def session_from_profile(
    body: FromProfileBody,
    user: dict = Depends(get_current_user),
):
    """Create a builder session pre-loaded from the user's account profile.

    Skips upload + profile + job steps — returns a session_id that can be
    passed straight to /builder/template.
    """
    profile = await _get_profile(user["_id"])
    if not profile:
        raise HTTPException(400, "No profile found. Please set up your profile first.")
    if not profile.get("resume_text"):
        raise HTTPException(400, "No resume found in your profile. Please upload one first.")

    db = get_db()
    result = await db.sessions.insert_one({
        "created_at": datetime.utcnow(),
        "resume_parsed": {"raw_text": profile["resume_text"], "filename": "profile-resume"},
        "resume_file_key": profile.get("resume_file_key"),
        "upload_instructions": "",
        "user_profile": {
            "full_name": profile.get("full_name", ""),
            "email": profile.get("email", ""),
            "phone": profile.get("phone", ""),
            "linkedin": profile.get("linkedin", ""),
            "location": profile.get("location", ""),
            "target_role": (profile.get("target_roles") or [""])[0],
            "preferred_tone": "Professional",
            "key_skills": profile.get("key_skills", []),
            "additional_notes": "",
        },
        "job_description": body.job_description,
        "selected_template_id": None,
        "sample_cv_text": None,
        "sample_cv_file_key": None,
        "locked_facts": [],
        "generated_resume": None,
        "output_files": {"docx_file_id": None, "pdf_file_id": None},
    })
    return {"session_id": str(result.inserted_id)}


@router.get("/account/stats")
async def get_account_stats(user: dict = Depends(get_current_user)):
    """Return the current user's usage counts."""
    db = get_db()
    uid = user["_id"]
    session_count, resume_count, alert_count, saved_job_count = await __import__("asyncio").gather(
        db.sessions.count_documents({"user_id": uid}),
        db.saved_resumes.count_documents({"user_id": uid}),
        db.job_alerts.count_documents({"user_id": uid}),
        db.saved_jobs.count_documents({"user_id": str(uid)}),
    )
    return {
        "session_count": session_count,
        "resume_count": resume_count,
        "alert_count": alert_count,
        "saved_job_count": saved_job_count,
        "tier": user.get("tier", "free"),
    }

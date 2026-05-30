"""Resume Library router — multi-resume storage for Plus/Pro subscribers.

GET    /api/account/resumes                          — list saved resumes (Plus+)
POST   /api/account/resumes/upload                   — upload a file (Plus+)
POST   /api/account/resumes/from-session             — save a tailored resume from a session (Plus+)
POST   /api/account/resumes/{id}/create-session      — create a builder session from a library resume
PATCH  /api/account/resumes/{id}                     — rename
DELETE /api/account/resumes/{id}                     — delete
GET    /api/account/resumes/{id}/download            — download as DOCX (or PDF)

Tier limits:
  Free  — feature locked (0 resumes)
  Plus  — 5 resumes max
  Pro   — unlimited
"""
from __future__ import annotations

import io
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import settings
from database import get_db
from dependencies.auth import get_current_user, require_feature
from services.resume_parser import parse_resume
from services.storage import get_storage
from services.file_generator import generate_docx
from services.audit import log_audit

router = APIRouter()

_LIMITS = {"free": 0, "plus": 5, "pro": None}  # None = unlimited
_ACCEPTED = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE = 5 * 1024 * 1024


def _check_limit(tier: str, current_count: int) -> None:
    limit = _LIMITS.get(tier)
    if limit is not None and current_count >= limit:
        raise HTTPException(
            403,
            f"{tier.capitalize()} plan allows up to {limit} saved resumes. "
            "Upgrade to Pro for unlimited.",
        )


def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    doc["user_id"] = str(doc["user_id"])
    return doc


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/account/resumes")
async def list_resumes(user: dict = Depends(require_feature("resume_library"))):
    db = get_db()
    cursor = db.saved_resumes.find({"user_id": user["_id"]}).sort("created_at", -1)
    docs = await cursor.to_list(100)
    return [_serialize(d) for d in docs]


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/account/resumes/upload", status_code=201)
async def upload_resume(
    file: UploadFile = File(...),
    name: str = Form(""),
    user: dict = Depends(require_feature("resume_library")),
):
    if file.content_type not in _ACCEPTED:
        raise HTTPException(400, "Only PDF and DOCX files are accepted.")
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(400, "File exceeds 5 MB limit.")

    db = get_db()
    count = await db.saved_resumes.count_documents({"user_id": user["_id"]})
    _check_limit(user.get("tier", "free"), count)

    try:
        parsed = parse_resume(file_bytes, file.filename)
    except Exception as exc:
        raise HTTPException(422, f"Could not parse file: {exc}")

    content_type = (
        "application/pdf"
        if (file.filename or "").lower().endswith(".pdf")
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    storage_key = None
    try:
        storage = get_storage()
        key = f"resume-library/{user['_id']}/{file.filename}"
        await storage.save(key, file_bytes, content_type)
        storage_key = key
    except Exception:
        pass

    display_name = name.strip() or (file.filename or "Uploaded Resume")
    now = datetime.utcnow()
    result = await db.saved_resumes.insert_one({
        "user_id": user["_id"],
        "name": display_name,
        "type": "uploaded",
        "file_key": storage_key,
        "file_name": file.filename,
        "content_type": content_type,
        "resume_data": None,
        "resume_text": parsed.get("raw_text", ""),
        "tailored_for_job": None,
        "tailored_for_employer": None,
        "created_at": now,
        "updated_at": now,
    })
    doc = await db.saved_resumes.find_one({"_id": result.inserted_id})
    log_audit(user, "resume_library.upload", {"name": display_name, "resume_id": str(result.inserted_id)})
    return _serialize(doc)


# ── Save from builder session ─────────────────────────────────────────────────

class FromSessionBody(BaseModel):
    session_id: str
    name: str
    job_title: Optional[str] = None
    employer_name: Optional[str] = None


@router.post("/account/resumes/from-session", status_code=201)
async def save_from_session(
    body: FromSessionBody,
    user: dict = Depends(require_feature("resume_library")),
):
    db = get_db()
    try:
        session = await db.sessions.find_one({"_id": ObjectId(body.session_id)})
    except Exception:
        session = None
    if not session:
        raise HTTPException(404, "Session not found.")
    if not session.get("generated_resume"):
        raise HTTPException(400, "No generated resume found in this session.")

    count = await db.saved_resumes.count_documents({"user_id": user["_id"]})
    _check_limit(user.get("tier", "free"), count)

    now = datetime.utcnow()
    result = await db.saved_resumes.insert_one({
        "user_id": user["_id"],
        "name": body.name.strip() or "Tailored Resume",
        "type": "tailored",
        "file_key": None,
        "file_name": None,
        "content_type": None,
        "resume_data": session["generated_resume"],
        "resume_text": (session.get("resume_parsed") or {}).get("raw_text", ""),
        "tailored_for_job": body.job_title,
        "tailored_for_employer": body.employer_name,
        "created_at": now,
        "updated_at": now,
    })
    doc = await db.saved_resumes.find_one({"_id": result.inserted_id})
    return _serialize(doc)


# ── Create builder session from library resume ───────────────────────────────

class CreateSessionBody(BaseModel):
    job_description: str = ""


@router.post("/account/resumes/{resume_id}/create-session", status_code=201)
async def create_session_from_library(
    resume_id: str,
    body: CreateSessionBody = CreateSessionBody(),
    user: dict = Depends(get_current_user),
):
    """Create a builder session pre-loaded from a saved library resume.

    Uses the stored resume_text so Step 2 (Profile) can AI-prefill fields.
    Job description is optional — if provided it pre-fills Step 3.
    """
    db = get_db()
    doc = await db.saved_resumes.find_one({"_id": ObjectId(resume_id), "user_id": user["_id"]})
    if not doc:
        raise HTTPException(404, "Resume not found.")

    resume_text = doc.get("resume_text") or ""

    # Self-heal: old library entries may have no resume_text — re-parse from stored file
    if not resume_text and doc.get("file_key"):
        try:
            from services.storage import get_storage
            from services.resume_parser import parse_resume as _parse
            storage = get_storage()
            file_bytes = await storage.load(doc["file_key"])
            parsed = _parse(file_bytes, doc.get("file_name", "resume"))
            resume_text = parsed.get("raw_text", "")
            if resume_text:
                await db.saved_resumes.update_one(
                    {"_id": ObjectId(resume_id)},
                    {"$set": {"resume_text": resume_text}},
                )
        except Exception:
            pass  # non-fatal — session still created, prefill falls back to user_profile

    # Pre-fill user_profile from the user's account profile (if it exists)
    from routers.account import _get_profile
    profile = await _get_profile(user["_id"])
    user_profile_data = None
    if profile:
        user_profile_data = {
            "full_name": profile.get("full_name", ""),
            "email": profile.get("email", ""),
            "phone": profile.get("phone", ""),
            "linkedin": profile.get("linkedin", ""),
            "location": profile.get("location", ""),
            "target_role": (profile.get("target_roles") or [""])[0],
            "preferred_tone": "Professional",
            "key_skills": profile.get("key_skills", []),
            "additional_notes": "",
        }

    result = await db.sessions.insert_one({
        "created_at": datetime.utcnow(),
        "resume_parsed": {
            "raw_text": resume_text,
            "filename": doc.get("file_name") or "library-resume",
        },
        "resume_file_key": doc.get("file_key"),
        "upload_instructions": "",
        "user_profile": user_profile_data,
        "job_description": body.job_description or None,
        "selected_template_id": None,
        "sample_cv_text": None,
        "sample_cv_file_key": None,
        "locked_facts": [],
        "generated_resume": None,
        "output_files": {"docx_file_id": None, "pdf_file_id": None},
    })
    return {"session_id": str(result.inserted_id)}


# ── Rename ────────────────────────────────────────────────────────────────────

class RenameBody(BaseModel):
    name: str


@router.patch("/account/resumes/{resume_id}")
async def rename_resume(
    resume_id: str,
    body: RenameBody,
    user: dict = Depends(get_current_user),
):
    if not body.name.strip():
        raise HTTPException(400, "Name cannot be empty.")
    db = get_db()
    result = await db.saved_resumes.update_one(
        {"_id": ObjectId(resume_id), "user_id": user["_id"]},
        {"$set": {"name": body.name.strip(), "updated_at": datetime.utcnow()}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Resume not found.")
    doc = await db.saved_resumes.find_one({"_id": ObjectId(resume_id)})
    return _serialize(doc)


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/account/resumes/{resume_id}", status_code=204)
async def delete_resume(resume_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    doc = await db.saved_resumes.find_one(
        {"_id": ObjectId(resume_id), "user_id": user["_id"]}
    )
    if not doc:
        raise HTTPException(404, "Resume not found.")

    # Clean up stored file if present
    if doc.get("file_key"):
        try:
            storage = get_storage()
            await storage.delete(doc["file_key"])
        except Exception:
            pass

    await db.saved_resumes.delete_one({"_id": ObjectId(resume_id)})


# ── Download ──────────────────────────────────────────────────────────────────

@router.get("/account/resumes/{resume_id}/download")
async def download_resume(resume_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    doc = await db.saved_resumes.find_one(
        {"_id": ObjectId(resume_id), "user_id": user["_id"]}
    )
    if not doc:
        raise HTTPException(404, "Resume not found.")

    if doc["type"] == "uploaded" and doc.get("file_key"):
        try:
            storage = get_storage()
            file_bytes = await storage.load(doc["file_key"])
        except Exception:
            raise HTTPException(500, "File could not be retrieved from storage.")
        filename = doc.get("file_name") or "resume.pdf"
        return StreamingResponse(
            io.BytesIO(file_bytes),
            media_type=doc.get("content_type") or "application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    if doc["type"] == "tailored" and doc.get("resume_data"):
        try:
            # Pass empty string — falls back to generate_clean_docx (no template)
            docx_bytes = generate_docx(doc["resume_data"], "")
        except Exception as exc:
            raise HTTPException(500, f"Failed to generate DOCX: {exc}")

        safe_name = (
            doc.get("name", "resume")
            .lower()
            .replace(" ", "_")
            .replace("/", "-")[:60]
        )
        return StreamingResponse(
            io.BytesIO(docx_bytes),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.docx"'},
        )

    raise HTTPException(400, "Resume has no downloadable content.")

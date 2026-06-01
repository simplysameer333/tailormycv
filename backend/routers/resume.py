"""Resume upload router.

Handles two upload endpoints:
  POST /api/resume/upload         — candidate's own resume (creates the session)
  POST /api/resume/sample-format  — a sample CV used only as a formatting reference

Both endpoints:
  1. Validate file type and size
  2. Parse raw text via resume_parser (pdfplumber / python-docx)
  3. Persist the original file bytes via the configured storage backend
     (local filesystem or S3 — controlled by STORAGE_BACKEND in .env)
  4. Record the storage key in the session document so the file can be
     retrieved or deleted later

Storage keys follow the convention:
    resumes/<session_id>/<original_filename>
    samples/<session_id>/<original_filename>
"""
import logging
import traceback
import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from bson import ObjectId
from datetime import datetime
from database import get_db
from dependencies.auth import get_optional_user
from services.resume_parser import parse_resume
from services.storage import get_storage
from services.resume_checker_service import check_resume as _check_resume, extract_contact_regex
from services.email_service import send_error_alert
from config import settings

router = APIRouter()
logger = logging.getLogger("tailormycv")

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
ACCEPTED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _content_type(filename: str) -> str:
    return "application/pdf" if filename.lower().endswith(".pdf") else \
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


async def _validate_and_parse(
    file: UploadFile, *, label: str = "resume", require_text: bool = False
) -> tuple[dict, bytes]:
    """Validate content-type and size, parse the file. Raises HTTPException on failure."""
    if file.content_type not in ACCEPTED_TYPES:
        raise HTTPException(400, "Only PDF and DOCX files are accepted.")
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(400, "File exceeds 5 MB limit.")
    try:
        parsed = parse_resume(file_bytes, file.filename)
    except Exception as exc:
        raise HTTPException(422, f"Failed to parse {label}: {exc}")
    if require_text and not parsed.get("raw_text", "").strip():
        raise HTTPException(422, "Could not extract text from this file. Try a plain PDF or DOCX.")
    return parsed, file_bytes


@router.post("/resume/upload")
async def upload_resume(
    file: UploadFile = File(None),
    instructions: str = Form(""),
    linkedin_text: str = Form(""),
    user: dict | None = Depends(get_optional_user),
):
    """Upload a resume and/or provide LinkedIn profile text. Creates a new session.

    At least one of *file* (PDF/DOCX) or *linkedin_text* must be supplied.
    When both are provided the resume content is used as the primary source and
    the LinkedIn text is appended as supplementary context.

    Optional *instructions* lets the user give the AI extra direction.
    """
    has_file = file is not None and file.filename
    has_linkedin = bool(linkedin_text.strip())

    if not has_file and not has_linkedin:
        raise HTTPException(
            400, "Please upload a resume file or provide a LinkedIn profile."
        )

    parsed: dict = {"raw_text": "", "filename": ""}
    storage_key: str | None = None
    file_bytes: bytes | None = None

    # ── Parse resume file ──────────────────────────────────────────────────────
    if has_file:
        parsed, file_bytes = await _validate_and_parse(file)

    # ── Merge LinkedIn text ────────────────────────────────────────────────────
    # Resume takes precedence; LinkedIn is appended as supplementary context.
    if has_linkedin:
        linkedin_clean = linkedin_text.strip()
        if parsed["raw_text"]:
            parsed["raw_text"] = (
                parsed["raw_text"]
                + "\n\n---\n[Additional context from LinkedIn profile]\n"
                + linkedin_clean
            )
        else:
            parsed = {"raw_text": linkedin_clean, "filename": "linkedin_profile.txt"}

    # ── Create session ─────────────────────────────────────────────────────────
    db = get_db()
    result = await db.sessions.insert_one({
        "user_id": user["_id"] if user else None,
        "created_at": datetime.utcnow(),
        "resume_parsed": parsed,
        "resume_file_key": None,
        "upload_instructions": instructions.strip(),
        "linkedin_imported": has_linkedin,
        "user_profile": None,
        "job_description": None,
        "selected_template_id": None,
        "sample_cv_text": None,
        "sample_cv_file_key": None,
        "locked_facts": [],
        "generated_resume": None,
        "output_files": {"docx_file_id": None, "pdf_file_id": None},
    })
    session_id = str(result.inserted_id)

    # ── Persist original file (non-fatal) ──────────────────────────────────────
    if has_file and file_bytes:
        storage_key = f"resumes/{session_id}/{file.filename}"
        try:
            storage = get_storage()
            await storage.save(storage_key, file_bytes, _content_type(file.filename))
            await db.sessions.update_one(
                {"_id": ObjectId(session_id)},
                {"$set": {"resume_file_key": storage_key}},
            )
        except Exception as exc:
            logger.warning("Failed to persist resume file to storage: %s", exc)

    return {"session_id": session_id, "parsed": parsed}


@router.post("/resume/sample-format")
async def upload_sample_cv(
    session_id: str,
    file: UploadFile = File(...),
    user: dict | None = Depends(get_optional_user),
):
    """Upload a sample CV to use as a formatting reference. Pro only.

    The AI generator will mirror the structure and section order of this CV
    when writing the tailored resume. Content is never copied — only layout
    and organisation are used as guidance.

    The original file is stored via the configured storage backend.
    """
    from services.tier_config_service import has_feature as _hf
    if not _hf((user or {}).get("tier", "free"), "sample_cv"):
        raise HTTPException(403, "Sample CV reference is not available on your plan. Visit /settings/plan to upgrade.")

    parsed, file_bytes = await _validate_and_parse(file, label="sample CV")

    db = get_db()
    result = await db.sessions.find_one({"_id": ObjectId(session_id)}, {"_id": 1})
    if not result:
        raise HTTPException(404, "Session not found.")

    # Persist original file.
    storage_key = f"samples/{session_id}/{file.filename}"
    try:
        storage = get_storage()
        await storage.save(storage_key, file_bytes, _content_type(file.filename))
    except Exception as exc:
        logger.warning("Failed to persist sample CV to storage: %s", exc)
        storage_key = None

    await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {
            "sample_cv_text": parsed["raw_text"],
            "sample_cv_file_key": storage_key,
        }},
    )

    return {"filename": file.filename, "characters": len(parsed["raw_text"])}


@router.post("/resume/check")
async def check_resume_quality(
    file: UploadFile = File(...),
    user: dict | None = Depends(get_optional_user),
):
    """Analyse a CV and return a structured quality report.

    No authentication required — available to all users including anonymous.
    Returns 7-category breakdown with scores and improvement suggestions.
    Usage is tracked in the cv_checks MongoDB collection.
    """
    parsed, _ = await _validate_and_parse(file, label="CV", require_text=True)

    try:
        result = await _check_resume(parsed["raw_text"], settings.anthropic_api_key)
    except ValueError as exc:
        await send_error_alert("POST", "/api/resume/check", exc, traceback.format_exc())
        raise HTTPException(502, str(exc))
    except Exception as exc:
        logger.exception("[cv_score] Unexpected error")
        await send_error_alert("POST", "/api/resume/check", exc, traceback.format_exc())
        raise HTTPException(502, "CV analysis failed. Please try again.")

    # ── Persist full result with a shareable UUID ──────────────────────────────
    result_id = str(uuid.uuid4())
    try:
        file_ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename else "unknown"
        db = get_db()
        await db.cv_check_results.insert_one({
            "_id":           result_id,
            "user_id":       user["_id"] if user else None,
            "created_at":    datetime.utcnow(),
            "overall_score": result.get("overall_score", 0),
            "file_ext":      file_ext,
            "result":        result,   # full JSON result for permalink page
            "categories": [
                {"key": c.get("key"), "score": c.get("score", 0), "status": c.get("status")}
                for c in result.get("categories", [])
            ],
        })
        # also write lightweight row to cv_checks for admin stats
        await db.cv_checks.insert_one({
            "result_id":     result_id,
            "user_id":       user["_id"] if user else None,
            "created_at":    datetime.utcnow(),
            "overall_score": result.get("overall_score", 0),
            "file_ext":      file_ext,
            "categories": [
                {"key": c.get("key"), "score": c.get("score", 0), "status": c.get("status")}
                for c in result.get("categories", [])
            ],
        })
    except Exception as exc:
        logger.warning("[cv_score] Failed to persist result: %s", exc)
        result_id = None

    extracted_contact = extract_contact_regex(parsed["raw_text"])
    return {**result, "result_id": result_id, "extracted_profile": extracted_contact}


@router.get("/resume/check/{result_id}")
async def get_check_result(result_id: str):
    """Load a previously saved CV Score result by its unique ID."""
    db = get_db()
    doc = await db.cv_check_results.find_one({"_id": result_id})
    if not doc:
        raise HTTPException(404, "Result not found or has expired.")
    return doc["result"] | {"result_id": result_id}

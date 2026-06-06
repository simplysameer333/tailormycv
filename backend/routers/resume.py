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
import hashlib
import logging
import traceback
import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from bson import ObjectId
from datetime import datetime, timedelta
from database import get_db
from dependencies.auth import get_optional_user
from services.resume_parser import parse_resume
from services.storage import get_storage
import asyncio
from services.resume_checker_service import (
    check_resume as _check_resume,
    extract_resume_for_preview,
    extract_contact_regex,
    check_grammar,
    extract_weak_categories,
)
from services.cv_refinement_service import refine_cv_text
from services.email_service import send_error_alert
from services.audit import log_audit
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

    text_hash = hashlib.sha256(parsed["raw_text"][:8000].encode()).hexdigest()
    db = get_db()
    cached = await db.cv_check_results.find_one(
        {"text_hash": text_hash, "created_at": {"$gt": datetime.utcnow() - timedelta(days=7)}},
        sort=[("created_at", -1)],
    )
    if cached and cached.get("result"):
        logger.info("[cv_score] Cache hit for hash %s…", text_hash[:8])
        # Issue a new permalink UUID so the user gets a fresh shareable link
        new_id = str(uuid.uuid4())
        full_profile_c = extract_contact_regex(parsed["raw_text"])
        try:
            await db.cv_check_results.insert_one({
                "_id": new_id, "user_id": user["_id"] if user else None,
                "created_at": datetime.utcnow(), "text_hash": text_hash,
                "overall_score": cached["overall_score"], "file_ext": cached.get("file_ext", ""),
                "result": cached["result"],
                "raw_text": parsed["raw_text"],
                "extracted_profile": full_profile_c,
                "categories": cached.get("categories", []),
            })
        except Exception:
            new_id = cached["_id"]
        return {**cached["result"], "result_id": new_id, "extracted_profile": full_profile_c, "cached": True}

    # ── Step 1: Quality check — the gate that decides how much more work is needed ──
    try:
        result = await _check_resume(parsed["raw_text"], settings.anthropic_api_key)
    except Exception as exc:
        logger.exception("[cv_score] Quality check failed")
        await send_error_alert("POST", "/api/resume/check", exc, traceback.format_exc())
        raise HTTPException(502, "CV analysis failed. Please try again.")

    initial_score = int(result.get("overall_score", 0) or 0)
    lazy_threshold = settings.cv_score_lazy_threshold
    ran_grammar = False
    refine_cycles = 0

    # ── Step 2: Ralph Loop — refine if score is below the lazy threshold ──────
    # Each cycle applies targeted fixes from weak categories and re-scores. Exits
    # when score >= threshold, plateau is detected, or max cycles is reached.
    # We always return best_result (highest-scoring cycle), never just the last.
    if lazy_threshold > 0 and initial_score < lazy_threshold:
        best_result = result
        best_score = initial_score
        prev_score = initial_score

        for _cycle in range(settings.cv_score_max_refine_cycles):
            issues = extract_weak_categories(best_result)
            if not issues:
                break
            try:
                refined_text = await refine_cv_text(
                    parsed["raw_text"], issues, lazy_threshold, settings.anthropic_api_key
                )
                new_result = await _check_resume(refined_text, settings.anthropic_api_key)
                refine_cycles += 1
            except Exception as exc:
                logger.warning("[cv_score] Refinement cycle %d failed: %s", _cycle + 1, exc)
                break

            new_score = int(new_result.get("overall_score", 0) or 0)
            if new_score > best_score:
                best_result = new_result
                best_score = new_score

            gain = new_score - prev_score
            logger.info(
                "[cv_score] Refinement cycle %d: score %d → %d (gain=%d, best=%d)",
                _cycle + 1, prev_score, new_score, gain, best_score,
            )
            if gain < settings.cv_score_plateau_margin:
                break
            if best_score >= lazy_threshold:
                break
            prev_score = new_score

        result = best_result

    # ── Step 3: Extraction + grammar — run concurrently; grammar only when needed ──
    # Extraction always runs (needed for template preview display).
    # Grammar only runs when score is below threshold — high-scoring CVs skip it.
    current_score = int(result.get("overall_score", 0) or 0)
    run_grammar = lazy_threshold == 0 or current_score < lazy_threshold

    if run_grammar:
        extracted_llm_raw, grammar_raw = await asyncio.gather(
            extract_resume_for_preview(parsed["raw_text"], settings.anthropic_api_key),
            check_grammar(parsed["raw_text"], settings.anthropic_api_key),
            return_exceptions=True,
        )
        ran_grammar = True
    else:
        extracted_llm_raw = await asyncio.gather(
            extract_resume_for_preview(parsed["raw_text"], settings.anthropic_api_key),
            return_exceptions=True,
        )
        extracted_llm_raw = extracted_llm_raw[0]
        grammar_raw = None

    extracted_llm = None if isinstance(extracted_llm_raw, Exception) else extracted_llm_raw
    if isinstance(extracted_llm_raw, Exception):
        logger.warning("[cv_score] LLM extraction failed, using regex fallback: %s", extracted_llm_raw)

    # Grammar & spelling is best-effort — append as extra category when it succeeds.
    grammar = grammar_raw
    if ran_grammar and not isinstance(grammar, Exception) and isinstance(grammar, dict) and grammar.get("key"):
        result.setdefault("categories", []).append(grammar)
        try:
            base = float(result.get("overall_score", 0) or 0)
            g = float(grammar.get("score", base))
            _GRAMMAR_WEIGHT = 0.15
            result["overall_score"] = round((1 - _GRAMMAR_WEIGHT) * base + _GRAMMAR_WEIGHT * g)
        except (TypeError, ValueError):
            pass
    elif ran_grammar and isinstance(grammar, Exception):
        logger.warning("[cv_score] Grammar check failed: %s", grammar)

    # Build the extracted profile: LLM extraction primary, regex as field-level
    # fallback for anything the LLM left empty (or if the LLM call failed entirely).
    regex_profile = extract_contact_regex(parsed["raw_text"])
    llm = extracted_llm or {}
    extracted_profile = {
        "name":           llm.get("name")           or regex_profile.get("name", ""),
        "title":          llm.get("title")          or regex_profile.get("title", ""),
        "email":          llm.get("email")          or regex_profile.get("email", ""),
        "phone":          llm.get("phone")          or regex_profile.get("phone", ""),
        "location":       llm.get("location")       or regex_profile.get("location", ""),
        "linkedin":       llm.get("linkedin")       or regex_profile.get("linkedin", ""),
        "summary":        llm.get("summary")        or regex_profile.get("summary", ""),
        "skills":         llm.get("skills")         or regex_profile.get("skills", []),
        "experience":     llm.get("experience")     or regex_profile.get("experience", []),
        "education":      llm.get("education")       or regex_profile.get("education", []),
        "extra_sections": llm.get("extra_sections") or regex_profile.get("extra_sections", []),
    }

    # ── Persist full result with a shareable UUID ──────────────────────────────
    result_id = str(uuid.uuid4())
    try:
        file_ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename else "unknown"
        await db.cv_check_results.insert_one({
            "_id":           result_id,
            "user_id":       user["_id"] if user else None,
            "created_at":    datetime.utcnow(),
            "text_hash":     text_hash,   # enables cache lookup for same CV
            "overall_score": result.get("overall_score", 0),
            "file_ext":      file_ext,
            "result":        result,      # full JSON result for permalink page
            "raw_text":      parsed["raw_text"],   # stored so profile can be re-extracted later
            "extracted_profile": extracted_profile,
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

    # Audit: 1 quality check + refine_cycles×2 (refine+re-score) + 1 extraction + grammar
    llm_calls = 1 + refine_cycles * 2 + 1 + (1 if ran_grammar else 0)
    if user:
        log_audit(user, "resume.cv_score", {
            "result_id": result_id,
            "overall_score": result.get("overall_score", 0),
            "file_ext": (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename else "unknown",
            "llm_calls": llm_calls,
            "refine_cycles": refine_cycles,
        })

    return {**result, "result_id": result_id, "extracted_profile": extracted_profile}


@router.get("/resume/check/{result_id}")
async def get_check_result(result_id: str):
    """Load a previously saved CV Score result by its unique ID."""
    db = get_db()
    doc = await db.cv_check_results.find_one({"_id": result_id})
    if not doc:
        raise HTTPException(404, "Result not found or has expired.")

    # Always return a fully structured extracted_profile.
    # Old results lack experience/skills/education — re-extract from raw_text when available.
    extracted = doc.get("extracted_profile") or {}
    raw_text  = doc.get("raw_text", "")
    if raw_text and not extracted.get("experience"):
        extracted = extract_contact_regex(raw_text)  # extract_full_profile alias

    return doc["result"] | {"result_id": result_id, "extracted_profile": extracted}

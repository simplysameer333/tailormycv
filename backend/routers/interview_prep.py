"""Interview prep router — generate and retrieve interview questions for a session."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from bson import ObjectId
from database import get_db
from dependencies.auth import get_optional_user

router = APIRouter()
logger = logging.getLogger("tailormycv")


class StandaloneInterviewPrepRequest(BaseModel):
    resume_text: str
    job_description: str


@router.post("/sessions/{session_id}/interview-prep")
async def generate_interview_prep_for_session(
    session_id: str,
    user: dict | None = Depends(get_optional_user),
):
    """Generate the 15 top interview questions for this session.

    Fixed mix: 10 Technical, 2 Behavioral, 2 Situational, 1 Culture Fit.
    Requires a session with a parsed resume + job description.
    Result is cached on the session and returned on repeat calls.
    """
    db = get_db()
    session = await db.sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(404, "Session not found.")

    cached = session.get("interview_prep")
    if cached:
        return cached

    resume_text = (session.get("resume_parsed") or {}).get("raw_text", "")
    job_description = session.get("job_description") or ""

    if not resume_text:
        raise HTTPException(422, "No resume found in session.")
    if not job_description.strip():
        raise HTTPException(422, "No job description in session.")

    try:
        from services.interview_prep_service import generate_interview_prep
        result = await generate_interview_prep(resume_text, job_description)
        await db.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"interview_prep": result}},
        )
        return result
    except Exception as exc:
        logger.exception("[interview_prep] Failed for session %s: %s", session_id, exc)
        raise HTTPException(500, f"Interview prep generation failed: {exc}")


@router.get("/sessions/{session_id}/interview-prep")
async def get_interview_prep_for_session(session_id: str):
    """Retrieve a previously generated interview prep for this session."""
    db = get_db()
    session = await db.sessions.find_one(
        {"_id": ObjectId(session_id)},
        {"interview_prep": 1},
    )
    if not session:
        raise HTTPException(404, "Session not found.")
    prep = session.get("interview_prep")
    if not prep:
        raise HTTPException(404, "No interview prep generated yet.")
    return prep


@router.post("/interview-prep/generate")
async def generate_interview_prep_standalone(
    body: StandaloneInterviewPrepRequest,
    user: dict | None = Depends(get_optional_user),
):
    """Standalone endpoint — generate interview questions from raw resume + JD.

    No session required. Suitable for the dedicated Interview Prep page.
    """
    if not body.resume_text.strip():
        raise HTTPException(422, "Resume text is required.")
    if not body.job_description.strip():
        raise HTTPException(422, "Job description is required.")

    try:
        from services.interview_prep_service import generate_interview_prep
        return await generate_interview_prep(body.resume_text, body.job_description)
    except Exception as exc:
        logger.exception("[interview_prep_standalone] Failed: %s", exc)
        raise HTTPException(500, f"Interview prep generation failed: {exc}")

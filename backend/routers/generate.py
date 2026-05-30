"""Generate router — runs the profession-aware evaluator-optimizer pipeline.

Cost controls
-------------
- Evaluator flags (ANTHROPIC/OPENAI/GOOGLE_EVALUATOR_ENABLED) gate which evaluators run.
- PASS_THRESHOLD (default 50) determines when the loop exits early.
- MAX_EVAL_CYCLES caps the number of generator-evaluator loops per request.
- MAX_AI_CALLS_PER_SESSION is a hard per-session cap tracked in MongoDB. Once
  hit, the endpoint returns 429 until the session is reset.

Fact-locking
------------
- session.locked_facts is a list of strings the user has pinned.
- Passed through PipelineState and injected into the generator system prompt.
- The generator is instructed never to modify or remove locked facts.

Job analysis
------------
- JobAnalyzerAgent runs once before the pipeline loop to extract the top-N
  skills from the job description that the candidate can credibly claim.
- N is driven by SKILL_EXTRACTION_COUNT in .env (maps to subscription tier).
- The extracted skills are passed to every generator cycle as prioritisation hints.
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from bson import ObjectId
from pydantic import BaseModel
from typing import Optional
from database import get_db
from config import settings
from dependencies.auth import get_optional_user
from services.pipeline import pipeline, generator
from services.pipeline.agents.job_analyzer import JobAnalyzerAgent
from services.profession_service import resolve_profession_for_role
from services.email_service import send_quality_alert

# Key skills extracted per tier — aligns with PricingTiers feature list
_TIER_SKILL_COUNT = {"free": 3, "plus": 5, "pro": 10}

router = APIRouter()
_job_analyzer = JobAnalyzerAgent()

# Evaluators each tier is entitled to — must still have API keys configured.
# Free: Anthropic only (1 evaluator, lowest cost)
# Plus: Anthropic + OpenAI (2 evaluators, richer feedback)
# Pro:  Anthropic + OpenAI + Google (3 evaluators, highest quality)
_TIER_EVALUATORS: dict[str, set[str]] = {
    "free": {"anthropic"},
    "plus": {"anthropic", "openai"},
    "pro":  {"anthropic", "openai", "google"},
}


def _enabled_evaluators_for_tier(user_tier: str) -> dict[str, bool]:
    """Return per-tier evaluator flags, respecting global env flags + API key presence."""
    allowed = _TIER_EVALUATORS.get(user_tier, {"anthropic"})
    return {
        "anthropic": "anthropic" in allowed and settings.anthropic_evaluator_enabled,
        "openai":    "openai"    in allowed and settings.openai_evaluator_enabled and bool(settings.openai_api_key),
        "google":    "google"    in allowed and settings.google_evaluator_enabled and bool(settings.google_api_key),
    }


class GenerateBody(BaseModel):
    section: Optional[str] = None
    additional_instructions: Optional[str] = None


async def _resolve_profession(db, target_role: str) -> dict:
    """Resolve profession config from DB; fall back to featured profession, then generic."""
    config = await resolve_profession_for_role(db, target_role)
    if config.get("slug") == "generic" and settings.featured_profession_slug:
        from services.profession_service import get_profession_by_slug
        featured = await get_profession_by_slug(db, settings.featured_profession_slug)
        if featured:
            return featured
    return config


async def _check_cost_limit(db, session_id: str, expected_calls: int) -> int:
    """Return current ai_call_count. Raise 429 if adding expected_calls would exceed limit."""
    if settings.max_ai_calls_per_session <= 0:
        return 0
    session = await db.sessions.find_one({"_id": ObjectId(session_id)}, {"ai_call_count": 1})
    current = (session or {}).get("ai_call_count", 0)
    if current + expected_calls > settings.max_ai_calls_per_session:
        raise HTTPException(
            429,
            f"Session AI call limit reached ({current}/{settings.max_ai_calls_per_session}). "
            "Start a new session to continue."
        )
    return current


async def _increment_call_count(db, session_id: str, count: int):
    """Add count to the session's ai_call_count field."""
    await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$inc": {"ai_call_count": count}},
    )


@router.post("/generate")
async def generate(
    session_id: str,
    body: GenerateBody = GenerateBody(),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    user: dict | None = Depends(get_optional_user),
):
    db = get_db()
    session = await db.sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(404, "Session not found.")

    resume_text = (session.get("resume_parsed") or {}).get("raw_text", "")
    user_profile = session.get("user_profile") or {}
    job_description = session.get("job_description") or ""
    tone = user_profile.get("preferred_tone", "Professional")
    existing = session.get("generated_resume")
    target_role = user_profile.get("target_role", "")
    locked_facts = session.get("locked_facts") or []
    sample_cv_text: str | None = session.get("sample_cv_text") or None

    # Merge stored upload-time instructions + request-time additional_instructions into profile.
    extra_parts = []
    upload_instructions = (session.get("upload_instructions") or "").strip()
    if upload_instructions:
        extra_parts.append(f"[User instructions]: {upload_instructions}")
    request_instructions = (body.additional_instructions or "").strip()
    if request_instructions:
        extra_parts.append(f"[User instructions]: {request_instructions}")
    if extra_parts:
        existing_notes = user_profile.get("additional_notes", "")
        merged = "\n\n".join(filter(None, [existing_notes] + extra_parts))
        user_profile = {**user_profile, "additional_notes": merged}

    if not resume_text:
        raise HTTPException(422, "No parsed resume found in session.")
    if not job_description:
        raise HTTPException(422, "No job description found in session.")

    profession_config = await _resolve_profession(db, target_role)

    # ── Resolve user tier for per-tier feature enforcement ────────────────────
    user_tier = (user or {}).get("tier", "free")

    # ── Job analysis — runs once, outside the eval loop ──────────────────────
    # Skill count scales with tier: Free=3, Plus=5, Pro=10
    n_skills = _TIER_SKILL_COUNT.get(user_tier, settings.skill_extraction_count)
    key_skills: list = await _job_analyzer.run(
        resume_text=resume_text,
        user_profile=user_profile,
        job_description=job_description,
        n=n_skills,
    )
    # Persist key_skills on the session so export can bold them
    await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"key_skills": key_skills}},
    )

    # ── Section-only regeneration (Pro only) ─────────────────────────────────
    if body.section:
        if user_tier not in ("pro",):
            raise HTTPException(
                403,
                "Section-level regeneration is a Pro feature. Upgrade your plan to unlock it.",
            )
        await _check_cost_limit(db, session_id, 1)
        try:
            result = await generator.run_section(
                resume_text=resume_text,
                user_profile=user_profile,
                job_description=job_description,
                tone=tone,
                section=body.section,
                existing_resume=existing,
                profession_config=profession_config,
                locked_facts=locked_facts,
                key_skills=key_skills,
                sample_cv_text=sample_cv_text,
            )
        except Exception as exc:
            raise HTTPException(500, f"Section regeneration failed: {exc}")
        await _increment_call_count(db, session_id, 1)
        await db.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"generated_resume": result}},
        )
        return result

    # ── Full evaluator-optimizer pipeline ─────────────────────────────────────
    # Evaluator selection is tier-aware: Free=1, Plus=2, Pro=3 (subject to API key config).
    enabled_evaluators = _enabled_evaluators_for_tier(user_tier)
    active_evaluator_count = sum(enabled_evaluators.values())
    calls_per_cycle = 1 + max(active_evaluator_count, 1)
    estimated_calls = 1 + calls_per_cycle * settings.max_eval_cycles  # +1 for job analyzer
    await _check_cost_limit(db, session_id, estimated_calls)

    initial_state = {
        "resume_text": resume_text,
        "user_profile": user_profile,
        "job_description": job_description,
        "tone": tone,
        "profession_config": profession_config,
        "locked_facts": locked_facts,
        "key_skills": key_skills,
        "sample_cv_text": sample_cv_text,
        "enabled_evaluators": enabled_evaluators,
        "cycle": 0,
        "feedback": None,
        "resume_json": None,
        "eval_results": [],
        "eval_history": [],
        "all_passed": False,
        "min_score": 0,
    }

    try:
        final_state = await pipeline.ainvoke(initial_state)
    except Exception as exc:
        raise HTTPException(500, f"Pipeline failed: {exc}")

    # Actual calls used: 1 job-analyzer + (generator + evaluators) * completed cycles
    actual_calls = 1 + (1 + active_evaluator_count) * final_state["cycle"]
    await _increment_call_count(db, session_id, actual_calls)

    await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {
            "generated_resume": final_state["resume_json"],
            "eval_cycles": final_state["cycle"],
            "eval_history": final_state["eval_history"],
            "key_skills": key_skills,
            "profession_slug": profession_config.get("slug", "generic"),
        }},
    )

    if not final_state["all_passed"]:
        alert_payload = {
            "min_score": final_state["min_score"],
            "all_passed": False,
            "evaluator_results": final_state["eval_results"],
            "feedback_prompt": "",
        }
        background_tasks.add_task(
            send_quality_alert, session_id, alert_payload, final_state["resume_json"]
        )
        await db.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"quality_alert_sent": True}},
        )

    return {
        "resume": final_state["resume_json"],
        "eval_summary": {
            "cycles": final_state["cycle"],
            "all_passed": final_state["all_passed"],
            "min_score": final_state["min_score"],
            "pass_threshold": settings.pass_threshold,
            "evaluator_results": final_state["eval_results"],
            "profession": profession_config.get("display_name", "General"),
            "key_skills": key_skills,
        },
    }


@router.put("/sessions/{session_id}/resume")
async def save_resume(session_id: str, body: dict):
    """Sync a client-side resume back into the session (used when preview loads from localStorage)."""
    db = get_db()
    result = await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"generated_resume": body}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Session not found.")
    return {"ok": True}


@router.patch("/sessions/{session_id}/template")
async def set_session_template(session_id: str, body: dict):
    """Attach a template to the session so export can apply it.

    Body: {"template_id": "<mongo ObjectId string>"}
    """
    template_id = body.get("template_id", "")
    db = get_db()
    result = await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"selected_template_id": template_id}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Session not found.")
    return {"selected_template_id": template_id}


@router.put("/sessions/{session_id}/locked-facts")
async def set_locked_facts(
    session_id: str,
    body: dict,
    user: dict | None = Depends(get_optional_user),
):
    """Replace the session's locked_facts list. Pro only.

    Body: {"locked_facts": ["Company: Google", "Degree: BSc Computer Science"]}
    Locked facts are injected into the generator system prompt on the next
    generate call. The generator is instructed never to modify or remove them.
    """
    user_tier = (user or {}).get("tier", "free")
    if user_tier not in ("pro",):
        raise HTTPException(403, "Locked Facts is a Pro feature. Upgrade your plan to unlock it.")

    locked = body.get("locked_facts", [])
    if not isinstance(locked, list):
        raise HTTPException(422, "locked_facts must be a list of strings.")
    db = get_db()
    result = await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"locked_facts": locked}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Session not found.")
    return {"locked_facts": locked}

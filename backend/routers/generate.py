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
import asyncio
import hashlib
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from bson import ObjectId
from pydantic import BaseModel
from typing import Optional
from database import get_db
from config import settings
from dependencies.auth import get_optional_user
from services.audit import log_audit
from services.pipeline import pipeline, generator
from services.pipeline.agents.job_analyzer import JobAnalyzerAgent
from services.resume_checker_service import validate_resume_layout

# Maps template key → number of A4 pages the template is designed for.
# Used to give the LLM a hard content-length constraint during generation.
_TEMPLATE_PAGES: dict[str, int] = {
    "Cambridge":   1, "Swift":      1, "Catalyst":  1, "Canvas":    1,
    "TechModern":  1, "SalesImpact":1,
    "Horizon":     2, "Prestige":   2, "Admiral":   2, "Jade":      2,
    "Prism":       2, "Vivid":      2, "Chronicle": 2, "Summit":    2,
    "Symmetry":    2, "Scholar":    2, "Luxe":      2, "Pulse":     2,
    "HexagonPro":  2, "Healthcare": 2,
}
from services.profession_service import resolve_profession_for_role
from services.email_service import send_quality_alert, send_error_alert

router = APIRouter()
logger = logging.getLogger("tailormycv")
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


async def _check_cost_limit(db, session_id: str) -> int:
    """Raise 429 if this session has already reached its AI call limit.

    Checks current usage, not projected usage — allows the first generation
    to always complete regardless of tier/evaluator count.
    """
    if settings.max_ai_calls_per_session <= 0:
        return 0
    session = await db.sessions.find_one({"_id": ObjectId(session_id)}, {"ai_call_count": 1})
    current = (session or {}).get("ai_call_count", 0)
    if current >= settings.max_ai_calls_per_session:
        logger.warning(
            "[generate] Session %s at AI call limit: used=%d limit=%d",
            session_id, current, settings.max_ai_calls_per_session,
        )
        import traceback
        await send_error_alert(
            "POST", "/api/generate",
            Exception(f"Session {session_id} at AI call limit: used={current} limit={settings.max_ai_calls_per_session}"),
            traceback.format_stack()[-1],
        )
        raise HTTPException(
            429,
            "Resume generation limit reached for this session. "
            "Please start a new session to continue."
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

    if user:
        log_audit(user, "resume.generate", {
            "session_id": session_id,
            "template": session.get("selected_template_id"),
            "section": body.section,
        })

    resume_text = (session.get("resume_parsed") or {}).get("raw_text", "")
    user_profile = session.get("user_profile") or {}
    job_description = session.get("job_description") or ""
    tone = user_profile.get("preferred_tone", "Professional")
    existing = session.get("generated_resume")
    target_role = user_profile.get("target_role", "")
    locked_facts = session.get("locked_facts") or []
    sample_cv_text: str | None = session.get("sample_cv_text") or None

    # Resolve user tier early so we can gate Pro-only session features.
    # Done here (before the body.section check) so section regen also respects it.
    # NOTE: user_tier is re-resolved later after skill count; keep both in sync.
    from services.tier_config_service import has_feature as _has_feature
    _early_tier = (user or {}).get("tier", "free")
    # Drop Pro-only session data for non-entitled users (handles mid-lifecycle downgrades).
    if not _has_feature(_early_tier, "locked_facts"):
        locked_facts = []
    if not _has_feature(_early_tier, "sample_cv"):
        sample_cv_text = None

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

    has_jd = bool(job_description.strip())
    job_analyzer_calls = 1 if has_jd else 0

    # Tier-aware pass threshold — higher tiers demand more refinement cycles
    _TIER_THRESHOLDS = {"free": 75, "plus": 83, "pro": 92}
    pass_threshold = _TIER_THRESHOLDS.get((user or {}).get("tier", "free"), settings.pass_threshold)

    profession_config = await _resolve_profession(db, target_role)

    # ── Resolve user tier for per-tier feature enforcement ────────────────────
    user_tier = (user or {}).get("tier", "free")

    # ── Job analysis — only runs when a job description is provided ───────────
    from services.tier_config_service import get_limit as _get_limit
    if has_jd:
        n_skills = _get_limit(user_tier, "key_skills") or settings.skill_extraction_count
        key_skills: list = await _job_analyzer.run(
            resume_text=resume_text,
            user_profile=user_profile,
            job_description=job_description,
            n=n_skills,
        )
    else:
        key_skills = []
    # Persist key_skills on the session so export can bold them
    await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"key_skills": key_skills}},
    )

    # ── Section-only regeneration (Pro only) ─────────────────────────────────
    if body.section:
        from services.tier_config_service import has_feature as _hf
        if not _hf(user_tier, "section_regen"):
            raise HTTPException(
                403,
                "Section-level regeneration is not available on your plan. Visit /settings/plan to upgrade.",
            )
        await _check_cost_limit(db, session_id)
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

    # ── Generation cache check ────────────────────────────────────────────────
    # Hash all inputs that affect the generated output.
    # template_id affects content density (1-page vs 2-page) and style hints.
    # sample_cv_text fingerprint ensures formatting references invalidate the cache.
    # additional_instructions also affect output so they must be included.
    template_id  = session.get("selected_template_id") or ""
    sample_fp    = hashlib.sha256((sample_cv_text or "").encode()).hexdigest()[:16]
    extra_instr  = body.additional_instructions or ""
    input_hash = hashlib.sha256(
        f"{resume_text[:8000]}|{job_description[:4000]}|{target_role}|{tone}|{template_id}|{sample_fp}|{extra_instr[:500]}".encode()
    ).hexdigest()

    cached_gen = await db.generation_cache.find_one({
        "input_hash": input_hash,
        "created_at": {"$gt": datetime.utcnow() - timedelta(days=7)},
    })
    cached_score = (cached_gen or {}).get("eval_summary", {}).get("min_score", 0)
    if cached_gen and cached_score >= pass_threshold:
        logger.info("[generate] Cache hit — session %s score %d >= threshold %d",
                    session_id, cached_score, pass_threshold)
        await db.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {
                "generated_resume": cached_gen["resume_json"],
                "key_skills": key_skills,
                "final_min_score": cached_score,
                "final_all_passed": cached_gen["eval_summary"].get("all_passed", False),
            }},
        )
        return {
            "resume": cached_gen["resume_json"],
            "mode": "tailored" if has_jd else "polished",
            "cached": True,
            "eval_summary": cached_gen["eval_summary"],
        }

    # ── Full evaluator-optimizer pipeline ─────────────────────────────────────
    # Evaluator selection is tier-aware: Free=1, Plus=2, Pro=3 (subject to API key config).
    enabled_evaluators = _enabled_evaluators_for_tier(user_tier)
    active_evaluator_count = sum(enabled_evaluators.values())
    await _check_cost_limit(db, session_id)

    template_pages = _TEMPLATE_PAGES.get(template_id, 2)

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
        "pass_threshold": pass_threshold,
        "template_pages": template_pages,
        "cycle": 0,
        "feedback": None,
        "resume_json": None,
        "eval_results": [],
        "eval_history": [],
        "all_passed": False,
        "min_score": 0,
    }

    try:
        final_state = await asyncio.wait_for(
            pipeline.ainvoke(initial_state),
            timeout=240.0,  # 4 min — Plus/Pro with 3 evaluators × 3 cycles can need ~200s
        )
    except asyncio.TimeoutError:
        logger.error("[generate] Pipeline timed out for session %s", session_id)
        raise HTTPException(504, "Resume generation timed out. Please try again — it usually completes in 60–120 seconds.")
    except Exception as exc:
        logger.exception("[generate] Pipeline failed for session %s: %s", session_id, exc)
        raise HTTPException(500, f"Resume generation failed: {exc}")

    # Actual calls used: 1 job-analyzer + (generator + evaluators) * completed cycles
    actual_calls = job_analyzer_calls + (1 + active_evaluator_count) * final_state["cycle"]
    await _increment_call_count(db, session_id, actual_calls)

    await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {
            "generated_resume": final_state["resume_json"],
            "eval_cycles": final_state["cycle"],
            "eval_history": final_state["eval_history"],
            "key_skills": key_skills,
            "profession_slug": profession_config.get("slug", "generic"),
            "final_min_score": final_state["min_score"],
            "final_all_passed": final_state["all_passed"],
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

    # ── Preview validator — dedicated QA pass ─────────────────────────────────
    # Focused LLM call: confirms the generated resume fits the template's page
    # budget, is sized to best-practice counts, and keeps every source section.
    # Best-effort: a failure must never break generation.
    layout_validation = None
    if final_state.get("resume_json"):
        try:
            layout_validation = await validate_resume_layout(
                resume=final_state["resume_json"],
                page_count=template_pages,
                anthropic_key=settings.anthropic_api_key,
                source_resume_text=resume_text,
            )
            if layout_validation.get("truncated") or not layout_validation.get("page_breaks_clean", True):
                logger.warning(
                    "[generate] LAYOUT — session %s: est %s pages (template %s), truncated=%s, clean_breaks=%s. Fixes: %s",
                    session_id, layout_validation.get("estimated_pages"), template_pages,
                    layout_validation.get("truncated"), layout_validation.get("page_breaks_clean"),
                    layout_validation.get("suggestions"),
                )
            elif not layout_validation.get("optimized") or layout_validation.get("page_fit") != "good":
                logger.info(
                    "[generate] Layout validation flagged session %s: fit=%s issues=%s",
                    session_id, layout_validation.get("page_fit"), layout_validation.get("issues"),
                )
        except Exception as val_exc:
            logger.warning("[generate] Layout validation failed (non-fatal): %s", val_exc)

    eval_summary = {
        "cycles": final_state["cycle"],
        "all_passed": final_state["all_passed"],
        "min_score": final_state["min_score"],
        "pass_threshold": pass_threshold,
        "evaluator_results": final_state["eval_results"],
        "profession": profession_config.get("display_name", "General"),
        "key_skills": key_skills,
        "layout_validation": layout_validation,
    }

    # ── Store successful result in generation cache ───────────────────────────
    # Only cache valid, completed runs (not timeouts / exceptions — those never reach here).
    if final_state.get("resume_json"):
        try:
            await db.generation_cache.update_one(
                {"input_hash": input_hash},
                {"$set": {
                    "input_hash":   input_hash,
                    "resume_json":  final_state["resume_json"],
                    "eval_summary": eval_summary,
                    "created_at":   datetime.utcnow(),
                }},
                upsert=True,
            )
        except Exception as cache_exc:
            logger.warning("[generate] Failed to write generation cache: %s", cache_exc)

    return {
        "resume": final_state["resume_json"],
        "mode":   "tailored" if has_jd else "polished",
        "eval_summary": eval_summary,
        "layout_validation": layout_validation,
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
    from services.tier_config_service import has_feature as _hf
    if not _hf(user_tier, "locked_facts"):
        raise HTTPException(403, "Locked Facts is not available on your plan. Visit /settings/plan to upgrade.")

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

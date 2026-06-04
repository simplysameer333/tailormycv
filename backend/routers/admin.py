"""Admin-only router.

All endpoints require is_superadmin=True on the authenticated user.

GET  /api/admin/users              — all users with activity stats
GET  /api/admin/audit              — paginated audit log
GET  /api/admin/prompts            — current prompt values (override or default)
PUT  /api/admin/prompts/{key}      — set a prompt override
DELETE /api/admin/prompts/{key}    — remove override (revert to hardcoded default)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from bson import ObjectId

from dependencies.auth import require_superadmin
from database import get_db
from services.audit import log_audit
from services.prompt_store import (
    PROMPT_KEYS, PROMPT_CATEGORIES, get_override, set_override, delete_override, list_overrides,
)

# Import hardcoded defaults so admin UI can show them when no override exists
from services.pipeline.prompts.anthropic import (
    _GENERATOR_SYSTEM_BASE,
    _JOB_ANALYZER_SYSTEM,
    _ANTHROPIC_EVALUATOR_BASE,
)
from services.pipeline.prompts.openai import _OPENAI_EVALUATOR_BASE
from services.pipeline.prompts.google import _GOOGLE_EVALUATOR_BASE
from services.resume_checker_service import (
    _SYSTEM as _CV_QUALITY_SYSTEM, _PROMPT as _CV_QUALITY_PROMPT,
    _EXTRACT_SYSTEM as _CV_EXTRACT_SYSTEM, _EXTRACT_PROMPT as _CV_EXTRACT_PROMPT,
    _VALIDATE_SYSTEM as _CV_VALIDATE_SYSTEM, _VALIDATE_PROMPT as _CV_VALIDATE_PROMPT,
    _GRAMMAR_SYSTEM as _CV_GRAMMAR_SYSTEM, _GRAMMAR_PROMPT as _CV_GRAMMAR_PROMPT,
)

DEFAULTS: dict[str, str] = {
    "generator_system": _GENERATOR_SYSTEM_BASE,
    "job_analyzer_system": _JOB_ANALYZER_SYSTEM,
    "anthropic_evaluator_base": _ANTHROPIC_EVALUATOR_BASE,
    "openai_evaluator_base": _OPENAI_EVALUATOR_BASE,
    "google_evaluator_base": _GOOGLE_EVALUATOR_BASE,
    "cv_score_quality_system": _CV_QUALITY_SYSTEM,
    "cv_score_quality_prompt": _CV_QUALITY_PROMPT,
    "cv_score_extract_system": _CV_EXTRACT_SYSTEM,
    "cv_score_extract_prompt": _CV_EXTRACT_PROMPT,
    "cv_score_validate_system": _CV_VALIDATE_SYSTEM,
    "cv_score_validate_prompt": _CV_VALIDATE_PROMPT,
    "cv_score_grammar_system": _CV_GRAMMAR_SYSTEM,
    "cv_score_grammar_prompt": _CV_GRAMMAR_PROMPT,
}

router = APIRouter()


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/admin/users")
async def list_users(_: dict = Depends(require_superadmin)):
    """Return all users — basic info only. Fetch per-user stats separately via /admin/users/{id}/stats."""
    db = get_db()
    users = await db.users.find(
        {},
        {"hashed_password": 0}
    ).sort("created_at", -1).to_list(length=1000)
    return [
        {
            "id": str(u["_id"]),
            "email": u.get("email", ""),
            "name": u.get("name", ""),
            "tier": u.get("tier", "free"),
            "is_active": u.get("is_active", True),
            "is_superadmin": u.get("is_superadmin", False),
            "created_at": u.get("created_at"),
        }
        for u in users
    ]


class UserPatchBody(BaseModel):
    is_active: bool | None = None
    is_superadmin: bool | None = None
    tier: str | None = None


@router.patch("/admin/users/{user_id}")
async def admin_update_user(user_id: str, body: UserPatchBody, admin: dict = Depends(require_superadmin)):
    from datetime import datetime
    db = get_db()
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(400, "Invalid user ID.")
    if str(oid) == str(admin["_id"]):
        raise HTTPException(400, "You cannot modify your own account.")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update.")
    updates["updated_at"] = datetime.utcnow()
    result = await db.users.find_one_and_update(
        {"_id": oid}, {"$set": updates}, return_document=True
    )
    if not result:
        raise HTTPException(404, "User not found.")

    # If the new tier has no access to job_alerts, deactivate all active alerts
    # so the scheduler doesn't email a user who no longer qualifies.
    # Reads live tier config so this stays correct if tiers are reconfigured.
    if body.tier is not None:
        from services.tier_config_service import has_feature as _has_feature
        if not _has_feature(body.tier, "job_alerts"):
            await db.job_alerts.update_many(
                {"user_id": oid, "is_active": True},
                {"$set": {"is_active": False, "updated_at": datetime.utcnow()}},
            )

    changes = {k: v for k, v in updates.items() if k != "updated_at"}
    log_audit(admin, "user.update", {"target": result.get("email", ""), "changes": changes})

    return {
        "id": str(result["_id"]),
        "email": result.get("email"),
        "is_active": result.get("is_active", True),
        "is_superadmin": result.get("is_superadmin", False),
        "tier": result.get("tier", "free"),
    }


@router.delete("/admin/users/{user_id}", status_code=204)
async def admin_delete_user(user_id: str, admin: dict = Depends(require_superadmin)):
    db = get_db()
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(400, "Invalid user ID.")
    if str(oid) == str(admin["_id"]):
        raise HTTPException(400, "You cannot delete your own account.")
    doc = await db.users.find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "User not found.")
    if doc.get("is_superadmin"):
        raise HTTPException(400, "Cannot delete another superadmin account.")
    # Hard delete user + their associated data
    import asyncio
    await asyncio.gather(
        db.users.delete_one({"_id": oid}),
        db.user_profiles.delete_one({"user_id": oid}),
        db.job_alerts.delete_many({"user_id": oid}),
        db.saved_jobs.delete_many({"user_id": str(oid)}),
        db.saved_resumes.delete_many({"user_id": oid}),
        db.audit_log.delete_many({"user_id": str(oid)}),
    )
    # Logged under the acting admin (not the deleted user), so it survives the purge above.
    log_audit(admin, "user.delete", {"target": doc.get("email", "")})


@router.get("/admin/users/{user_id}/stats")
async def get_user_stats(user_id: str, _: dict = Depends(require_superadmin)):
    """Fetch activity counts for a single user — called lazily when a user row is expanded."""
    import asyncio
    from bson import ObjectId
    db = get_db()
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(400, "Invalid user ID.")
    session_count, resume_count, alert_count, saved_job_count = await asyncio.gather(
        db.sessions.count_documents({"user_id": oid}),
        db.saved_resumes.count_documents({"user_id": oid}),
        db.job_alerts.count_documents({"user_id": oid}),
        db.saved_jobs.count_documents({"user_id": str(oid)}),
    )
    return {
        "user_id": user_id,
        "session_count": session_count,
        "resume_count": resume_count,
        "alert_count": alert_count,
        "saved_job_count": saved_job_count,
    }


# ── Audit log ─────────────────────────────────────────────────────────────────

@router.get("/admin/audit")
async def list_audit(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: dict = Depends(require_superadmin),
):
    db = get_db()
    skip = (page - 1) * page_size
    total = await db.audit_log.count_documents({})
    docs = await db.audit_log.find({}).sort("created_at", -1).skip(skip).limit(page_size).to_list(length=page_size)
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": str(d["_id"]),
                "user_id": d.get("user_id", ""),
                "user_email": d.get("user_email", ""),
                "action": d.get("action", ""),
                "metadata": d.get("metadata", {}),
                "created_at": d.get("created_at"),
            }
            for d in docs
        ],
    }


# ── Prompts ───────────────────────────────────────────────────────────────────

@router.get("/admin/prompts")
async def list_prompts(_: dict = Depends(require_superadmin)):
    overrides = await list_overrides()
    return [
        {
            "key": key,
            "label": label,
            "body": overrides.get(key, DEFAULTS.get(key, "")),
            "is_override": key in overrides,
            "default_body": DEFAULTS.get(key, ""),
            "category": PROMPT_CATEGORIES.get(key, "builder"),
        }
        for key, label in PROMPT_KEYS.items()
    ]


class PromptBody(BaseModel):
    body: str


@router.put("/admin/prompts/{key}")
async def update_prompt(key: str, payload: PromptBody, _: dict = Depends(require_superadmin)):
    if key not in PROMPT_KEYS:
        raise HTTPException(400, f"Unknown prompt key: {key}")
    if not payload.body.strip():
        raise HTTPException(400, "Prompt body cannot be empty.")
    await set_override(key, payload.body.strip())
    return {"key": key, "saved": True}


@router.delete("/admin/prompts/{key}")
async def reset_prompt(key: str, _: dict = Depends(require_superadmin)):
    if key not in PROMPT_KEYS:
        raise HTTPException(400, f"Unknown prompt key: {key}")
    await delete_override(key)
    return {"key": key, "reset": True, "default_body": DEFAULTS.get(key, "")}


# ── Professions ───────────────────────────────────────────────────────────────

class ProfessionUpsertBody(BaseModel):
    slug: str
    display_name: str
    keywords: list[str] = []
    generator_context: str = ""
    evaluator_context: str = ""
    scoring_criteria: str = ""
    aggregator_context: str = ""
    evaluator_names: list[str] = []


class ProfessionPatchBody(BaseModel):
    display_name: str | None = None
    keywords: list[str] | None = None
    generator_context: str | None = None
    evaluator_context: str | None = None
    scoring_criteria: str | None = None
    aggregator_context: str | None = None
    evaluator_names: list[str] | None = None
    is_active: bool | None = None


@router.get("/admin/professions")
async def admin_list_professions(_: dict = Depends(require_superadmin)):
    """Return all professions (active and inactive) for admin management."""
    db = get_db()
    docs = await db.professions.find({}, {"_id": 0}).sort("slug", 1).to_list(None)
    return docs


@router.post("/admin/professions", status_code=201)
async def admin_create_profession(body: ProfessionUpsertBody, _: dict = Depends(require_superadmin)):
    db = get_db()
    if await db.professions.find_one({"slug": body.slug}):
        raise HTTPException(409, f"Profession '{body.slug}' already exists.")
    from datetime import datetime
    now = datetime.utcnow().isoformat()
    doc = {**body.model_dump(), "is_active": True, "created_at": now, "updated_at": now}
    await db.professions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/admin/professions/{slug}")
async def admin_update_profession(slug: str, body: ProfessionPatchBody, _: dict = Depends(require_superadmin)):
    db = get_db()
    from datetime import datetime
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.utcnow().isoformat()
    result = await db.professions.find_one_and_update(
        {"slug": slug},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(404, f"Profession '{slug}' not found.")
    result.pop("_id", None)
    return result


@router.delete("/admin/professions/{slug}", status_code=204)
async def admin_delete_profession(slug: str, _: dict = Depends(require_superadmin)):
    if slug == "generic":
        raise HTTPException(400, "Cannot delete the generic fallback profession.")
    db = get_db()
    from datetime import datetime
    result = await db.professions.update_one(
        {"slug": slug},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow().isoformat()}},
    )
    if result.modified_count == 0:
        raise HTTPException(404, f"Profession '{slug}' not found.")


# ── DOCX-template management removed — resume templates now live in the
# `cv_templates` collection (see routers/cv_templates.py + admin_cv_templates.py).


# ── System config (global master switches) ─────────────────────────────────────

@router.get("/admin/system-config")
async def get_system_config_route(_: dict = Depends(require_superadmin)):
    from services.system_config_service import get_system_config
    return await get_system_config()


class SystemConfigBody(BaseModel):
    alerts_enabled: bool | None = None


@router.put("/admin/system-config")
async def update_system_config_route(body: SystemConfigBody, admin: dict = Depends(require_superadmin)):
    from services.system_config_service import update_system_config
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    cfg = await update_system_config(patch)
    log_audit(admin, "system_config.update", patch)
    return cfg

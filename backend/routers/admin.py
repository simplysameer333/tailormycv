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
from services.prompt_store import PROMPT_KEYS, get_override, set_override, delete_override, list_overrides

# Import hardcoded defaults so admin UI can show them when no override exists
from services.pipeline.prompts.anthropic import (
    _GENERATOR_SYSTEM_BASE,
    _JOB_ANALYZER_SYSTEM,
    _ANTHROPIC_EVALUATOR_BASE,
)
from services.pipeline.prompts.openai import _OPENAI_EVALUATOR_BASE
from services.pipeline.prompts.google import _GOOGLE_EVALUATOR_BASE

DEFAULTS: dict[str, str] = {
    "generator_system": _GENERATOR_SYSTEM_BASE,
    "job_analyzer_system": _JOB_ANALYZER_SYSTEM,
    "anthropic_evaluator_base": _ANTHROPIC_EVALUATOR_BASE,
    "openai_evaluator_base": _OPENAI_EVALUATOR_BASE,
    "google_evaluator_base": _GOOGLE_EVALUATOR_BASE,
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
        db.sessions.count_documents({"user_id": str(oid)}),
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

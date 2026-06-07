"""Job search router — JSearch (RapidAPI) integration with caching and quota tracking.

GET    /api/jobs/search              — search jobs (all authenticated users)
GET    /api/jobs/details/{job_id}    — full job details + highlights (all authenticated users)
GET    /api/jobs/quota               — current monthly usage stats
POST   /api/jobs/save                — save a job to the user's list
GET    /api/jobs/saved               — list saved jobs
DELETE /api/jobs/saved/{job_id}      — remove a saved job
POST   /api/jobs/mark-seen           — mark a job as viewed (deduplication)
GET    /api/jobs/seen                — return list of seen job IDs for this user

Caching strategy:
  Search results are cached in MongoDB for CACHE_TTL_S seconds.
  Cache key = MD5(query|location|page).  Cache hits cost zero quota.

Quota tracking:
  Every successful JSearch API call increments a monthly counter.
  Responses include quota_pct + an optional warning string.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from typing import Any

import httpx
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from config import settings
from database import get_db
from dependencies.auth import get_current_user, require_tier, require_feature
from services.quota_service import get_quota, increment, quota_warning

router = APIRouter()

_JSEARCH_BASE = "https://jsearch.p.rapidapi.com"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _headers() -> dict:
    return {
        "x-rapidapi-host": "jsearch.p.rapidapi.com",
        "x-rapidapi-key": settings.rapidapi_key,
    }


def _cache_key(*parts: str) -> str:
    return hashlib.md5("|".join(parts).encode()).hexdigest()


async def _get_cache(key: str) -> dict | None:
    db = get_db()
    cutoff = datetime.utcnow() - timedelta(seconds=settings.jsearch_cache_ttl_s)
    doc = await db.search_cache.find_one({"key": key, "cached_at": {"$gte": cutoff}})
    return doc["payload"] if doc else None


async def _set_cache(key: str, payload: dict) -> None:
    db = get_db()
    await db.search_cache.replace_one(
        {"key": key},
        {"key": key, "payload": payload, "cached_at": datetime.utcnow()},
        upsert=True,
    )


# ── Search ────────────────────────────────────────────────────────────────────

@router.get("/jobs/search")
async def search_jobs(
    query: str,
    location: str = "",
    page: int = 1,
    page_size: int = Query(default=10, ge=1, le=50),
    _user: dict = Depends(get_current_user),
):
    if not settings.rapidapi_key:
        raise HTTPException(
            503,
            "Job search is not configured — add RAPIDAPI_KEY to .env. "
            "Get a free key at rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch",
        )

    # Check quota before calling
    quota = await get_quota()
    if quota["remaining"] == 0:
        raise HTTPException(
            429,
            f"Monthly job search quota exhausted ({quota['limit']} calls). "
            "Resets on the 1st of next month.",
        )

    # Build search query (JSearch takes location inline)
    q = f"{query.strip()} {location.strip()}".strip()

    # Cache lookup — key is NORMALISED (lower-cased, whitespace collapsed) so trivial
    # variations of the same search ("Software Engineer London" vs
    # "software engineer  london") reuse one cached result instead of each paying the
    # slow external API round-trip. The live API call below still uses the raw query.
    cache_key = _cache_key(" ".join(q.lower().split()), str(page), str(page_size))
    cached = await _get_cache(cache_key)
    if cached:
        cached["from_cache"] = True
        return cached

    # Call JSearch
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(
                f"{_JSEARCH_BASE}/search",
                params={"query": q, "page": str(page), "num_results": str(page_size)},
                headers=_headers(),
            )
            res.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(504, "Job search timed out. Please try again.")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            raise HTTPException(429, "RapidAPI rate limit hit. Wait a moment and try again.")
        raise HTTPException(502, f"Job search service error ({exc.response.status_code}).")

    data = res.json()
    jobs = data.get("data", [])

    # Increment quota after successful call
    quota = await increment()
    warning = quota_warning(quota["pct"])

    payload = {
        "jobs": jobs,
        "page": page,
        "from_cache": False,
        "quota_pct": quota["pct"],
        "quota_remaining": quota["remaining"],
        "quota_warning": warning,
    }

    await _set_cache(cache_key, payload)
    return payload


# ── Job details ───────────────────────────────────────────────────────────────

@router.get("/jobs/details/{job_id}")
async def get_job_details(
    job_id: str,
    _user: dict = Depends(get_current_user),
):
    if not settings.rapidapi_key:
        raise HTTPException(503, "Job search is not configured.")

    quota = await get_quota()
    if quota["remaining"] == 0:
        raise HTTPException(429, "Monthly job search quota exhausted.")

    cache_key = _cache_key("details", job_id)
    cached = await _get_cache(cache_key)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(
                f"{_JSEARCH_BASE}/job-details",
                params={"job_id": job_id, "extended_publisher_details": "false"},
                headers=_headers(),
            )
            res.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(504, "Timed out fetching job details.")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, f"Job details service error ({exc.response.status_code}).")

    data = res.json()
    job = (data.get("data") or [None])[0]
    if not job:
        raise HTTPException(404, "Job not found.")

    quota = await increment()
    payload = {"job": job, "quota_pct": quota["pct"], "quota_warning": quota_warning(quota["pct"])}
    await _set_cache(cache_key, payload)
    return payload


# ── Quota ─────────────────────────────────────────────────────────────────────

@router.get("/jobs/quota")
async def get_quota_status(_user: dict = Depends(get_current_user)):
    quota = await get_quota()
    quota["warning"] = quota_warning(quota["pct"])
    return quota


# ── Save / unsave ─────────────────────────────────────────────────────────────

class SaveJobBody(BaseModel):
    job_id: str
    job_data: dict[str, Any]


@router.post("/jobs/save", status_code=201)
async def save_job(body: SaveJobBody, user: dict = Depends(require_feature("save_jobs"))):
    db = get_db()
    user_id = user["_id"]

    if await db.saved_jobs.find_one({"user_id": user_id, "job_id": body.job_id}):
        raise HTTPException(409, "Job already saved.")

    from services.tier_config_service import get_limit as _get_limit
    limit = _get_limit(user.get("tier", "free"), "saved_jobs")
    if limit is not None:  # None = unlimited
        count = await db.saved_jobs.count_documents({"user_id": user_id})
        if count >= limit:
            raise HTTPException(
                403,
                f"Your plan allows up to {limit} saved jobs. Upgrade for unlimited.",
            )

    await db.saved_jobs.insert_one({
        "user_id": user_id,
        "job_id": body.job_id,
        "job_data": body.job_data,
        "saved_at": datetime.utcnow(),
    })
    return {"saved": True}


@router.get("/jobs/saved")
async def get_saved_jobs(user: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db.saved_jobs.find({"user_id": user["_id"]}).sort("saved_at", -1)
    docs = await cursor.to_list(length=200)
    return [d["job_data"] | {"_saved_at": d["saved_at"].isoformat()} for d in docs]


@router.delete("/jobs/saved/{job_id}", status_code=204)
async def unsave_job(job_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    result = await db.saved_jobs.delete_one({"user_id": user["_id"], "job_id": job_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Saved job not found.")


# ── Seen jobs (deduplication) ──────────────────────────────────────────────────

class MarkSeenBody(BaseModel):
    job_id: str


@router.post("/jobs/mark-seen", status_code=204)
async def mark_job_seen(body: MarkSeenBody, user: dict = Depends(get_current_user)):
    """Record that the user has viewed this job. Idempotent upsert."""
    db = get_db()
    await db.seen_jobs.update_one(
        {"user_id": user["_id"], "job_id": body.job_id},
        {"$setOnInsert": {"user_id": user["_id"], "job_id": body.job_id, "seen_at": datetime.utcnow()}},
        upsert=True,
    )


@router.get("/jobs/seen")
async def get_seen_job_ids(user: dict = Depends(get_current_user)):
    """Return the list of job IDs this user has already viewed."""
    db = get_db()
    cursor = db.seen_jobs.find({"user_id": user["_id"]}, {"job_id": 1, "_id": 0})
    docs = await cursor.to_list(length=2000)
    return [d["job_id"] for d in docs]

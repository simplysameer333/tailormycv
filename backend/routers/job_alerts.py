"""Job alerts router — saved search alerts with daily email digests.

GET    /api/jobs/alerts               — list user's alerts (Plus+ only)
POST   /api/jobs/alerts               — create alert (Plus ≤ 5, Pro unlimited)
PATCH  /api/jobs/alerts/{id}          — update name / criteria
DELETE /api/jobs/alerts/{id}          — delete alert
PATCH  /api/jobs/alerts/{id}/toggle   — enable or disable alert
POST   /api/jobs/alerts/send-test     — send a sample digest email for format preview
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_db
from dependencies.auth import get_current_user, require_feature
from services.audit import log_audit

router = APIRouter()

_PLUS_ALERT_LIMIT = 5


def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    doc["user_id"] = str(doc["user_id"])
    return doc


# ── Request bodies ─────────────────────────────────────────────────────────────

class CreateAlertBody(BaseModel):
    name: str
    query_tags: list[str] = []
    location_tags: list[str] = []
    company: Optional[str] = None


class UpdateAlertBody(BaseModel):
    name: Optional[str] = None
    query_tags: Optional[list[str]] = None
    location_tags: Optional[list[str]] = None
    company: Optional[str] = None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/jobs/alerts")
async def list_alerts(user: dict = Depends(require_feature("job_alerts"))):
    db = get_db()
    cursor = db.job_alerts.find({"user_id": user["_id"]}).sort("created_at", -1)
    docs = await cursor.to_list(length=100)
    return [_serialize(d) for d in docs]


@router.post("/jobs/alerts", status_code=201)
async def create_alert(body: CreateAlertBody, user: dict = Depends(require_feature("job_alerts"))):
    if not body.query_tags and not body.company:
        raise HTTPException(400, "Provide at least one search keyword or company name.")

    db = get_db()
    user_id = user["_id"]

    if user.get("tier") == "plus":
        count = await db.job_alerts.count_documents({"user_id": user_id})
        if count >= _PLUS_ALERT_LIMIT:
            raise HTTPException(
                403,
                f"Plus plan allows up to {_PLUS_ALERT_LIMIT} job alerts. Upgrade to Pro for unlimited.",
            )

    # Normalise tag order so duplicates are caught regardless of input order
    query_tags_norm = sorted(t.strip() for t in body.query_tags)
    location_tags_norm = sorted(t.strip() for t in body.location_tags)
    company_norm = body.company.strip() if body.company else None

    duplicate = await db.job_alerts.find_one({
        "user_id": user_id,
        "query_tags": query_tags_norm,
        "location_tags": location_tags_norm,
        "company": company_norm,
    })
    if duplicate:
        raise HTTPException(
            409,
            f"You already have an alert called \"{duplicate['name']}\" with the same search criteria.",
        )

    now = datetime.utcnow()
    result = await db.job_alerts.insert_one({
        "user_id": user_id,
        "name": body.name.strip(),
        "query_tags": query_tags_norm,
        "location_tags": location_tags_norm,
        "company": company_norm,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "last_sent_at": None,
        "seen_job_ids": [],
    })
    doc = await db.job_alerts.find_one({"_id": result.inserted_id})
    log_audit(user, "job_alert.create", {"alert_id": str(result.inserted_id), "name": body.name.strip()})
    return _serialize(doc)


@router.patch("/jobs/alerts/{alert_id}")
async def update_alert(
    alert_id: str,
    body: UpdateAlertBody,
    user: dict = Depends(require_feature("job_alerts")),
):
    db = get_db()
    try:
        oid = ObjectId(alert_id)
    except Exception:
        raise HTTPException(400, "Invalid alert ID.")

    doc = await db.job_alerts.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(404, "Alert not found.")

    updates: dict = {"updated_at": datetime.utcnow()}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.query_tags is not None:
        updates["query_tags"] = body.query_tags
    if body.location_tags is not None:
        updates["location_tags"] = body.location_tags
    if body.company is not None:
        updates["company"] = body.company or None

    await db.job_alerts.update_one({"_id": oid}, {"$set": updates})
    doc = await db.job_alerts.find_one({"_id": oid})
    return _serialize(doc)


@router.delete("/jobs/alerts/{alert_id}", status_code=204)
async def delete_alert(alert_id: str, user: dict = Depends(require_feature("job_alerts"))):
    db = get_db()
    try:
        oid = ObjectId(alert_id)
    except Exception:
        raise HTTPException(400, "Invalid alert ID.")

    result = await db.job_alerts.delete_one({"_id": oid, "user_id": user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Alert not found.")
    log_audit(user, "job_alert.delete", {"alert_id": alert_id})


class SendTestEmailBody(BaseModel):
    email: str


@router.post("/jobs/alerts/send-test")
async def send_test_alert_email(body: SendTestEmailBody):
    """On-demand alert email — triggers a real JSearch + Brevo send.

    Requires the user to have at least one active alert. No mock data.
    Returns 404 if no user/alert found, 400 if JSearch returns no results.
    """
    from services.email_service import send_job_alert_email, send_no_results_email
    from services.alert_scheduler import _search_jobs

    db = get_db()

    # ── Resolve user + their first active alert ───────────────────────────────
    target_user = await db.users.find_one({"email": body.email})
    if not target_user:
        raise HTTPException(404, f"No user found with email {body.email!r}.")

    alert_doc = await db.job_alerts.find_one(
        {"user_id": target_user["_id"], "is_active": True},
        sort=[("created_at", 1)],
    )
    if not alert_doc:
        raise HTTPException(404, "User has no active job alerts. Create one on the Jobs page first.")

    # ── Run live JSearch ──────────────────────────────────────────────────────
    query = " ".join(alert_doc.get("query_tags", []))
    if alert_doc.get("company"):
        query = f"{query} {alert_doc['company']}".strip()
    location = " OR ".join(alert_doc.get("location_tags", []))
    jsearch_query = f"{query} {location}".strip()

    jobs = await _search_jobs(query, location)
    if not jobs:
        try:
            await send_no_results_email(
                user_email=body.email,
                user_name=target_user.get("name", "there"),
                alert_name=alert_doc["name"],
            )
        except RuntimeError as exc:
            raise HTTPException(502, f"Brevo send failed: {exc}")
        return {
            "sent": True,
            "to": body.email,
            "alert": alert_doc["name"],
            "jobs": 0,
            "jsearch_query": jsearch_query,
            "note": "No matching jobs found — user notified by email.",
        }

    jobs = jobs[:10]

    # ── Send ──────────────────────────────────────────────────────────────────
    try:
        await send_job_alert_email(
            user_email=body.email,
            user_name=target_user.get("name", "there"),
            alert_name=alert_doc["name"],
            jobs=jobs,
        )
    except RuntimeError as exc:
        raise HTTPException(502, f"Brevo send failed: {exc}")

    return {
        "sent": True,
        "to": body.email,
        "alert": alert_doc["name"],
        "jobs": len(jobs),
        "jsearch_query": jsearch_query,
    }


@router.patch("/jobs/alerts/{alert_id}/toggle")
async def toggle_alert(alert_id: str, user: dict = Depends(require_feature("job_alerts"))):
    db = get_db()
    try:
        oid = ObjectId(alert_id)
    except Exception:
        raise HTTPException(400, "Invalid alert ID.")

    doc = await db.job_alerts.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(404, "Alert not found.")

    new_state = not doc["is_active"]
    await db.job_alerts.update_one(
        {"_id": oid},
        {"$set": {"is_active": new_state, "updated_at": datetime.utcnow()}},
    )
    return {"is_active": new_state}

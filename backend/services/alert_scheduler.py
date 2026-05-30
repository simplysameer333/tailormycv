"""Daily job alert scheduler.

Runs once at ALERT_SEND_HOUR UTC every day.
For each active alert it:
  1. Calls JSearch with the alert's query/location criteria.
  2. Filters out job IDs already emailed (seen_job_ids).
  3. Sends a digest email via Resend if there are new results.
  4. Updates last_sent_at and appends new job IDs to seen_job_ids (capped at 1000).
"""
from __future__ import annotations

import logging
from datetime import datetime

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from config import settings
from database import get_db
from services.email_service import send_job_alert_email, send_no_results_email

logger = logging.getLogger("tailormycv")

_scheduler: AsyncIOScheduler | None = None
_JSEARCH_BASE = "https://jsearch.p.rapidapi.com"
_SEEN_IDS_CAP = 1000


def _jsearch_headers() -> dict:
    return {
        "x-rapidapi-host": "jsearch.p.rapidapi.com",
        "x-rapidapi-key": settings.rapidapi_key,
    }


async def _search_jobs(query: str, location: str) -> list[dict]:
    if not settings.rapidapi_key:
        return []
    q = f"{query.strip()} {location.strip()}".strip()
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(
                f"{_JSEARCH_BASE}/search",
                params={"query": q, "page": "1", "num_results": "10"},
                headers=_jsearch_headers(),
            )
            res.raise_for_status()
        return res.json().get("data", [])
    except Exception as exc:
        logger.warning("[alert-scheduler] JSearch error for query %r: %s", q, exc)
        return []


async def _process_alert(db, alert: dict) -> None:
    user = await db.users.find_one({"_id": alert["user_id"]})
    if not user or not user.get("is_active"):
        return

    # Skip if user's tier no longer qualifies for job alerts (e.g. downgraded from Plus)
    if user.get("tier", "free") not in ("plus", "pro"):
        logger.info(
            "[alert-scheduler] Alert %s skipped — user %s is on %s tier",
            alert["_id"], user.get("email"), user.get("tier", "free"),
        )
        return

    query_parts = list(alert.get("query_tags", []))
    company = alert.get("company")
    if company:
        query_parts.append(company)
    query = " ".join(query_parts).strip()
    if not query:
        return

    location = " OR ".join(alert.get("location_tags", []))
    jobs = await _search_jobs(query, location)
    if not jobs:
        await send_no_results_email(
            user_email=user["email"],
            user_name=user.get("name", "there"),
            alert_name=alert["name"],
        )
        return

    seen_ids: set[str] = set(alert.get("seen_job_ids", []))
    new_jobs = [j for j in jobs if j.get("job_id") and j["job_id"] not in seen_ids]
    new_jobs = new_jobs[: settings.alert_max_jobs_per_email]

    if not new_jobs:
        logger.debug("[alert-scheduler] Alert %s: no new jobs, skipping email", alert["_id"])
        return

    sent = await send_job_alert_email(
        user_email=user["email"],
        user_name=user.get("name", "there"),
        alert_name=alert["name"],
        jobs=new_jobs,
    )

    if sent:
        updated_seen = list(seen_ids | {j["job_id"] for j in new_jobs})
        if len(updated_seen) > _SEEN_IDS_CAP:
            updated_seen = updated_seen[-_SEEN_IDS_CAP:]

        await db.job_alerts.update_one(
            {"_id": alert["_id"]},
            {"$set": {"last_sent_at": datetime.utcnow(), "seen_job_ids": updated_seen}},
        )
        logger.info(
            "[alert-scheduler] Alert %s → %d new jobs emailed to %s",
            alert["_id"], len(new_jobs), user["email"],
        )


async def run_daily_alerts() -> None:
    logger.info("[alert-scheduler] Daily alert run starting")
    db = get_db()
    alerts = await db.job_alerts.find({"is_active": True}).to_list(length=2000)
    logger.info("[alert-scheduler] Processing %d active alerts", len(alerts))

    for alert in alerts:
        try:
            await _process_alert(db, alert)
        except Exception as exc:
            logger.error("[alert-scheduler] Unhandled error on alert %s: %s", alert["_id"], exc)

    logger.info("[alert-scheduler] Daily alert run complete")


def start_scheduler() -> None:
    global _scheduler
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        run_daily_alerts,
        trigger="cron",
        hour=settings.alert_send_hour,
        minute=0,
        id="daily_job_alerts",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "[alert-scheduler] Started — daily alerts fire at %02d:00 UTC",
        settings.alert_send_hour,
    )


def stop_scheduler() -> None:
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[alert-scheduler] Stopped")

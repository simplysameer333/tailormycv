"""Daily job alert scheduler.

Runs once at ALERT_SEND_HOUR UTC every day.
For each active alert it:
  1. Calls JSearch with the alert's query/location criteria.
  2. Filters out job IDs already emailed (seen_job_ids).
  3. Sends a digest email via Resend if there are new results.
  4. Updates last_sent_at and appends new job IDs to seen_job_ids (capped at 1000).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from config import settings
from database import get_db
from services.email_service import send_job_alert_email, send_no_results_email, send_scheduler_failure_alert
from services.quota_service import get_quota, increment as _increment_quota

logger = logging.getLogger("tailormycv")

_scheduler: AsyncIOScheduler | None = None
_JSEARCH_BASE = "https://jsearch.p.rapidapi.com"
_SEEN_IDS_CAP = 1000


def _jsearch_headers() -> dict:
    return {
        "x-rapidapi-host": "jsearch.p.rapidapi.com",
        "x-rapidapi-key": settings.rapidapi_key,
    }


async def _search_jobs(query: str, location: str) -> list[dict] | None:
    """Return job list (empty = no results), or None if the call failed / quota exhausted.

    Returning None tells the caller to skip the alert rather than send a
    misleading "no results" notification — the jobs may well exist, JSearch
    just couldn't be reached right now.
    """
    if not settings.rapidapi_key:
        return None

    quota = await get_quota()
    if quota["remaining"] == 0:
        logger.warning("[alert-scheduler] Monthly JSearch quota exhausted — skipping alert run")
        return None

    q = f"{query.strip()} {location.strip()}".strip()
    last_exc: Exception | None = None
    for attempt in range(1, 4):  # 3 attempts with 1 s delay between retries
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.get(
                    f"{_JSEARCH_BASE}/search",
                    params={"query": q, "page": "1", "num_results": "10"},
                    headers=_jsearch_headers(),
                )
                res.raise_for_status()
            await _increment_quota()
            return res.json().get("data", [])
        except Exception as exc:
            last_exc = exc
            if attempt < 3:
                logger.warning(
                    "[alert-scheduler] JSearch attempt %d/3 failed for %r: %s — retrying in 1 s",
                    attempt, q, exc,
                )
                await asyncio.sleep(1)
    logger.warning("[alert-scheduler] JSearch failed after 3 attempts for %r: %s", q, last_exc)
    return None


async def _process_alert(db, alert: dict) -> str | None:
    """Process one alert.  Returns an error string if JSearch failed, else None."""
    user = await db.users.find_one({"_id": alert["user_id"]})
    if not user or not user.get("is_active"):
        return None

    # Skip if user's tier no longer qualifies — reads live MongoDB tier config
    from services.tier_config_service import has_feature as _has_feature
    if not _has_feature(user.get("tier", "free"), "job_alerts"):
        logger.info(
            "[alert-scheduler] Alert %s skipped — user %s (tier=%s) not entitled",
            alert["_id"], user.get("email"), user.get("tier", "free"),
        )
        return None

    query_parts = list(alert.get("query_tags", []))
    company = alert.get("company")
    if company:
        query_parts.append(company)
    query = " ".join(query_parts).strip()
    if not query:
        return None

    location = " OR ".join(alert.get("location_tags", []))
    jobs = await _search_jobs(query, location)

    if jobs is None:
        # JSearch errored or quota exhausted — report to caller for summary email
        msg = f"Alert '{alert.get('name')}' (query={query!r}): JSearch unavailable after 3 retries"
        logger.warning("[alert-scheduler] %s", msg)
        return msg

    if not jobs:
        # JSearch responded successfully but returned zero listings
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

    # Master switch — admins can pause ALL alert emails app-wide from the dashboard.
    from services.system_config_service import alerts_enabled
    if not await alerts_enabled(db):
        logger.info("[alert-scheduler] Daily run skipped — alerts disabled by admin master switch")
        return

    alerts = await db.job_alerts.find({"is_active": True}).to_list(length=2000)
    total = len(alerts)
    logger.info("[alert-scheduler] Processing %d active alerts", total)

    failures: list[str] = []
    for alert in alerts:
        try:
            error = await _process_alert(db, alert)
            if error:
                failures.append(error)
        except Exception as exc:
            msg = f"Alert '{alert.get('name')}' ({alert['_id']}): unhandled error — {exc}"
            logger.error("[alert-scheduler] %s", msg)
            failures.append(msg)

    logger.info(
        "[alert-scheduler] Daily run complete — %d processed, %d JSearch failures",
        total, len(failures),
    )

    if failures:
        await send_scheduler_failure_alert(
            failed=len(failures),
            total=total,
            sample_errors=failures,
        )


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

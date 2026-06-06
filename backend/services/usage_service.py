"""Per-user AI usage budgets — daily + monthly cost caps.

Account-level cost guardrail layered on the per-session call cap. Each user has
a daily AND a monthly estimated-spend ceiling per their subscription tier; a
request is refused (429) once EITHER is reached. Both are tier config so admins
tune them with no deploy:
  - daily_cost_cents   — max estimated spend per UTC day
  - monthly_cost_cents — max estimated spend per UTC calendar month
None = unlimited, 0 = blocked.

Storage: one doc per (user, UTC month) in `ai_usage`, holding the month totals
plus a per-day breakdown (`days.<YYYY-MM-DD>.{cost,calls}`). A single TTL index on
`expires_at` purges old months automatically — no cron needed.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from services.tier_config_service import get_limit

_COLLECTION = "ai_usage"
_RETAIN_DAYS = 45  # keep ~1.5 months so the active month always survives


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _day() -> str:
    return _now().strftime("%Y-%m-%d")


def _month() -> str:
    return _now().strftime("%Y-%m")


def _doc_id(user_id: str, month: str) -> str:
    return f"{user_id}:{month}"


async def ensure_indexes(db) -> None:
    """Create the TTL index that auto-purges expired usage docs. Idempotent."""
    await db[_COLLECTION].create_index("expires_at", expireAfterSeconds=0)


async def get_usage(db, user_id: str) -> dict:
    """Return today's + this month's {cost_usd, calls} for a user (zeros if none)."""
    doc = await db[_COLLECTION].find_one({"_id": _doc_id(user_id, _month())}) or {}
    today = (doc.get("days") or {}).get(_day(), {})
    return {
        "daily_cost_usd": float(today.get("cost", 0.0)),
        "daily_calls": int(today.get("calls", 0)),
        "monthly_cost_usd": float(doc.get("month_cost", 0.0)),
        "monthly_calls": int(doc.get("month_calls", 0)),
    }


async def check_budget(db, user: dict, tier: str) -> None:
    """Raise 429 if the user has hit their tier's daily OR monthly cost budget.

    Checks current (not projected) spend so the first request of the day/month
    always runs — mirrors the per-session cap's behaviour.
    """
    user_id = str(user.get("_id", ""))
    if not user_id:
        return  # anonymous — governed by the per-session cap instead

    daily_cap = get_limit(tier, "daily_cost_cents")      # None = unlimited
    monthly_cap = get_limit(tier, "monthly_cost_cents")  # None = unlimited
    if daily_cap is None and monthly_cap is None:
        return

    u = await get_usage(db, user_id)
    if daily_cap is not None and round(u["daily_cost_usd"] * 100) >= daily_cap:
        raise HTTPException(
            429,
            "You've reached your plan's daily AI budget. It resets at 00:00 UTC — "
            "or upgrade your plan for a higher budget.",
        )
    if monthly_cap is not None and round(u["monthly_cost_usd"] * 100) >= monthly_cap:
        raise HTTPException(
            429,
            "You've reached your plan's monthly AI budget. It resets at the start of "
            "next month — or upgrade your plan for a higher budget.",
        )


async def increment_usage(db, user_id: str, calls: int, cost_usd: float) -> None:
    """Add estimated cost + call count to the user's day and month totals (upsert)."""
    if not user_id:
        return
    month, day = _month(), _day()
    now = _now()
    await db[_COLLECTION].update_one(
        {"_id": _doc_id(user_id, month)},
        {
            "$inc": {
                "month_cost": float(cost_usd),
                "month_calls": int(calls),
                f"days.{day}.cost": float(cost_usd),
                f"days.{day}.calls": int(calls),
            },
            "$set": {
                "user_id": user_id,
                "month": month,
                "updated_at": now,
                "expires_at": now + timedelta(days=_RETAIN_DAYS),
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

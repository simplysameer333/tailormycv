"""Per-user daily AI usage budget — calls + estimated cost.

Account-level backstop to the per-session call cap (MAX_AI_CALLS_PER_SESSION).
A single user can open many sessions; without an account-level ceiling that is
an unbounded daily spend. This caps both the number of LLM calls and the
estimated USD cost a user can incur per UTC day, per their subscription tier.

Limits live in the tier config (so admins tune them with no deploy):
  - daily_ai_calls   — max LLM sub-calls per day   (None = unlimited, 0 = blocked)
  - daily_cost_cents — max estimated spend per day  (None = unlimited, 0 = blocked)

Usage is tracked per (user, UTC day) in the `daily_usage` collection and
auto-expires via a TTL index on created_at (see ensure_indexes).
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException

from services.tier_config_service import get_limit

_COLLECTION = "daily_usage"
_TTL_DAYS = 7  # keep a week of history for the admin view, then auto-purge


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _doc_id(user_id: str, day: str) -> str:
    return f"{user_id}:{day}"


async def ensure_indexes(db) -> None:
    """Create the TTL index that auto-purges old daily-usage rows. Idempotent."""
    await db[_COLLECTION].create_index("created_at", expireAfterSeconds=_TTL_DAYS * 86_400)


async def get_daily_usage(db, user_id: str) -> dict:
    """Return today's {calls, cost_usd} for a user (zeros if none yet)."""
    doc = await db[_COLLECTION].find_one({"_id": _doc_id(user_id, _today())})
    return {
        "calls": int((doc or {}).get("calls", 0)),
        "cost_usd": float((doc or {}).get("cost_usd", 0.0)),
    }


async def check_daily_budget(db, user: dict, tier: str) -> None:
    """Raise 429 if the user has already reached their tier's daily call/cost budget.

    Checks current (not projected) usage so the first request of the day always
    runs — mirrors the per-session cap's behaviour.
    """
    user_id = str(user.get("_id", ""))
    if not user_id:
        return  # anonymous — governed by the per-session cap instead

    call_limit = get_limit(tier, "daily_ai_calls")       # None = unlimited
    cost_limit_cents = get_limit(tier, "daily_cost_cents")  # None = unlimited
    if call_limit is None and cost_limit_cents is None:
        return

    usage = await get_daily_usage(db, user_id)
    if call_limit is not None and usage["calls"] >= call_limit:
        raise HTTPException(
            429,
            "You've reached your plan's daily AI generation limit. "
            "It resets at 00:00 UTC — or upgrade your plan for a higher daily budget.",
        )
    if cost_limit_cents is not None and round(usage["cost_usd"] * 100) >= cost_limit_cents:
        raise HTTPException(
            429,
            "You've reached your plan's daily AI usage budget. "
            "It resets at 00:00 UTC — or upgrade your plan for a higher daily budget.",
        )


async def increment_daily_usage(db, user_id: str, calls: int, cost_usd: float) -> None:
    """Add calls + estimated cost to the user's usage for today (upsert)."""
    if not user_id:
        return
    day = _today()
    now = datetime.now(timezone.utc)
    await db[_COLLECTION].update_one(
        {"_id": _doc_id(user_id, day)},
        {
            "$inc": {"calls": int(calls), "cost_usd": float(cost_usd)},
            "$set": {"user_id": user_id, "day": day, "updated_at": now},
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

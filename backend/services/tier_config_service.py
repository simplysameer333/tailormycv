"""Tier feature config service.

Single source of truth for which features are available on which tiers,
and what numeric limits apply per tier.

Flow:
  Startup  → load_config() seeds MongoDB if empty, then populates in-memory cache.
  Request  → has_feature() / get_limit() read from cache (microsecond cost).
  Admin    → PUT /api/admin/config/tiers calls save_config() which persists to
             MongoDB and immediately reloads the cache — no restart needed.
  Frontend → GET /api/config/tiers returns the live cache so the frontend can
             also read the same config at startup.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger("tailormycv")

_COLLECTION = "tier_config"
_DOC_ID = "v1"

# ── Hardcoded defaults ─────────────────────────────────────────────────────────
# Used on first run (before any MongoDB document exists) and as a fallback if
# the DB is unreachable.  Keep in sync with frontend/src/lib/config.ts.

DEFAULT_PRICING: dict[str, dict] = {
    "USD": {"symbol": "$", "plus": 9,  "pro": 19},
    "GBP": {"symbol": "£", "plus": 7,  "pro": 15},
    "EUR": {"symbol": "€", "plus": 8,  "pro": 17},
}

DEFAULT_CURRENCY_ZONES: list[dict] = [
    {
        "currency": "GBP",
        "timezones": ["Europe/London", "Europe/Belfast", "Europe/Isle_of_Man", "Europe/Jersey", "Europe/Guernsey"],
        "timezone_prefix": "",
        "locale_codes": ["en-GB"],
    },
    {
        "currency": "EUR",
        "timezones": [],
        "timezone_prefix": "Europe/",
        "locale_codes": [],
    },
]

DEFAULT_FEATURES: dict[str, list[str]] = {
    # Builder
    "pdf_export":      ["plus", "pro"],
    "save_to_library": ["plus", "pro"],
    "section_regen":   ["pro"],
    "locked_facts":    ["pro"],
    "sample_cv":       ["pro"],
    # Jobs
    "job_search":      ["free", "plus", "pro"],
    "save_jobs":       ["plus", "pro"],
    "tailor_job":      ["plus", "pro"],
    "apply_saved":     ["plus", "pro"],
    "resume_library":  ["plus", "pro"],
    "job_alerts":      ["plus", "pro"],
}

DEFAULT_LIMITS: dict[str, dict[str, int | None]] = {
    "resume_sessions": {"free": 5,  "plus": 20,  "pro": None},
    "resume_library":  {"free": 0,  "plus": 5,   "pro": None},
    "saved_jobs":      {"free": 0,  "plus": 25,  "pro": None},
    "job_alerts":      {"free": 0,  "plus": 5,   "pro": None},
    "evaluators":      {"free": 1,  "plus": 2,   "pro": 3},
    "key_skills":      {"free": 3,  "plus": 5,   "pro": 10},
    # Account-level daily budgets (per UTC day) — backstop the per-session cap.
    # daily_ai_calls counts LLM sub-calls (a full generation ≈ 7/13/21 calls).
    # daily_cost_cents bounds estimated spend in US cents. None = unlimited.
    "daily_ai_calls":   {"free": 60,  "plus": 400,  "pro": None},
    "daily_cost_cents": {"free": 100, "plus": 1000, "pro": 5000},
}

# Human-readable labels — used by the admin UI
FEATURE_LABELS: dict[str, str] = {
    "pdf_export":      "PDF Export",
    "save_to_library": "Save to Resume Library",
    "section_regen":   "Section-level Regeneration",
    "locked_facts":    "Locked Facts Panel",
    "sample_cv":       "Sample CV Reference",
    "job_search":      "Job Search (browse)",
    "save_jobs":       "Save Jobs",
    "tailor_job":      "One-click Tailor from Job Listing",
    "apply_saved":     "Apply with Saved Resume",
    "resume_library":  "Resume Library Access",
    "job_alerts":      "Daily Job Alerts",
}

LIMIT_LABELS: dict[str, str] = {
    "resume_sessions": "Resume Builder Sessions",
    "resume_library":  "Resume Library size",
    "saved_jobs":      "Saved Jobs",
    "job_alerts":      "Job Alerts",
    "evaluators":      "AI Evaluators",
    "key_skills":      "Key Skills extracted from JD",
    "daily_ai_calls":   "Daily AI Call Budget",
    "daily_cost_cents": "Daily AI Cost Budget (US¢)",
}

# ── In-memory cache ────────────────────────────────────────────────────────────
_features: dict[str, list[str]] = {k: list(v) for k, v in DEFAULT_FEATURES.items()}
_limits: dict[str, dict[str, int | None]] = {k: dict(v) for k, v in DEFAULT_LIMITS.items()}
_pricing: dict[str, dict] = {k: dict(v) for k, v in DEFAULT_PRICING.items()}
_currency_zones: list[dict] = [dict(z) for z in DEFAULT_CURRENCY_ZONES]


async def load_config(db=None) -> None:
    """Load tier config from MongoDB into memory.

    Called once at server startup.  If no document exists, seeds the defaults.
    """
    global _features, _limits, _pricing, _currency_zones
    if db is None:
        from database import get_db
        db = get_db()

    doc = await db[_COLLECTION].find_one({"_id": _DOC_ID})

    if doc is None:
        await db[_COLLECTION].insert_one({
            "_id": _DOC_ID,
            "features": DEFAULT_FEATURES,
            "limits": DEFAULT_LIMITS,
            "pricing": DEFAULT_PRICING,
            "currency_zones": DEFAULT_CURRENCY_ZONES,
            "updated_at": datetime.utcnow(),
        })
        logger.info("[tier-config] Seeded defaults into MongoDB")
        return  # cache already holds defaults

    _features       = doc.get("features")       or {k: list(v) for k, v in DEFAULT_FEATURES.items()}
    _limits         = doc.get("limits")         or {k: dict(v) for k, v in DEFAULT_LIMITS.items()}
    _pricing        = doc.get("pricing")        or {k: dict(v) for k, v in DEFAULT_PRICING.items()}
    _currency_zones = doc.get("currency_zones") or [dict(z) for z in DEFAULT_CURRENCY_ZONES]

    # Forward-compatible merge: an existing doc won't contain feature/limit keys
    # added in a later release. Backfill any missing keys from defaults so new
    # gates (e.g. daily budgets) resolve correctly instead of falling through to
    # 0 (= blocked). Persist the backfill so the admin UI shows the new rows too.
    added_features = {k: list(v) for k, v in DEFAULT_FEATURES.items() if k not in _features}
    added_limits   = {k: dict(v) for k, v in DEFAULT_LIMITS.items()   if k not in _limits}
    if added_features or added_limits:
        _features.update(added_features)
        _limits.update(added_limits)
        try:
            await db[_COLLECTION].update_one(
                {"_id": _DOC_ID},
                {"$set": {"features": _features, "limits": _limits, "updated_at": datetime.utcnow()}},
            )
            logger.info(
                "[tier-config] Backfilled new defaults — features: %s, limits: %s",
                sorted(added_features), sorted(added_limits),
            )
        except Exception as exc:  # in-memory merge already applied; persistence is best-effort
            logger.warning("[tier-config] Backfill persist failed (using merged cache): %s", exc)

    logger.info(
        "[tier-config] Loaded from MongoDB — %d features, %d limits, %d currencies",
        len(_features), len(_limits), len(_pricing),
    )


async def save_config(
    features: dict[str, list[str]],
    limits: dict[str, dict[str, int | None]],
    pricing: dict[str, dict] | None = None,
    currency_zones: list[dict] | None = None,
) -> None:
    """Persist new config to MongoDB and reload the in-memory cache immediately."""
    from database import get_db
    db = get_db()
    update: dict = {
        "features": features,
        "limits": limits,
        "updated_at": datetime.utcnow(),
    }
    if pricing is not None:
        update["pricing"] = pricing
    if currency_zones is not None:
        update["currency_zones"] = currency_zones
    await db[_COLLECTION].update_one({"_id": _DOC_ID}, {"$set": update}, upsert=True)
    await load_config(db)
    logger.info("[tier-config] Saved and reloaded by admin")


def get_config() -> dict[str, Any]:
    """Return the full in-memory config (used by the public API endpoint)."""
    return {
        "features":       _features,
        "limits":         _limits,
        "pricing":        _pricing,
        "currency_zones": _currency_zones,
        "feature_labels": FEATURE_LABELS,
        "limit_labels":   LIMIT_LABELS,
    }


def has_feature(user_tier: str, feature: str) -> bool:
    """Return True if user_tier is allowed to use the named feature."""
    return user_tier in _features.get(feature, [])


def get_limit(tier: str, limit_key: str) -> int | None:
    """Return the numeric limit for a tier (None = unlimited, 0 = not allowed)."""
    return _limits.get(limit_key, {}).get(tier, 0)

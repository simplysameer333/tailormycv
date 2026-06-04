"""Global system configuration — admin-controlled app-wide flags.

A single document in the `system_config` collection holds master switches that
apply to the whole app (not per-tier, not per-user). Created lazily with defaults
on first read, so no seed step is required.

Currently:
  • alerts_enabled — master switch for the daily job-alert scheduler. When False,
    `run_daily_alerts()` skips the entire run and no alert emails go out to anyone.
"""
from __future__ import annotations

from database import get_db

_DOC_ID = "global"

# All recognised flags + their defaults. Updates are restricted to these keys.
DEFAULTS: dict = {
    "alerts_enabled": True,
}


async def get_system_config(db=None) -> dict:
    """Return the global config (merged over defaults). Creates the doc if absent."""
    db = db if db is not None else get_db()
    doc = await db.system_config.find_one({"_id": _DOC_ID})
    if not doc:
        await db.system_config.insert_one({"_id": _DOC_ID, **DEFAULTS})
        doc = {"_id": _DOC_ID, **DEFAULTS}
    return {**DEFAULTS, **{k: v for k, v in doc.items() if k != "_id"}}


async def update_system_config(patch: dict, db=None) -> dict:
    """Update recognised flags only; returns the full merged config."""
    db = db if db is not None else get_db()
    allowed = {k: bool(v) if isinstance(DEFAULTS[k], bool) else v
               for k, v in patch.items() if k in DEFAULTS}
    if allowed:
        await db.system_config.update_one({"_id": _DOC_ID}, {"$set": allowed}, upsert=True)
    return await get_system_config(db)


async def alerts_enabled(db=None) -> bool:
    cfg = await get_system_config(db)
    return bool(cfg.get("alerts_enabled", True))

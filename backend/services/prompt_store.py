"""Runtime prompt override store.

Prompts are hardcoded in the pipeline modules as defaults.
Admin can override any prompt key in MongoDB (prompt_overrides collection).
This module provides get/set/delete for those overrides with a simple
per-request DB lookup (no stale cache complexity needed at this scale).
"""
from __future__ import annotations
from datetime import datetime
from database import get_db

# Keys that can be overridden, with human-readable labels
PROMPT_KEYS: dict[str, str] = {
    "generator_system": "Generator — System Prompt",
    "job_analyzer_system": "Job Analyzer — System Prompt",
    "anthropic_evaluator_base": "Anthropic Evaluator — Base Prompt",
    "openai_evaluator_base": "OpenAI Evaluator — Base Prompt",
    "google_evaluator_base": "Google Evaluator — Base Prompt",
}


async def get_override(key: str) -> str | None:
    """Return the DB override body for key, or None if not set."""
    db = get_db()
    doc = await db.prompt_overrides.find_one({"key": key})
    return doc["body"] if doc else None


async def set_override(key: str, body: str) -> None:
    db = get_db()
    await db.prompt_overrides.update_one(
        {"key": key},
        {"$set": {"key": key, "body": body, "updated_at": datetime.utcnow()}},
        upsert=True,
    )


async def delete_override(key: str) -> None:
    db = get_db()
    await db.prompt_overrides.delete_one({"key": key})


async def list_overrides() -> dict[str, str]:
    """Return {key: body} for all stored overrides."""
    db = get_db()
    docs = await db.prompt_overrides.find({}).to_list(length=100)
    return {d["key"]: d["body"] for d in docs}

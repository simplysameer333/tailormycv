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
    # ── CV Builder pipeline (services/pipeline/prompts/*) ──────────────────────
    "generator_system": "Generator — System Prompt",
    "job_analyzer_system": "Job Analyzer — System Prompt",
    "anthropic_evaluator_base": "Anthropic Evaluator — Base Prompt",
    "openai_evaluator_base": "OpenAI Evaluator — Base Prompt",
    "google_evaluator_base": "Google Evaluator — Base Prompt",
    # ── CV Score (services/resume_checker_service.py) ─────────────────────────
    "cv_score_quality_system": "Quality Check — System Prompt",
    "cv_score_quality_prompt": "Quality Check — User Prompt (keep {resume_text})",
    "cv_score_extract_system": "Preview Extractor — System Prompt",
    "cv_score_extract_prompt": "Preview Extractor — User Prompt (keep {resume_text})",
    "cv_score_validate_system": "Layout Validator — System Prompt",
    "cv_score_validate_prompt": "Layout Validator — User Prompt (keep {page_count} {targets} {source_block} {resume_json})",
    "cv_score_grammar_system": "Grammar & Spelling — System Prompt",
    "cv_score_grammar_prompt": "Grammar & Spelling — User Prompt (keep {resume_text})",
}

# Which feature each prompt belongs to — drives the admin sub-tabs.
PROMPT_CATEGORIES: dict[str, str] = {
    "generator_system": "builder",
    "job_analyzer_system": "builder",
    "anthropic_evaluator_base": "builder",
    "openai_evaluator_base": "builder",
    "google_evaluator_base": "builder",
    "cv_score_quality_system": "cv_score",
    "cv_score_quality_prompt": "cv_score",
    "cv_score_extract_system": "cv_score",
    "cv_score_extract_prompt": "cv_score",
    "cv_score_validate_system": "cv_score",
    "cv_score_validate_prompt": "cv_score",
    "cv_score_grammar_system": "cv_score",
    "cv_score_grammar_prompt": "cv_score",
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

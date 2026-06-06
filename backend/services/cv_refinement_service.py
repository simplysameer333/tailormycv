"""CV Refinement — single-purpose service that improves CV text given specific issues.

One dedicated LLM call per the CLAUDE.md principle: this service's sole job is to
apply structured issues to CV text and return improved text. It never scores,
extracts, or reformats — callers must re-run check_resume() after calling this.
"""
from __future__ import annotations

import logging

from anthropic import AsyncAnthropic

from services.resume_checker_service import _cache_system

logger = logging.getLogger("tailormycv.cv_refinement")

_REFINE_SYSTEM = (
    "You are a professional CV editor. Your sole task is to apply the specific "
    "issues listed to improve the CV text. Make only the changes needed to fix "
    "each issue. Do not rewrite unrelated sections. Do not change factual claims, "
    "dates, company names, job titles, or contact details. "
    "Return the improved CV text only — no commentary, no preamble, no markdown fences."
)


def _build_issues_prompt(cv_text: str, issues: list[dict], target_score: int) -> str:
    """Build the refinement prompt from structured category issues."""
    lines = [
        f"TARGET: Improve this CV to reach a quality score of {target_score}/100.",
        "",
        "ISSUES TO FIX:",
    ]
    for item in issues:
        category = item.get("name") or item.get("key") or "General"
        improvements = item.get("improvements") or []
        if improvements:
            lines.append(f"\n[{category}]")
            for imp in improvements:
                lines.append(f"  - {imp}")

    lines += [
        "",
        "ORIGINAL CV:",
        cv_text,
        "",
        "Return ONLY the improved CV text. Apply each fix above. Change nothing else.",
    ]
    return "\n".join(lines)


async def refine_cv_text(
    cv_text: str,
    issues: list[dict],
    target_score: int,
    anthropic_key: str,
) -> str:
    """Apply structured CV issues to produce improved CV text.

    Single-purpose: improves text given issues. Does NOT score or extract.
    Callers must call check_resume() again to get the updated score.

    Args:
        cv_text: The original CV text to improve.
        issues: List of category dicts with 'name'/'key' and 'improvements' list.
        target_score: The target CV-Score to communicate intent to the model.
        anthropic_key: Anthropic API key.

    Returns:
        Improved CV text as a plain string.
    """
    if not issues:
        return cv_text

    client = AsyncAnthropic(api_key=anthropic_key)
    prompt = _build_issues_prompt(cv_text[:9000], issues, target_score)

    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4000,
        system=_cache_system(_REFINE_SYSTEM),
        messages=[{"role": "user", "content": prompt}],
    )

    refined = message.content[0].text.strip()
    if not refined:
        logger.warning("[cv_refinement] Empty response from refinement call, returning original")
        return cv_text
    return refined

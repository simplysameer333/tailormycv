"""Reviewer sub-agent — a second focused Sonnet pass on the finished draft.

The main generate→evaluate→aggregate loop is the "drafter": it iterates until
the CV-Score passes the tier threshold. This agent is the "reviewer": a fresh
LLM perspective that reads the finalised draft against the JD and returns a
targeted polish the drafter loop may have missed.

One focused Sonnet call. Runs AFTER the loop exits, before the result is
returned to the user. Adds ~5–10 s and one Sonnet output call per run.

What the reviewer focuses on (and the evaluation loop often misses):
  - FRAMING: does the summary mirror the exact language the employer uses?
  - EMPHASIS: are the JD's top must-have skills front and centre in bullets?
  - VERB PRECISION: are vague verbs ("worked on", "helped with") still present?
  - SPECIFICITY: can any achievements be made more concrete?

What the reviewer MUST NOT do:
  - Invent dates, companies, qualifications, or metrics not in the draft.
  - Remove or materially alter any locked facts.
  - Change the JSON structure or add/remove schema keys.
  - Exceed the same content length as the draft (no new sections).

Skipped when:
  - No job description (JD-specific framing is pointless without one).
  - Draft is empty or invalid.
"""
from __future__ import annotations
import json
import logging
import re

from config import settings

logger = logging.getLogger("tailormycv")

_SYSTEM = """You are a meticulous CV editor reviewing a finished draft against a specific job description.

## YOUR SOLE TASK
Improve the language, emphasis, and framing of this CV so it resonates more strongly with
THIS specific employer. Return the improved CV as the same JSON structure — no schema changes.

## WHAT TO FIX (in priority order)
1. SUMMARY — rewrite to mirror the exact vocabulary and priorities in the JD's first paragraph.
2. BULLET VERBS — replace any remaining hedging openers ("was responsible for", "helped", "worked on", "participated in", "assisted", "supported") with direct ownership verbs.
3. JD KEYWORD ALIGNMENT — if a must-have skill from the JD appears in the candidate's experience but is not mentioned in the relevant bullet, add it naturally.
4. SPECIFICITY — if a bullet says "improved performance" and the draft already has a number nearby, tighten the phrasing to use it. Do NOT invent numbers.
5. RELEVANCE PRUNING — if a bullet is clearly irrelevant to this role AND the section would still be strong without it, remove it. Never remove the only bullet in a section.

## ABSOLUTE CONSTRAINTS — NEVER VIOLATE
- DO NOT invent companies, job titles, dates, qualifications, certifications, or metrics.
- DO NOT add sections, keys, or fields not already present in the draft JSON.
- DO NOT change the candidate's name, contact details, or education facts.
- DO NOT make the resume longer — adjust existing content only.
- DO NOT use em-dashes (—) anywhere.
- DO NOT use: "passionate about", "results-driven", "detail-oriented", "dynamic",
  "team player", "proven track record", "leverage" (as a verb), "thought leader".

## OUTPUT
Return ONLY the improved resume JSON — same top-level keys, same structure. No markdown fences,
no explanation, no commentary. If you have nothing meaningful to improve, return the draft unchanged."""


class ReviewerAgent:
    """Post-pipeline reviewer: one focused Sonnet call to polish framing and emphasis."""

    async def run(self, resume_json: dict, job_description: str) -> dict | None:
        """Return an improved resume JSON, or None on failure (non-fatal)."""
        if not settings.anthropic_api_key:
            return None
        if not job_description or not isinstance(resume_json, dict):
            return None

        try:
            from langchain_anthropic import ChatAnthropic
            from langchain_core.messages import SystemMessage, HumanMessage
            from ..utils import parse_json_response

            llm = ChatAnthropic(
                model=settings.generator_model,
                api_key=settings.anthropic_api_key,
                max_tokens=3000,
                timeout=60,
                max_retries=1,
            )

            content = (
                f"## JOB DESCRIPTION\n{job_description[:3000]}\n\n"
                f"## DRAFT CV JSON\n{json.dumps(resume_json, ensure_ascii=False)}\n\n"
                "Return the improved CV JSON."
            )

            response = await llm.ainvoke([
                SystemMessage(content=_SYSTEM),
                HumanMessage(content=content),
            ])
            raw = response.content.strip()
            if raw.startswith("```"):
                raw = re.sub(r"^```(?:json)?\n?", "", raw)
                raw = re.sub(r"\n?```$", "", raw)

            reviewed = parse_json_response(raw)
            if not isinstance(reviewed, dict) or not reviewed.get("name"):
                logger.warning("[reviewer] Output failed basic schema check — keeping draft.")
                return None

            logger.info("[reviewer] Review pass complete.")
            return reviewed

        except Exception as exc:
            logger.warning("[reviewer] Review pass failed (non-fatal), keeping loop output: %s", exc)
            return None

"""Skill gap analysis — identifies matched and missing skills between candidate and JD.

Runs a single focused Haiku call. Returns:
  matched:          skills from JD that the candidate clearly has
  missing_required: required/must-have JD skills the candidate lacks
  missing_nice:     preferred/nice-to-have JD skills the candidate lacks
  match_pct:        rough percentage of JD requirements met
  tip:              one actionable sentence for the top gap

Fast and cheap (~$0.001, ~3s). Called standalone from the builder preview page
so users can see what skills to add before downloading.
"""
from __future__ import annotations
import json
import logging
import re
from config import settings

logger = logging.getLogger("tailormycv")

_SYSTEM = """You are a technical recruiter performing a skill gap analysis.

## TASK
Given a candidate's resume and a job description, identify:
1. matched_skills: skills listed in the JD (required OR preferred) that the candidate demonstrably has (max 10)
2. missing_required: skills/qualifications listed as "required", "must have", "essential", or in the role title that the candidate LACKS (max 6)
3. missing_nice_to_have: skills listed as "preferred", "nice to have", "bonus", "desirable" that the candidate lacks (max 6)
4. match_pct: integer 0-100 estimating what percentage of the JD's requirements the candidate meets
5. top_gap_tip: one specific, actionable sentence — what single skill or experience addition would most improve this application? Be concrete (e.g. "Add a Kubernetes certification or project to address the container orchestration requirement" not "Improve your technical skills").

## ABSOLUTE RULE
Only reference skills explicitly mentioned in the JD and either present/absent in the resume. No invention.

## OUTPUT
Return ONLY valid JSON — no markdown, no explanation:
{
  "matched_skills": [],
  "missing_required": [],
  "missing_nice_to_have": [],
  "match_pct": 0,
  "top_gap_tip": "string"
}"""


async def analyze_skill_gaps(resume_text: str, job_description: str) -> dict:
    """Analyze skill gaps between candidate resume and job description."""
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import SystemMessage, HumanMessage

    llm = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=settings.anthropic_api_key,
        max_tokens=600,
        timeout=25,
        max_retries=2,
    )

    content = (
        f"## CANDIDATE RESUME\n{resume_text[:4000]}\n\n"
        f"## JOB DESCRIPTION\n{job_description[:3000]}\n\n"
        "Identify matched skills and gaps. Return only JSON."
    )

    response = await llm.ainvoke([SystemMessage(content=_SYSTEM), HumanMessage(content=content)])
    raw = response.content.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)

    data = json.loads(raw)
    return {
        "matched_skills":       data.get("matched_skills") or [],
        "missing_required":     data.get("missing_required") or [],
        "missing_nice_to_have": data.get("missing_nice_to_have") or [],
        "match_pct":            int(data.get("match_pct", 0)),
        "top_gap_tip":          data.get("top_gap_tip", ""),
    }

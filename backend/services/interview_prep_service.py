"""Interview prep service — generates targeted interview questions from resume + JD.

Single focused Haiku call. Returns a FIXED set of 15 questions in a fixed mix —
10 Technical, 2 Behavioral, 2 Situational, 1 Culture Fit — each with a one-line
rationale and 2–3 key talking points. The model is instructed to produce exactly
this mix; `_enforce_distribution` then trims any category the model over-produces
so the returned set always matches the spec (it never fabricates missing ones).

Fast and cheap (~$0.002, ~5 s). Result cached on session.
"""
from __future__ import annotations
import json
import logging
import re
from config import settings

logger = logging.getLogger("tailormycv")

_SYSTEM = """You are a senior hiring manager preparing interview questions for a specific candidate.

## TASK
Given a candidate's resume and the job description, generate the 15 top questions
the interviewer IS VERY LIKELY to ask at this specific role. For each question provide:
  1. category: exactly one of "Technical", "Behavioral", "Situational", "Culture Fit"
  2. question: the exact likely question, phrased as the interviewer would ask it
  3. why_asked: one sentence — what skill, gap, or signal in the resume/JD prompts this question
  4. key_points: 2–3 short bullet strings the candidate should address in their answer

## ABSOLUTE RULES
- Every question must be traceable to something in the JD or a visible gap/strength in the resume.
- Technical questions must reference specific technologies, tools, or skills named in the JD.
- Behavioral questions must map to experiences visible (or notably absent) in the resume.
- No generic filler questions ("Where do you see yourself in 5 years?") unless the JD explicitly signals career-path focus.
- Output EXACTLY 15 questions total, in this EXACT mix: 10 Technical, 2 Behavioral, 2 Situational, 1 Culture Fit. Order them Technical first, then Behavioral, then Situational, then Culture Fit. These are the candidate's TOP 15 most-likely questions — prioritise the highest-signal ones.

## OUTPUT
Return ONLY valid JSON — no markdown fences, no explanation:
{
  "questions": [
    {
      "category": "Technical",
      "question": "...",
      "why_asked": "...",
      "key_points": ["...", "...", "..."]
    }
  ],
  "prep_tip": "One concrete action the candidate should take TODAY to feel more confident going into this interview."
}"""

# Fixed question mix the output must follow (category, count) — total 15.
_TARGET_MIX = [("Technical", 10), ("Behavioral", 2), ("Situational", 2), ("Culture Fit", 1)]


def _enforce_distribution(questions: list[dict]) -> list[dict]:
    """Trim the model output to the fixed 15-question mix (10/2/2/1).

    Validation gate: we never trust the raw count. Keeps at most the target
    number per category and orders them Technical → Behavioral → Situational →
    Culture Fit. We never fabricate questions — if the model under-delivers a
    category we return what it gave and log a warning.
    """
    by_cat: dict[str, list[dict]] = {}
    for q in questions:
        cat = (q.get("category") or "").strip()
        by_cat.setdefault(cat, []).append(q)

    ordered: list[dict] = []
    for cat, n in _TARGET_MIX:
        picked = by_cat.get(cat, [])[:n]
        if len(picked) < n:
            logger.warning("[interview_prep] %s: model returned %d of %d expected", cat, len(picked), n)
        ordered.extend(picked)
    return ordered


async def generate_interview_prep(resume_text: str, job_description: str) -> dict:
    """Generate targeted interview questions for the given resume + JD pair."""
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import SystemMessage, HumanMessage

    llm = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=settings.anthropic_api_key,
        max_tokens=3200,  # 15 questions × (question + rationale + 3 key points) needs ~2x the 8-question budget
        timeout=45,
        max_retries=2,
    )

    content = (
        f"## CANDIDATE RESUME\n{resume_text[:4000]}\n\n"
        f"## JOB DESCRIPTION\n{job_description[:3000]}\n\n"
        "Generate targeted interview questions. Return only JSON."
    )

    response = await llm.ainvoke([SystemMessage(content=_SYSTEM), HumanMessage(content=content)])
    raw = response.content.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)

    data = json.loads(raw)
    return {
        "questions": _enforce_distribution(data.get("questions") or []),
        "prep_tip": data.get("prep_tip", ""),
    }

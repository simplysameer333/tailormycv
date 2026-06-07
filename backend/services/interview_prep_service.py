"""Interview prep service — generates targeted interview questions from resume + JD.

Single focused Haiku call. Returns 6–8 questions organised by category
(Technical, Behavioral, Situational, Culture Fit), each with a one-line
rationale and 2–3 key talking points.

Fast and cheap (~$0.001, ~3 s). Result cached on session.
"""
from __future__ import annotations
import json
import logging
import re
from config import settings

logger = logging.getLogger("tailormycv")

_SYSTEM = """You are a senior hiring manager preparing interview questions for a specific candidate.

## TASK
Given a candidate's resume and the job description, generate 6–8 targeted questions
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
- Output 6–8 questions total. Aim for: 2–3 Technical, 2 Behavioral, 1–2 Situational, 1 Culture Fit.

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


async def generate_interview_prep(resume_text: str, job_description: str) -> dict:
    """Generate targeted interview questions for the given resume + JD pair."""
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import SystemMessage, HumanMessage

    llm = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=settings.anthropic_api_key,
        max_tokens=1400,
        timeout=30,
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
        "questions": data.get("questions") or [],
        "prep_tip": data.get("prep_tip", ""),
    }

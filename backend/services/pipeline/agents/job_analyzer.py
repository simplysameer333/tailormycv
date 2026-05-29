"""JobAnalyzerAgent — extracts the top-N skills to emphasise in the generated resume.

Runs once before the generator-evaluator loop. Its output (a ranked list of skills)
is injected into the generator prompt so every cycle stays focused on what matters
most for this specific role.

Skill count is driven by the user's subscription tier:
    Free  →  3 skills   (SKILL_EXTRACTION_COUNT=3 in .env)
    Plus  →  5 skills   (SKILL_EXTRACTION_COUNT=5)
    Pro   → 10 skills   (SKILL_EXTRACTION_COUNT=10)
"""
from __future__ import annotations

from .base import BaseAgent
from ..prompts.anthropic import job_analyzer_messages
from ..utils import parse_json_response
from config import settings


class JobAnalyzerAgent(BaseAgent):
    """Analyses the job description against the candidate profile and returns
    the top-N skills/items the generator should prioritise.

    Uses the same Anthropic model as the generator so no extra API key is needed.
    Runs once per generate request — not inside the evaluation loop — keeping
    the added cost to a single LLM call.
    """

    name = "job_analyzer"

    def _model(self):
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=settings.generator_model,
            api_key=settings.anthropic_api_key,
            max_tokens=512,
        )

    async def run(
        self,
        resume_text: str,
        user_profile: dict,
        job_description: str,
        n: int | None = None,
    ) -> list[str]:
        """Return a list of exactly n key skills ranked by relevance to the role.

        Falls back to an empty list on any error so the pipeline is never blocked
        by a failed skill extraction.
        """
        count = n if n is not None else settings.skill_extraction_count
        try:
            messages = await job_analyzer_messages(resume_text, user_profile, job_description, count)
            response = await self._model().ainvoke(messages)
            skills = parse_json_response(response.content)
            if isinstance(skills, list):
                return [str(s) for s in skills[:count]]
        except Exception:
            pass
        return []

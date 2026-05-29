from __future__ import annotations
from .base import BaseAgent
from ..prompts.anthropic import generator_messages, section_messages
from ..utils import parse_json_response
from config import settings


class GeneratorAgent(BaseAgent):
    """Writes a tailored resume JSON from candidate inputs.

    Two entry points:
    - run()          — full resume generation, called each cycle by the LangGraph pipeline.
                       Accepts optional aggregator feedback to address evaluator suggestions.
    - run_section()  — single-section regeneration, bypasses the evaluation pipeline entirely.

    Both accept profession_config so prompts are tailored to the candidate's target profession,
    and key_skills so the job-analyzer's pre-selected priorities are injected into every cycle.
    Model is read from settings.generator_model — swap it in .env with no code changes.
    """

    name = "generator"

    def _model(self):
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=settings.generator_model,
            api_key=settings.anthropic_api_key,
            max_tokens=4096,
        )

    async def run(
        self,
        resume_text: str,
        user_profile: dict,
        job_description: str,
        tone: str,
        profession_config: dict,
        locked_facts: list | None = None,
        key_skills: list | None = None,
        sample_cv_text: str | None = None,
        feedback: str | None = None,
    ) -> dict:
        messages = await generator_messages(
            resume_text, user_profile, job_description, tone, feedback,
            profession_config, locked_facts or [], key_skills or [], sample_cv_text,
        )
        response = await self._model().ainvoke(messages)
        return parse_json_response(response.content)

    async def run_section(
        self,
        resume_text: str,
        user_profile: dict,
        job_description: str,
        tone: str,
        section: str,
        existing_resume: dict,
        profession_config: dict,
        locked_facts: list | None = None,
        key_skills: list | None = None,
        sample_cv_text: str | None = None,
    ) -> dict:
        messages = await section_messages(
            resume_text, user_profile, job_description, tone, section,
            existing_resume, profession_config, locked_facts or [], key_skills or [],
            sample_cv_text,
        )
        response = await self._model().ainvoke(messages)
        return parse_json_response(response.content)

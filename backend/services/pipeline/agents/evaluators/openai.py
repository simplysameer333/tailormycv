from __future__ import annotations
from .base import BaseEvaluatorAgent
from ...prompts.openai import openai_evaluator_messages
from ...utils import parse_json_response
from ...telemetry import record as record_usage
from config import settings


class OpenAIEvaluatorAgent(BaseEvaluatorAgent):
    """Evaluator backed by the OpenAI API.

    Scoring criteria and evaluation lens are profession-specific — passed in
    via profession_config so the same evaluator can serve any role.
    Swap the model by setting OPENAI_EVALUATOR_MODEL in .env — no code changes.
    """

    name = "openai"

    @property
    def is_configured(self) -> bool:
        return bool(settings.openai_api_key)

    def _model(self):
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=settings.openai_evaluator_model,
            api_key=settings.openai_api_key,
            max_tokens=1024,
            max_retries=0,
            timeout=30,
        )

    async def run(self, resume_json: dict, job_description: str, profession_config: dict, source_resume_text: str = "") -> dict:
        try:
            messages = await openai_evaluator_messages(resume_json, job_description, profession_config, source_resume_text)
            response = await self._model().ainvoke(messages)
            record_usage(settings.openai_evaluator_model, self.name, response)
            result = parse_json_response(response.content)
            return {"model": self.name, "score": int(result["score"]), "suggestions": result.get("suggestions", [])}
        except Exception as exc:
            return {"model": self.name, "score": None, "suggestions": [f"Evaluator error: {exc}"]}

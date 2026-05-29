from __future__ import annotations
from .base import BaseEvaluatorAgent
from ...prompts.google import google_evaluator_messages
from ...utils import parse_json_response
from config import settings


class GoogleEvaluatorAgent(BaseEvaluatorAgent):
    """Evaluator backed by the Google Gemini API.

    Scoring criteria and evaluation lens are profession-specific — passed in
    via profession_config so the same evaluator can serve any role.
    Swap the model by setting GOOGLE_EVALUATOR_MODEL in .env — no code changes.
    """

    name = "google"

    @property
    def is_configured(self) -> bool:
        return bool(settings.google_api_key)

    def _model(self):
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=settings.google_evaluator_model,
            google_api_key=settings.google_api_key,
            max_output_tokens=1024,
        )

    async def run(self, resume_json: dict, job_description: str, profession_config: dict) -> dict:
        try:
            messages = await google_evaluator_messages(resume_json, job_description, profession_config)
            response = await self._model().ainvoke(messages)
            result = parse_json_response(response.content)
            return {"model": self.name, "score": int(result["score"]), "suggestions": result.get("suggestions", [])}
        except Exception as exc:
            return {"model": self.name, "score": 0, "suggestions": [f"Evaluator error: {exc}"]}

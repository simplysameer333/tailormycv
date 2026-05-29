"""Prompts for all LLM calls made to the OpenAI API.

Covers:
  - OpenAIEvaluatorAgent.run() — resume scoring via GPT

Accepts `profession_config` to tailor scoring criteria and evaluation lens
per profession. Pass an empty dict to use baseline generic prompts.
"""
from __future__ import annotations
from langchain_core.messages import SystemMessage, HumanMessage
from ..toon import encode as toon_encode, TOON_LEGEND

_OPENAI_EVALUATOR_BASE = """You are an expert resume reviewer. You will be given a candidate's resume and a job description. Your task is to score how well the resume matches the job.

{scoring_criteria}

{evaluator_context}
Return ONLY a valid JSON object — no preamble, no markdown:
{{"score": 0, "suggestions": ["string"]}}"""


async def openai_evaluator_messages(
    resume_json: dict,
    job_description: str,
    profession_config: dict,
) -> list:
    from .professions.generic import CONFIG as GENERIC_CONFIG
    scoring = profession_config.get("scoring_criteria") or GENERIC_CONFIG["scoring_criteria"]
    eval_ctx = profession_config.get("evaluator_context", "")
    eval_ctx_block = f"{eval_ctx}\n\n" if eval_ctx else ""
    try:
        from services.prompt_store import get_override
        override = await get_override("openai_evaluator_base")
        base = override if override else _OPENAI_EVALUATOR_BASE
    except Exception:
        base = _OPENAI_EVALUATOR_BASE
    system = (TOON_LEGEND + "\n\n" + base).format(
        scoring_criteria=scoring,
        evaluator_context=eval_ctx_block,
    )
    content = (
        f"## RESUME\n{toon_encode(resume_json)}\n\n"
        f"## JOB DESCRIPTION\n{job_description}"
    )
    return [SystemMessage(content=system), HumanMessage(content=content)]

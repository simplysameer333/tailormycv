"""LangGraph node functions — thin orchestration wrappers only.

Each function delegates all logic to the corresponding agent.
Nodes are kept minimal intentionally: routing, state shaping, and
timing belong here; business logic belongs in the agent files.

Cost note: MAX_CYCLES and the evaluator enabled flags are read from
settings so they can be changed in .env without touching code.
"""

from __future__ import annotations
import asyncio
from datetime import datetime

from config import settings
from .state import PipelineState
from .agents.generator import GeneratorAgent
from .agents.aggregator import AggregatorAgent
from .agents.evaluators import EVALUATOR_REGISTRY

_generator = GeneratorAgent()
_aggregator = AggregatorAgent()

# Global fallback evaluator flags — used only when no per-request tier is set.
# In practice every authenticated request now passes enabled_evaluators via state.
_EVALUATOR_ENABLED_FALLBACK: dict[str, bool] = {
    "anthropic": settings.anthropic_evaluator_enabled,
    "openai": settings.openai_evaluator_enabled,
    "google": settings.google_evaluator_enabled,
}


async def generate_node(state: PipelineState) -> dict:
    """Call the GeneratorAgent and return the produced resume JSON."""
    resume_json = await _generator.run(
        resume_text=state["resume_text"],
        user_profile=state["user_profile"],
        job_description=state["job_description"],
        tone=state["tone"],
        profession_config=state["profession_config"],
        locked_facts=state.get("locked_facts") or [],
        key_skills=state.get("key_skills") or [],
        sample_cv_text=state.get("sample_cv_text"),
        feedback=state.get("feedback"),
    )
    return {"resume_json": resume_json}


async def evaluate_node(state: PipelineState) -> dict:
    """Run all active evaluators concurrently with profession-aware scoring.

    An evaluator is active when:
      1. Its API key is present (is_configured).
      2. Its feature flag is True in settings (*_evaluator_enabled).
      3. The profession config's evaluator_names list includes it (or is empty).

    Throughput note: asyncio.gather dispatches all active evaluator calls in
    parallel, so total latency ≈ slowest single evaluator, not the sum.
    Evaluators that raise an exception return score=0 rather than crashing
    the pipeline.
    """
    # Per-request enabled map (set by generate router from user tier) or global fallback
    tier_enabled: dict[str, bool] = state.get("enabled_evaluators") or _EVALUATOR_ENABLED_FALLBACK
    profession_allowed = state["profession_config"].get("evaluator_names") or []
    active = [
        e for e in EVALUATOR_REGISTRY
        if e.is_configured
        and tier_enabled.get(e.name, False)
        and (not profession_allowed or e.name in profession_allowed)
    ]
    eval_results = list(
        await asyncio.gather(*[
            e.run(state["resume_json"], state["job_description"], state["profession_config"])
            for e in active
        ])
    )
    return {"eval_results": eval_results}


async def aggregate_node(state: PipelineState) -> dict:
    """Consolidate evaluator results and decide pass/fail for this cycle."""
    aggregated = _aggregator.run(
        state["eval_results"],
        state["profession_config"],
        pass_threshold=state.get("pass_threshold"),
    )
    cycle_record = {
        "cycle": state["cycle"] + 1,
        "profession": state["profession_config"].get("slug", "generic"),
        "evaluator_results": aggregated["evaluator_results"],
        "min_score": aggregated["min_score"],
        "all_passed": aggregated["all_passed"],
        "timestamp": datetime.utcnow().isoformat(),
    }
    return {
        "cycle": state["cycle"] + 1,
        "all_passed": aggregated["all_passed"],
        "min_score": aggregated["min_score"],
        "feedback": aggregated["feedback_prompt"] if not aggregated["all_passed"] else None,
        "eval_history": [cycle_record],
    }


def should_continue(state: PipelineState) -> str:
    """Routing function: loop back to generator or exit the graph.

    Exits when all evaluators pass OR the per-session max cycles is reached.
    MAX_EVAL_CYCLES comes from settings so it can be tuned in .env.
    """
    if state["all_passed"] or state["cycle"] >= settings.max_eval_cycles:
        return "end"
    return "generate"

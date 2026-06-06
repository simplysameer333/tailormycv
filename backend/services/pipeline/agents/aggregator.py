from __future__ import annotations
from .base import BaseAgent
from config import settings


class AggregatorAgent(BaseAgent):
    """Consolidates evaluator results into a pass/fail decision and a feedback prompt.

    Fully synchronous and side-effect free — input in, output out.
    The feedback_prompt is injected into the next generation cycle so the
    GeneratorAgent can address every evaluator suggestion before re-generating.

    profession_config.aggregator_context is prepended to the feedback so the
    generator knows which profession-specific improvements to prioritise.

    Scalability note
    ----------------
    Because this agent is pure computation (no I/O), it adds zero latency to the
    pipeline and can run inline without a separate thread or process.
    """

    name = "aggregator"

    def run(
        self,
        evaluator_results: list[dict],
        profession_config: dict,
        pass_threshold: int | None = None,
        prior_seen_suggestions: list[str] | None = None,
    ) -> dict:
        threshold = pass_threshold if pass_threshold is not None else settings.pass_threshold
        # Skip evaluators that returned None (infrastructure failure — not a quality signal).
        valid_results = [r for r in evaluator_results if r.get("score") is not None]
        scores = [r["score"] for r in valid_results]
        min_score = min(scores) if scores else 0
        all_passed = bool(scores) and all(s >= threshold for s in scores)

        lines = []

        # Profession-specific guidance comes first so the generator prioritises correctly.
        agg_ctx = profession_config.get("aggregator_context", "")
        if agg_ctx:
            lines.append(f"## PROFESSION-SPECIFIC IMPROVEMENT PRIORITIES\n{agg_ctx}\n")

        lines.append("## EVALUATOR FEEDBACK")
        prior_seen: set[str] = set(prior_seen_suggestions or [])
        new_seen: list[str] = []
        for r in evaluator_results:
            score_display = r["score"] if r.get("score") is not None else "error"
            lines.append(f"\n**{r['model'].upper()} (score: {score_display}/100):**")
            for suggestion in r.get("suggestions", []):
                if suggestion not in prior_seen:
                    prior_seen.add(suggestion)
                    new_seen.append(suggestion)
                    lines.append(f"- {suggestion}")

        return {
            "all_passed": all_passed,
            "min_score": min_score,
            "feedback_prompt": "\n".join(lines),
            "evaluator_results": evaluator_results,
            "new_seen_suggestions": new_seen,
        }

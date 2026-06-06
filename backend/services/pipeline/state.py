"""Pipeline state definition for the LangGraph evaluator-optimizer graph.

PipelineState is passed between every node and returned by pipeline.ainvoke().
LangGraph handles serialisation; all values must be JSON-compatible.
Fields annotated with operator.add are automatically appended across cycles
rather than replaced — used for eval_history to accumulate per-cycle records.
"""
from __future__ import annotations
from typing import Optional, Annotated, TypedDict
import operator


class PipelineState(TypedDict):
    # ── inputs (set once before graph runs) ──────────────────────────────────
    resume_text: str
    user_profile: dict
    job_description: str
    tone: str
    # Profession config resolved from user_profile.target_role before the
    # pipeline starts. All nodes read from here — no DB calls inside the loop.
    profession_config: dict
    # Facts the user has locked — the generator must preserve these verbatim.
    # Populated once from the session before the graph runs.
    locked_facts: list
    # Top-N skills/items extracted by JobAnalyzerAgent before the pipeline loop.
    # Injected into the generator prompt as prioritisation hints.
    key_skills: list
    # Parsed text of a sample CV uploaded by the user as a formatting reference.
    # The generator mirrors its structure — content is never copied.
    sample_cv_text: Optional[str]
    # ── cycle bookkeeping ─────────────────────────────────────────────────────
    cycle: int
    feedback: Optional[str]
    # ── per-cycle outputs (replaced each cycle) ───────────────────────────────
    resume_json: Optional[dict]
    eval_results: list
    # ── best-so-far across cycles ─────────────────────────────────────────────
    # The refinement loop is NON-MONOTONIC — a later cycle can score lower than an
    # earlier one. We track the highest-scoring cycle and return THAT, never the
    # last cycle, so more cycles can only help, never hurt.
    best_resume_json: Optional[dict]
    best_min_score: int
    # Score gain of the most recent cycle over the prior best (can be negative).
    # Drives the plateau early-exit in should_continue.
    last_gain: int
    # ── accumulated across cycles (operator.add auto-appends) ─────────────────
    eval_history: Annotated[list, operator.add]
    # Suggestions already surfaced to the generator in prior cycles. operator.add
    # accumulates them so the aggregator can skip repeats across cycles.
    seen_suggestions: Annotated[list, operator.add]
    # ── aggregated decision ───────────────────────────────────────────────────
    all_passed: bool
    min_score: int
    # ── per-request evaluator selection ──────────────────────────────────────
    # Set by the generate router based on the user's subscription tier so each
    # request runs only the evaluators their tier is entitled to.
    # Keys are evaluator names ("anthropic", "openai", "google"); value is bool.
    # Falls back to the global _EVALUATOR_ENABLED dict in nodes.py when absent.
    enabled_evaluators: dict
    # ── tier-aware pass threshold ─────────────────────────────────────────────
    # Minimum score all evaluators must reach before exiting the loop.
    # Free=75, Plus=80, Pro=90 — higher tiers run more refinement cycles so a
    # built resume comfortably passes our own CV Score.
    pass_threshold: int
    # ── template page constraint ──────────────────────────────────────────────
    # Number of A4 pages the selected template is designed for (1 or 2).
    # The generator uses this as a hard content-length constraint.
    template_pages: int
    # ── per-request max refinement cycles (tier-aware) ────────────────────────
    # Set by the generate router from the user's tier so higher tiers get more
    # attempts to reach their (higher) pass threshold. Falls back to
    # settings.max_eval_cycles when absent.
    max_cycles: int

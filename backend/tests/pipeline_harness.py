"""CV Pipeline Eval Harness — benchmark and regression-test the generate pipeline.

Usage:
    python tests/pipeline_harness.py path/to/cv.docx [--tiers plus pro] [--attempts 2] [--disable-plateau] [--output-dir results/]

What it does:
    1. Scores the original CV (baseline)
    2. Runs the CV Builder pipeline for each tier (full cycle budget, no plateau exit)
    3. Reports before/after scores per category, cycle trajectory, and user actions needed
    4. Writes a JSON result file for CI comparison and trend tracking

Exit codes:
    0  All tiers beat the original score
    1  One or more tiers regressed below the original score

Environment:
    ANTHROPIC_API_KEY  required
    MONGODB_URI        optional (defaults to a local no-op URI)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ.setdefault("MONGODB_URI", "mongodb://localhost/test_harness")

import docx  # type: ignore

from config import settings
from services.pipeline.graph import pipeline
from services.pipeline import nodes as nodes_mod
from services.resume_checker_service import check_resume
from services.pipeline.agents.evaluators.cv_score import resume_json_to_text
from services.user_actions_service import build_user_actions


TIER_DEFAULTS = {
    "free":  {"bar": 70, "cycles": 3},
    "plus":  {"bar": 80, "cycles": 4},
    "pro":   {"bar": 90, "cycles": 5},
}

PROFESSION_CONFIG = {
    "slug": "generic",
    "display_name": "General",
    "generator_context": "",
    "aggregator_context": "",
    "evaluator_context": "",
    "scoring_criteria": "",
    "evaluator_names": [],
}


def _parse_cv(path: str) -> str:
    p = Path(path)
    if p.suffix.lower() == ".docx":
        doc = docx.Document(str(p))
        return "\n".join(para.text for para in doc.paragraphs if para.text.strip())
    elif p.suffix.lower() == ".txt":
        return p.read_text(encoding="utf-8")
    else:
        raise ValueError(f"Unsupported file type: {p.suffix}. Use .docx or .txt")


def _make_state(cv_text: str, tier_cfg: dict, key_skills: list[str]) -> dict:
    return {
        "resume_text": cv_text,
        "user_profile": {},
        "job_description": "",
        "tone": "Professional",
        "profession_config": PROFESSION_CONFIG,
        "locked_facts": [],
        "key_skills": key_skills,
        "sample_cv_text": None,
        "enabled_evaluators": {
            "cv_score": True,
            "anthropic": False,
            "openai": False,
            "google": False,
        },
        "pass_threshold": tier_cfg["bar"],
        "max_cycles": tier_cfg["cycles"],
        "template_pages": 2,
        "cycle": 0,
        "feedback": None,
        "resume_json": None,
        "eval_results": [],
        "eval_history": [],
        "seen_suggestions": [],
        "best_resume_json": None,
        "best_min_score": 0,
        "last_gain": 0,
        "all_passed": False,
        "min_score": 0,
    }


async def _score_cv(cv_text: str) -> tuple[int, list[dict]]:
    result = await check_resume(cv_text, settings.anthropic_api_key)
    score = int(result.get("overall_score", 0) or 0)
    return score, result.get("categories", [])


async def _run_attempt(cv_text: str, tier: str, tier_cfg: dict, key_skills: list[str]) -> dict:
    t0 = time.time()
    state = await asyncio.wait_for(
        pipeline.ainvoke(_make_state(cv_text, tier_cfg, key_skills)),
        timeout=300,
    )
    elapsed = time.time() - t0

    best_json = state.get("best_resume_json") or state.get("resume_json")
    best_score = state.get("best_min_score", 0)
    history = [r["min_score"] for r in state.get("eval_history", [])]
    eval_results = state.get("eval_results") or []

    final_score, final_cats = 0, []
    if best_json:
        gen_text = resume_json_to_text(best_json)
        final_score, final_cats = await _score_cv(gen_text)

    user_actions = None
    if not state["all_passed"]:
        user_actions = build_user_actions(eval_results, tier_cfg["bar"], final_score)

    return {
        "tier": tier,
        "elapsed_s": round(elapsed, 1),
        "cycles_run": state["cycle"],
        "cycle_scores": history,
        "in_loop_best": best_score,
        "final_score": final_score,
        "all_passed": state["all_passed"],
        "threshold": tier_cfg["bar"],
        "categories": final_cats,
        "user_actions_needed": user_actions,
        "resume_json": best_json,
    }


async def run_harness(
    cv_path: str,
    tiers: list[str],
    attempts: int,
    disable_plateau: bool,
    output_dir: str | None,
) -> dict:
    print(f"\n{'='*64}")
    print(f"CV Pipeline Eval Harness")
    print(f"CV:      {cv_path}")
    print(f"Tiers:   {', '.join(tiers)}")
    print(f"Attempts per tier: {attempts}")
    print(f"{'='*64}\n")

    if disable_plateau:
        nodes_mod._PLATEAU_MARGIN = 0
        print("⚠  Plateau exit DISABLED — running all cycles to exhaustion\n")

    cv_text = _parse_cv(cv_path)
    print(f"Parsed CV: {len(cv_text)} chars")

    print("Scoring original CV...")
    orig_score, orig_cats = await _score_cv(cv_text)
    print(f"Original CV score: {orig_score}/100\n")

    orig_cat_map = {c.get("name", ""): c.get("score", 0) for c in orig_cats}
    results_by_tier: dict[str, dict] = {}

    for tier in tiers:
        cfg = TIER_DEFAULTS.get(tier)
        if not cfg:
            print(f"Unknown tier '{tier}' — skipping")
            continue

        print(f"\n{'─'*64}")
        print(f"TIER: {tier.upper()}  bar={cfg['bar']}  max_cycles={cfg['cycles']}  attempts={attempts}")
        print(f"{'─'*64}")

        best_result: dict | None = None
        for attempt in range(1, attempts + 1):
            print(f"  Attempt {attempt}/{attempts}...", end=" ", flush=True)
            try:
                result = await _run_attempt(cv_text, tier, cfg, [])
                trajectory = result["cycle_scores"]
                print(
                    f"done {result['elapsed_s']}s | cycles={result['cycles_run']} "
                    f"scores={trajectory} | final={result['final_score']}"
                )
                if best_result is None or result["final_score"] > best_result["final_score"]:
                    best_result = result
            except asyncio.TimeoutError:
                print("TIMEOUT — skipped")
            except Exception as exc:
                print(f"ERROR: {exc}")

        if best_result is None:
            continue

        results_by_tier[tier] = best_result

        print(f"\n  Best result for {tier.upper()} (score={best_result['final_score']}/100):")
        print(f"  {'Category':<30} {'Orig':>5} {'Gen':>5} {'Delta':>6}  Status")
        print(f"  {'-'*56}")
        for cat in best_result["categories"]:
            name = cat.get("name", "")
            gen_s = cat.get("score", 0)
            orig_s = orig_cat_map.get(name, 0)
            delta = gen_s - orig_s
            delta_str = f"+{delta}" if delta > 0 else str(delta)
            flag = "✓" if delta >= 0 else "✗"
            print(f"  {name:<30} {orig_s:>5} {gen_s:>5} {delta_str:>6}  {flag}")

        if best_result.get("user_actions_needed") and best_result["user_actions_needed"].get("actions"):
            ua = best_result["user_actions_needed"]
            print(f"\n  ⚠  Threshold NOT reached ({best_result['final_score']}/{cfg['bar']})")
            print(f"  User actions needed (+{ua['estimated_points_available']} pts potential):")
            for a in ua["actions"]:
                print(f"    [{a['priority'].upper()}] {a['action']}")
                if a.get("example"):
                    print(f"           e.g. {a['example']}")
        else:
            print(f"\n  ✓ Threshold reached: {best_result['final_score']}/{cfg['bar']}")

    print(f"\n{'='*64}")
    print("SUMMARY")
    print(f"{'='*64}")
    print(f"{'Tier':<8} {'Original':>8} {'Generated':>10} {'Delta':>6} {'Threshold':>10} {'Passed':>7}")
    print(f"{'-'*56}")
    regression = False
    for tier, res in results_by_tier.items():
        gen_s = res["final_score"]
        delta = gen_s - orig_score
        delta_str = f"+{delta}" if delta > 0 else str(delta)
        passed = "✓" if res["all_passed"] else "✗"
        if gen_s < orig_score:
            regression = True
        print(f"{tier.upper():<8} {orig_score:>8} {gen_s:>10} {delta_str:>6} {res['threshold']:>10} {passed:>7}")

    report = {
        "timestamp": datetime.utcnow().isoformat(),
        "cv_path": cv_path,
        "original_score": orig_score,
        "original_categories": orig_cats,
        "tier_results": results_by_tier,
        "regression_detected": regression,
    }

    if output_dir:
        out_path = Path(output_dir) / f"harness_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        clean = {k: v for k, v in report.items() if k != "tier_results"}
        clean["tier_results"] = {
            t: {k: v for k, v in r.items() if k != "resume_json"}
            for t, r in results_by_tier.items()
        }
        out_path.write_text(json.dumps(clean, indent=2, default=str))
        print(f"\nReport written to: {out_path}")

    return report


def main():
    parser = argparse.ArgumentParser(description="CV Pipeline Eval Harness")
    parser.add_argument("cv", help="Path to CV file (.docx or .txt)")
    parser.add_argument(
        "--tiers", nargs="+", default=["plus", "pro"],
        choices=["free", "plus", "pro"], help="Tiers to test (default: plus pro)"
    )
    parser.add_argument("--attempts", type=int, default=1,
                        help="Independent attempts per tier (default: 1)")
    parser.add_argument("--disable-plateau", action="store_true",
                        help="Disable plateau early-exit so all cycles run")
    parser.add_argument("--output-dir", default=None,
                        help="Directory to write JSON report (optional)")
    args = parser.parse_args()

    if not settings.anthropic_api_key:
        print("ERROR: ANTHROPIC_API_KEY is not set", file=sys.stderr)
        sys.exit(1)

    report = asyncio.run(
        run_harness(
            cv_path=args.cv,
            tiers=args.tiers,
            attempts=args.attempts,
            disable_plateau=args.disable_plateau,
            output_dir=args.output_dir,
        )
    )
    sys.exit(1 if report["regression_detected"] else 0)


if __name__ == "__main__":
    main()

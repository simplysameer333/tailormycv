"""Export harness run results to a LangSmith golden dataset.

Usage:
    python tests/export_to_langsmith.py path/to/harness/reports/ [--dataset NAME]

What it does:
    Reads all harness JSON reports in the given directory and uploads each
    tier result as an example to a LangSmith dataset. Run after a harness
    session to grow your golden dataset from real pipeline executions.

    Each example stores:
      inputs:   cv_path, tier, original_score
      outputs:  final_score, all_passed, cycle_scores, categories
      metadata: timestamp, cycles_run, threshold, regression_detected

Requirements:
    LANGSMITH_API_KEY must be set in the environment.

Exit codes:
    0  All reports exported successfully
    1  LANGSMITH_API_KEY not set or export failed
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


DATASET_NAME_DEFAULT = "tailormycv-golden"


def _load_reports(reports_dir: str) -> list[dict]:
    """Load all harness JSON report files from a directory."""
    paths = sorted(Path(reports_dir).glob("harness_*.json"))
    if not paths:
        print(f"No harness_*.json files found in {reports_dir}")
        sys.exit(0)
    reports = []
    for p in paths:
        try:
            reports.append(json.loads(p.read_text()))
        except Exception as exc:
            print(f"  Skipping {p.name}: {exc}")
    return reports


def export(reports_dir: str, dataset_name: str) -> None:
    api_key = os.environ.get("LANGSMITH_API_KEY", "")
    if not api_key:
        print("ERROR: LANGSMITH_API_KEY is not set.", file=sys.stderr)
        sys.exit(1)

    try:
        from langsmith import Client
    except ImportError:
        print("ERROR: langsmith package not installed. Run: pip install langsmith", file=sys.stderr)
        sys.exit(1)

    client = Client(api_key=api_key)

    # Get or create the dataset
    datasets = {d.name: d for d in client.list_datasets()}
    if dataset_name in datasets:
        dataset = datasets[dataset_name]
        print(f"Using existing dataset: {dataset_name} (id={dataset.id})")
    else:
        dataset = client.create_dataset(
            dataset_name=dataset_name,
            description=(
                "Golden examples from TailorMyCV pipeline harness runs. "
                "Each example is a real CV processed through the generate pipeline. "
                "Used as regression baseline and LLM-as-a-Judge evaluation set."
            ),
        )
        print(f"Created dataset: {dataset_name} (id={dataset.id})")

    reports = _load_reports(reports_dir)
    uploaded = 0

    for report in reports:
        for tier, result in (report.get("tier_results") or {}).items():
            inputs = {
                "cv_path":        report.get("cv_path", ""),
                "tier":           tier,
                "original_score": report.get("original_score", 0),
            }
            outputs = {
                "final_score":   result.get("final_score", 0),
                "all_passed":    result.get("all_passed", False),
                "cycle_scores":  result.get("cycle_scores", []),
                "categories":    result.get("categories", []),
                "threshold":     result.get("threshold", 0),
            }
            metadata = {
                "timestamp":            report.get("timestamp", ""),
                "cycles_run":           result.get("cycles_run", 0),
                "regression_detected":  report.get("regression_detected", False),
            }
            client.create_example(
                inputs=inputs,
                outputs=outputs,
                metadata=metadata,
                dataset_id=dataset.id,
            )
            uploaded += 1
            print(
                f"  + {tier.upper()} | orig={inputs['original_score']} "
                f"→ final={outputs['final_score']} | passed={outputs['all_passed']}"
            )

    print(f"\nUploaded {uploaded} example(s) to dataset '{dataset_name}'.")
    print(f"View at: https://smith.langchain.com/datasets/{dataset.id}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export harness results to LangSmith")
    parser.add_argument("reports_dir", help="Directory containing harness_*.json files")
    parser.add_argument(
        "--dataset", default=DATASET_NAME_DEFAULT,
        help=f"LangSmith dataset name (default: {DATASET_NAME_DEFAULT})"
    )
    args = parser.parse_args()
    export(args.reports_dir, args.dataset)


if __name__ == "__main__":
    main()

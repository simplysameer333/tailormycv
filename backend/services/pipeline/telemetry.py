"""Per-request LLM telemetry — call count, token usage, and estimated cost.

A resume generation fans out into many LLM calls (1 job-analyzer + per cycle:
1 generator + N evaluators, across up to several refine cycles). To answer
"how many calls / how much did this cost" we accumulate usage for every call in
the request and summarise it once at the end.

Design
------
- A contextvar holds a per-request list of call records. asyncio.gather copies
  the context into each child task but the *list object* is shared, so usage
  recorded inside concurrently-gathered evaluators still lands in the same
  bucket. start_capture() resets it at the top of a request.
- record() is called right after each agent's ainvoke; it pulls usage_metadata
  off the LangChain response (provider-agnostic) and estimates cost.
- summary() collapses the bucket into a flat dict suitable for logging, session
  persistence, and the admin audit log.

Pure/deterministic helpers (estimate_cost, _rate_for, _extract_usage) are kept
free of I/O so they unit-test directly.
"""
from __future__ import annotations
import contextvars

# USD per 1,000,000 tokens. ESTIMATES — update when vendor pricing changes.
# Matched by substring against the configured model name so .env model swaps
# still price correctly. Order matters: more specific keys first (gpt-4o-mini
# before gpt-4o). Anthropic adds cache read/write rates; others reuse `in`.
_PRICING: dict[str, dict[str, float]] = {
    "gpt-4o-mini":      {"in": 0.15, "out": 0.60,  "cache_read": 0.075, "cache_write": 0.15},
    "gpt-4o":           {"in": 2.50, "out": 10.00, "cache_read": 1.25,  "cache_write": 2.50},
    "gemini-2.5-flash": {"in": 0.30, "out": 2.50,  "cache_read": 0.075, "cache_write": 0.30},
    "gemini":           {"in": 0.30, "out": 2.50,  "cache_read": 0.075, "cache_write": 0.30},
    "haiku":            {"in": 1.00, "out": 5.00,  "cache_read": 0.10,  "cache_write": 1.25},
    "sonnet":           {"in": 3.00, "out": 15.00, "cache_read": 0.30,  "cache_write": 3.75},
    "opus":             {"in": 15.00, "out": 75.00, "cache_read": 1.50, "cache_write": 18.75},
}
_DEFAULT_RATE = {"in": 3.00, "out": 15.00, "cache_read": 0.30, "cache_write": 3.75}

_calls: contextvars.ContextVar = contextvars.ContextVar("llm_calls", default=None)


def _rate_for(model: str) -> dict[str, float]:
    m = (model or "").lower()
    for key, rate in _PRICING.items():
        if key in m:
            return rate
    return _DEFAULT_RATE


def estimate_cost(model: str, input_tokens: int, output_tokens: int,
                  cache_read: int = 0, cache_creation: int = 0) -> float:
    """Estimated USD cost of one call. Cached input is billed at the cheaper rate."""
    r = _rate_for(model)
    fresh_input = max(input_tokens - cache_read - cache_creation, 0)
    total = (
        fresh_input * r["in"]
        + cache_read * r["cache_read"]
        + cache_creation * r["cache_write"]
        + output_tokens * r["out"]
    )
    return total / 1_000_000


def _extract_usage(response) -> tuple[int, int, int, int]:
    """Pull (input, output, cache_read, cache_creation) tokens off a LangChain response.

    usage_metadata is normalised across providers; input_token_details carries the
    Anthropic cache breakdown (absent → zeros for OpenAI/Google).
    """
    um = getattr(response, "usage_metadata", None) or {}
    details = um.get("input_token_details", {}) or {}
    return (
        int(um.get("input_tokens", 0) or 0),
        int(um.get("output_tokens", 0) or 0),
        int(details.get("cache_read", 0) or 0),
        int(details.get("cache_creation", 0) or 0),
    )


def start_capture() -> None:
    """Begin a fresh per-request capture. Call once before the pipeline runs."""
    _calls.set([])


def record(model: str, agent: str, response) -> None:
    """Record one LLM call's usage + cost into the active capture (no-op if none)."""
    bucket = _calls.get()
    if bucket is None:
        return
    it, ot, cr, cc = _extract_usage(response)
    bucket.append({
        "agent": agent,
        "model": model,
        "input_tokens": it,
        "output_tokens": ot,
        "cache_read_tokens": cr,
        "cache_creation_tokens": cc,
        "cost_usd": estimate_cost(model, it, ot, cr, cc),
    })


def summary() -> dict:
    """Collapse the capture into totals for logging / audit / persistence."""
    bucket = _calls.get() or []
    return {
        "llm_calls": len(bucket),
        "input_tokens": sum(c["input_tokens"] for c in bucket),
        "output_tokens": sum(c["output_tokens"] for c in bucket),
        "cache_read_tokens": sum(c["cache_read_tokens"] for c in bucket),
        "est_cost_usd": round(sum(c["cost_usd"] for c in bucket), 4),
        "calls": bucket,
    }

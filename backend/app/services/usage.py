"""LLM usage accumulation helpers (§4.3.4).

Provides ``extract_usage`` + ``apply_usage`` so every LLM node can accumulate
token/latency/retry metrics into AnalysisState with a single function call
instead of copy-pasted boilerplate.
"""
from __future__ import annotations

from app.services.llm import flush_retry_stats

# Canonical node names referenced in per-node breakdown dicts.
NODES = (
    "question_generator",
    "rq_quality_scorer",
    "code_generator",
    "code_corrector",
    "insight_writer",
    "visualization_builder",
)


def extract_usage(raw) -> dict:
    """Extract token counts from a LangChain raw LLM response object."""
    u = getattr(raw, "usage_metadata", None) or {}
    get = (lambda k: (u.get(k, 0) if isinstance(u, dict) else getattr(u, k, 0)) or 0)
    p, c = get("input_tokens"), get("output_tokens")
    return {
        "prompt_tokens": p,
        "completion_tokens": c,
        "total_tokens": get("total_tokens") or (p + c),
    }


def apply_usage(
    state: dict,
    node: str,
    usage: dict,
    *,
    latency_ms: int = 0,
    calls: int = 1,
) -> dict:
    """Return a partial-state dict to merge into the node's return value.

    Usage:
        return {**state, ..., **apply_usage(state, "insight_writer", usage, latency_ms=latency_ms)}
    """
    rs = flush_retry_stats()

    def bump(key: str, amount) -> dict:
        d = dict(state.get(key, {}))
        d[node] = d.get(node, 0) + amount
        return d

    return {
        "llm_call_count": state.get("llm_call_count", 0) + calls,
        "prompt_tokens": state.get("prompt_tokens", 0) + usage.get("prompt_tokens", 0),
        "completion_tokens": state.get("completion_tokens", 0) + usage.get("completion_tokens", 0),
        "total_tokens": state.get("total_tokens", 0) + usage.get("total_tokens", 0),
        "node_llm_calls": bump("node_llm_calls", calls),
        "node_prompt_tokens": bump("node_prompt_tokens", usage.get("prompt_tokens", 0)),
        "node_completion_tokens": bump("node_completion_tokens", usage.get("completion_tokens", 0)),
        "node_total_tokens": bump("node_total_tokens", usage.get("total_tokens", 0)),
        "node_llm_latency_ms": bump("node_llm_latency_ms", latency_ms),
        "rate_limit_retry_count": state.get("rate_limit_retry_count", 0) + rs.rate_limit_retries,
        "other_retry_count": state.get("other_retry_count", 0) + rs.other_retries,
        "retry_wait_seconds": round(
            state.get("retry_wait_seconds", 0.0) + rs.wait_seconds, 3
        ),
    }

import logging
from pathlib import Path

from app.agents.schemas import InsightOutput
from app.agents.state import AnalysisState
from app.services.llm import get_llm, with_llm_retry, flush_retry_count
from app.config import settings

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "insight_writer_system_prompt.md"
_SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")


async def insight_writer(state: AnalysisState) -> AnalysisState:
    llm = get_llm(settings.insight_writer_model).with_structured_output(
        InsightOutput, include_raw=True
    )

    execution = state.get("final_execution", {})
    user_payload = {
        "question_text": state["question_text"],
        "category": state["category"],
        "stdout": execution.get("stdout", ""),
        "dataset_profile_row_count": len(state.get("sample_rows", [])),
        "similar_past_insights": state.get("similar_past_insights", []),
        "stats_summary": state.get("stats_summary", []),
    }

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": str(user_payload)},
    ]

    @with_llm_retry
    async def _invoke():
        return await llm.ainvoke(messages)

    result = await _invoke()
    parsed: InsightOutput | None = result.get("parsed")
    if parsed is None:
        logger.error("insight_writer: structured parse failed, raw=%s", result.get("raw"))
        raise ValueError("Failed to parse insight from LLM output")

    usage = getattr(result.get("raw"), "usage_metadata", None) or {}

    # ── Per-node usage accumulation (§4.3.4) ─────────────────────────────────
    _NODE = "insight_writer"
    node_calls = dict(state.get("node_llm_calls", {}))
    node_calls[_NODE] = node_calls.get(_NODE, 0) + 1
    node_pt = dict(state.get("node_prompt_tokens", {}))
    node_pt[_NODE] = node_pt.get(_NODE, 0) + usage.get("input_tokens", 0)
    node_ct = dict(state.get("node_completion_tokens", {}))
    node_ct[_NODE] = node_ct.get(_NODE, 0) + usage.get("output_tokens", 0)
    node_tt = dict(state.get("node_total_tokens", {}))
    node_tt[_NODE] = node_tt.get(_NODE, 0) + usage.get("total_tokens", 0)
    retry_delta = flush_retry_count()

    return {
        **state,
        "status": "succeeded" if state["category"] == "system_profile" else state.get("status", "running"),
        "final_insight": {
            "category": state["category"],
            "summary_text": parsed.summary_text,
            "key_takeaways": parsed.key_takeaways,
            "confidence": parsed.confidence,
        },
        "llm_call_count": state.get("llm_call_count", 0) + 1,
        "prompt_tokens": state.get("prompt_tokens", 0) + usage.get("input_tokens", 0),
        "completion_tokens": state.get("completion_tokens", 0) + usage.get("output_tokens", 0),
        "total_tokens": state.get("total_tokens", 0) + usage.get("total_tokens", 0),
        "node_llm_calls": node_calls,
        "node_prompt_tokens": node_pt,
        "node_completion_tokens": node_ct,
        "node_total_tokens": node_tt,
        "rate_limit_retry_count": state.get("rate_limit_retry_count", 0) + retry_delta,
    }


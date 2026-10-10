import logging
import time
from pathlib import Path

from app.agents.schemas import InsightOutput
from app.agents.state import AnalysisState
from app.services.llm import get_llm, with_llm_retry
from app.services.usage import extract_usage, apply_usage
from app.config import settings

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "insight_writer_system_prompt.md"
_SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")


async def insight_writer(state: AnalysisState) -> AnalysisState:
    execution = state.get("final_execution") or {}
    stdout = execution.get("stdout", "")

    # Guard: insight_writer requires actual executed output (T05).
    # Without stdout, any generated numbers would be fabricated.
    if not stdout:
        raise ValueError(
            "insight_writer requires executed output: final_execution.stdout is empty. "
            "Ensure code_generator and sandbox_execute ran successfully before this node."
        )

    llm = get_llm(settings.insight_writer_model).with_structured_output(
        InsightOutput, include_raw=True
    )

    user_payload = {
        "question_text": state["question_text"],
        "category": state["category"],
        "stdout": stdout,
        "dataset_profile_row_count": len(state.get("sample_rows", [])),
        # similar_past_insights kept in payload key for backward compat but always [] (T06)
        "similar_past_insights": state.get("similar_past_insights", []),
        "stats_summary": state.get("stats_summary", []),
    }

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": str(user_payload)},
    ]

    t0 = time.monotonic()

    @with_llm_retry
    async def _invoke():
        return await llm.ainvoke(messages)

    result = await _invoke()
    latency_ms = int((time.monotonic() - t0) * 1000)

    parsed: InsightOutput | None = result.get("parsed")
    if parsed is None:
        logger.error("insight_writer: structured parse failed, raw=%s", result.get("raw"))
        raise ValueError("Failed to parse insight from LLM output")

    usage = extract_usage(result.get("raw"))

    return {
        **state,
        # status is set by sandbox_execute to "succeeded"; don't override it here.
        "final_insight": {
            "category": state["category"],
            "summary_text": parsed.summary_text,
            "key_takeaways": parsed.key_takeaways,
            "confidence": parsed.confidence,
        },
        **apply_usage(state, "insight_writer", usage, latency_ms=latency_ms),
    }

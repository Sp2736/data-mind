import logging
from pathlib import Path

from app.agents.schemas import InsightOutput
from app.agents.state import AnalysisState
from app.services.llm import get_llm
from app.config import settings

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "insight_writer_system_prompt.md"
_SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")


async def insight_writer(state: AnalysisState) -> AnalysisState:
    llm = get_llm(settings.insight_writer_model).with_structured_output(
        InsightOutput, include_raw=True
    )

    execution = state["final_execution"]
    user_payload = {
        "question_text": state["question_text"],
        "stdout": execution["stdout"],
        "dataset_profile_row_count": len(state.get("sample_rows", [])),
        "similar_past_insights": state.get("similar_past_insights", []),
    }

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": str(user_payload)},
    ]

    result = await llm.ainvoke(messages)
    parsed: InsightOutput | None = result["parsed"]
    if parsed is None:
        logger.error("insight_writer: structured parse failed, raw=%s", result["raw"])
        raise ValueError("Failed to parse insight from LLM output")

    usage = getattr(result["raw"], "usage_metadata", None) or {}

    return {
        **state,
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
    }

import logging
from pathlib import Path

from app.agents.schemas import GeneratedCodeOutput
from app.agents.state import AnalysisState, CodeAttempt
from app.services.llm import get_llm
from app.config import settings

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "code_generator_system_prompt.md"
_SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")


async def code_generator(state: AnalysisState) -> AnalysisState:
    llm = get_llm(settings.code_generator_model).with_structured_output(
        GeneratedCodeOutput, include_raw=True
    )

    user_payload = {
        "question_text": state["question_text"],
        "category": state["category"],
        "target_columns": state["target_columns"],
        "expected_output_type": state["expected_output_type"],
        "dataset_profile": {
            "schema_summary": state["schema_summary"],
            "stats_summary": state["stats_summary"],
            "correlation_summary": state["correlation_summary"],
            "sample_rows": state["sample_rows"],
        },
        "dataset_extension": state["dataset_format"],
        "timeout_seconds": settings.sandbox_timeout_seconds,
    }

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": str(user_payload)},
    ]

    result = await llm.ainvoke(messages)
    parsed: GeneratedCodeOutput | None = result["parsed"]
    if parsed is None:
        logger.error("code_generator: structured parse failed, raw=%s", result["raw"])
        raise ValueError("Failed to parse generated code from LLM output")

    usage = getattr(result["raw"], "usage_metadata", None) or {}
    attempt_number = state.get("attempts", 0) + 1

    code_history = list(state.get("code_history", []))
    code_history.append(
        CodeAttempt(attempt_number=attempt_number, code_text=parsed.code, file_path="")
    )

    return {
        **state,
        "attempts": attempt_number,
        "code_history": code_history,
        "llm_call_count": state.get("llm_call_count", 0) + 1,
        "prompt_tokens": state.get("prompt_tokens", 0) + usage.get("input_tokens", 0),
        "completion_tokens": state.get("completion_tokens", 0) + usage.get("output_tokens", 0),
        "total_tokens": state.get("total_tokens", 0) + usage.get("total_tokens", 0),
    }

import logging
from pathlib import Path

from app.agents.schemas import CodeCorrectionOutput
from app.agents.state import AnalysisState, CodeAttempt
from app.services.llm import get_llm
from app.config import settings

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "code_corrector_system_prompt.md"
_SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")


async def code_corrector(state: AnalysisState) -> AnalysisState:
    llm = get_llm(settings.code_corrector_model).with_structured_output(
        CodeCorrectionOutput, include_raw=True
    )

    last_execution = state["execution_history"][-1]
    last_code = state["code_history"][-1]

    user_payload = {
        "question_text": state["question_text"],
        "target_columns": state["target_columns"],
        "dataset_profile": {
            "schema_summary": state["schema_summary"],
            "stats_summary": state["stats_summary"],
            "correlation_summary": state["correlation_summary"],
        },
        "previous_code": last_code["code_text"],
        "stderr": last_execution["stderr"],
        "attempt_number": state["attempts"],
    }

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": str(user_payload)},
    ]

    result = await llm.ainvoke(messages)
    parsed: CodeCorrectionOutput | None = result["parsed"]
    if parsed is None:
        logger.error("code_corrector: structured parse failed, raw=%s", result["raw"])
        raise ValueError("Failed to parse corrected code from LLM output")

    usage = getattr(result["raw"], "usage_metadata", None) or {}
    attempt_number = state["attempts"] + 1

    code_history = list(state["code_history"])
    code_history.append(
        CodeAttempt(attempt_number=attempt_number, code_text=parsed.code, file_path="")
    )

    logger.info("code_corrector attempt %s diagnosis: %s", attempt_number, parsed.diagnosis)

    return {
        **state,
        "attempts": attempt_number,
        "code_history": code_history,
        "llm_call_count": state.get("llm_call_count", 0) + 1,
        "prompt_tokens": state.get("prompt_tokens", 0) + usage.get("input_tokens", 0),
        "completion_tokens": state.get("completion_tokens", 0) + usage.get("output_tokens", 0),
        "total_tokens": state.get("total_tokens", 0) + usage.get("total_tokens", 0),
    }

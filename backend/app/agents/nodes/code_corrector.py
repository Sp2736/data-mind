import logging
import re
from pathlib import Path

from app.agents.schemas import CodeCorrectionOutput
from app.agents.state import AnalysisState, CodeAttempt
from app.services.llm import get_llm, with_llm_retry, flush_retry_count
from app.config import settings

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "code_corrector_system_prompt.md"
_SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")

_CODE_FENCE_RE = re.compile(r"```(?:python)?\s*\n(.*?)```", re.DOTALL)


def _extract_code(raw_content: str) -> str | None:
    match = _CODE_FENCE_RE.search(raw_content)
    if match:
        return match.group(1).strip()
    stripped = raw_content.strip()
    if any(kw in stripped for kw in ["import pandas", "pd.read", "df =", "import matplotlib"]):
        return stripped
    return None


def _get_content_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(part.get("text", ""))
            elif isinstance(part, str):
                parts.append(part)
        return "".join(parts)
    return str(content)


def _get_usage(usage_obj, key: str, default: int = 0) -> int:
    if usage_obj is None:
        return default
    if isinstance(usage_obj, dict):
        return usage_obj.get(key, default)
    return getattr(usage_obj, key, default)


async def code_corrector(state: AnalysisState) -> AnalysisState:
    last_execution = state["execution_history"][-1]
    last_code = state["code_history"][-1]
    attempt_number = state["attempts"] + 1

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

    code_text: str | None = None
    diagnosis = ""
    usage = None

    # Strategy 1: structured output
    try:
        llm_structured = get_llm(settings.code_corrector_model).with_structured_output(
            CodeCorrectionOutput, include_raw=True
        )

        @with_llm_retry
        async def _invoke_structured():
            return await llm_structured.ainvoke(messages)

        result = await _invoke_structured()
        parsed: CodeCorrectionOutput | None = result.get("parsed")
        raw = result.get("raw")
        usage = getattr(raw, "usage_metadata", None)

        if parsed is not None and parsed.code:
            code_text = parsed.code.strip()
            diagnosis = parsed.diagnosis
            logger.info("code_corrector: structured OK attempt=%d diagnosis=%s", attempt_number, diagnosis)
        else:
            raw_content = _get_content_text(getattr(raw, "content", "")) if raw else ""
            logger.warning("code_corrector: structured parse None (attempt %d), trying regex", attempt_number)
            code_text = _extract_code(raw_content)
            if code_text:
                diagnosis = "Extracted via regex fallback."
    except Exception as exc:
        logger.exception("code_corrector: structured call failed (attempt %d): %s", attempt_number, exc)

    # Strategy 2: plain ainvoke + regex
    if code_text is None:
        try:
            plain_messages = messages + [{
                "role": "user",
                "content": "Reply with ONLY a Python code block inside ```python ... ``` fences. No JSON wrapper."
            }]

            @with_llm_retry
            async def _invoke_plain():
                return await get_llm(settings.code_corrector_model).ainvoke(plain_messages)

            plain_result = await _invoke_plain()
            usage = getattr(plain_result, "usage_metadata", usage)
            raw_content = _get_content_text(getattr(plain_result, "content", ""))
            code_text = _extract_code(raw_content)
            if code_text:
                diagnosis = "Corrected via plain invocation fallback."
        except Exception as exc:
            logger.exception("code_corrector: plain fallback failed (attempt %d): %s", attempt_number, exc)

    if code_text is None:
        raise ValueError(f"code_corrector failed to produce code on attempt {attempt_number}.")

    code_history = list(state["code_history"])
    code_history.append(CodeAttempt(attempt_number=attempt_number, code_text=code_text, file_path=""))

    logger.info("code_corrector attempt %s diagnosis: %s", attempt_number, diagnosis)

    # ── Per-node usage accumulation (§4.3.4) ─────────────────────────────────
    _NODE = "code_corrector"
    node_calls = dict(state.get("node_llm_calls", {}))
    node_calls[_NODE] = node_calls.get(_NODE, 0) + 1
    node_pt = dict(state.get("node_prompt_tokens", {}))
    node_pt[_NODE] = node_pt.get(_NODE, 0) + _get_usage(usage, "input_tokens")
    node_ct = dict(state.get("node_completion_tokens", {}))
    node_ct[_NODE] = node_ct.get(_NODE, 0) + _get_usage(usage, "output_tokens")
    node_tt = dict(state.get("node_total_tokens", {}))
    node_tt[_NODE] = node_tt.get(_NODE, 0) + _get_usage(usage, "total_tokens")
    retry_delta = flush_retry_count()

    return {
        **state,
        "attempts": attempt_number,
        "code_history": code_history,
        "llm_call_count": state.get("llm_call_count", 0) + 1,
        "prompt_tokens": state.get("prompt_tokens", 0) + _get_usage(usage, "input_tokens"),
        "completion_tokens": state.get("completion_tokens", 0) + _get_usage(usage, "output_tokens"),
        "total_tokens": state.get("total_tokens", 0) + _get_usage(usage, "total_tokens"),
        "node_llm_calls": node_calls,
        "node_prompt_tokens": node_pt,
        "node_completion_tokens": node_ct,
        "node_total_tokens": node_tt,
        "rate_limit_retry_count": state.get("rate_limit_retry_count", 0) + retry_delta,
    }


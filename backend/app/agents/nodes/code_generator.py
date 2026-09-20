import logging
import re
from pathlib import Path

from app.agents.schemas import GeneratedCodeOutput
from app.agents.state import AnalysisState, CodeAttempt
from app.services.llm import get_llm, with_llm_retry, flush_retry_count
from app.config import settings

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "code_generator_system_prompt.md"
_SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")

_CODE_FENCE_RE = re.compile(r"```(?:python)?\s*\n(.*?)```", re.DOTALL)


def _extract_code_fallback(raw_content: str) -> str | None:
    """Regex fallback: extract a Python code block from raw LLM output."""
    match = _CODE_FENCE_RE.search(raw_content)
    if match:
        return match.group(1).strip()
    stripped = raw_content.strip()
    if any(kw in stripped for kw in ["import pandas", "import pd", "pd.read", "df =", "import matplotlib"]):
        return stripped
    return None


def _get_content_text(content) -> str:
    """Extract text from langchain content (str, list of parts, etc)."""
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


async def code_generator(state: AnalysisState) -> AnalysisState:
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

    attempt_number = state.get("attempts", 0) + 1
    code_text: str | None = None
    approach_summary = ""
    usage = None

    # ── Strategy 1: structured output ────────────────────────────────────────
    try:
        llm_structured = get_llm(settings.code_generator_model).with_structured_output(
            GeneratedCodeOutput, include_raw=True
        )

        @with_llm_retry
        async def _invoke_structured():
            return await llm_structured.ainvoke(messages)

        result = await _invoke_structured()
        parsed: GeneratedCodeOutput | None = result.get("parsed")
        raw = result.get("raw")
        usage = getattr(raw, "usage_metadata", None)

        if parsed is not None and parsed.code:
            code_text = parsed.code.strip()
            approach_summary = parsed.approach_summary
            logger.info("code_generator: structured output OK, attempt=%d len=%d", attempt_number, len(code_text))
        else:
            raw_content = _get_content_text(getattr(raw, "content", "")) if raw else ""
            logger.warning(
                "code_generator: structured parse returned None (attempt %d), trying regex. raw=%s",
                attempt_number, raw_content[:400],
            )
            code_text = _extract_code_fallback(raw_content)
            if code_text:
                approach_summary = "Extracted via regex from structured invocation."
    except Exception as exc:
        logger.exception("code_generator: structured call failed (attempt %d): %s", attempt_number, exc)

    # ── Strategy 2: plain ainvoke + regex ────────────────────────────────────
    if code_text is None:
        logger.warning("code_generator: falling back to plain ainvoke (attempt %d)", attempt_number)
        try:
            plain_messages = messages + [{
                "role": "user",
                "content": (
                    "IMPORTANT: Reply with ONLY a Python code block inside ```python ... ``` fences. "
                    "No explanations, no JSON wrapper — just the code."
                )
            }]

            @with_llm_retry
            async def _invoke_plain():
                return await get_llm(settings.code_generator_model).ainvoke(plain_messages)

            plain_result = await _invoke_plain()
            usage = getattr(plain_result, "usage_metadata", usage)
            raw_content = _get_content_text(getattr(plain_result, "content", ""))
            code_text = _extract_code_fallback(raw_content)
            if code_text:
                approach_summary = "Generated via plain invocation fallback."
                logger.info("code_generator: plain fallback succeeded (attempt %d)", attempt_number)
            else:
                logger.error(
                    "code_generator: plain fallback produced no code (attempt %d). raw=%s",
                    attempt_number, raw_content[:600],
                )
        except Exception as exc:
            logger.exception("code_generator: plain fallback failed (attempt %d): %s", attempt_number, exc)

    if code_text is None:
        raise ValueError(
            f"code_generator failed to produce code on attempt {attempt_number}. "
            "Both structured and plain LLM calls returned no usable Python. Check server logs."
        )

    code_history = list(state.get("code_history", []))
    code_history.append(CodeAttempt(attempt_number=attempt_number, code_text=code_text, file_path=""))

    # ── Per-node usage accumulation (§4.3.4) ─────────────────────────────────
    _NODE = "code_generator"
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

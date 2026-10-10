import logging
import re
import time
from pathlib import Path

from app.agents.schemas import CodeCorrectionOutput
from app.agents.state import AnalysisState, CodeAttempt
from app.services.llm import get_llm, with_llm_retry
from app.services.usage import extract_usage, apply_usage
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
    raw_obj = None
    llm_calls = 0

    t0 = time.monotonic()

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
        raw_obj = raw
        llm_calls += 1

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
            raw_obj = plain_result
            llm_calls += 1
            raw_content = _get_content_text(getattr(plain_result, "content", ""))
            code_text = _extract_code(raw_content)
            if code_text:
                diagnosis = "Corrected via plain invocation fallback."
        except Exception as exc:
            logger.exception("code_corrector: plain fallback failed (attempt %d): %s", attempt_number, exc)

    if code_text is None:
        raise ValueError(f"code_corrector failed to produce code on attempt {attempt_number}.")

    latency_ms = int((time.monotonic() - t0) * 1000)

    code_history = list(state["code_history"])
    code_history.append(CodeAttempt(attempt_number=attempt_number, code_text=code_text, file_path=""))

    logger.info("code_corrector attempt %s diagnosis: %s", attempt_number, diagnosis)

    # ── Per-node usage accumulation (§4.3.4) ─────────────────────────────────
    usage = extract_usage(raw_obj)
    return {
        **state,
        "attempts": attempt_number,
        "code_history": code_history,
        **apply_usage(state, "code_corrector", usage, latency_ms=latency_ms, calls=llm_calls),
    }

"""Generates ResearchQuestion rows for a dataset.

Not part of the per-run LangGraph StateGraph — this runs once per dataset,
triggered from `POST /datasets/{id}/questions`, and writes directly to the
`research_questions` table. Keeping it out of the per-RQ graph avoids ever
mixing "generate N questions" state with "answer 1 question" state.
"""
import logging
import time
from pathlib import Path

from app.agents.schemas import ResearchQuestionBatch
from app.agents.vocab import CATEGORIES, OUTPUT_TYPES
from app.services.llm import get_llm, with_llm_retry, flush_retry_stats
from app.config import settings

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "question_generator_system_prompt.md"
_SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")


async def generate_research_questions(
    schema_summary: list[dict],
    stats_summary: list[dict],
    correlation_summary: list[dict],
    sample_rows: list[dict],
    similar_past_insights: list[dict] | None = None,
) -> tuple[ResearchQuestionBatch, dict]:
    """Returns (batch, usage_metrics).

    Drops items whose normalised category is not in CATEGORIES or whose
    output type is not in OUTPUT_TYPES; logs a warning and returns the count
    as metrics["dropped_invalid"].
    """
    llm = get_llm(settings.question_generator_model).with_structured_output(
        ResearchQuestionBatch, include_raw=True
    )

    user_payload = {
        "schema_summary": schema_summary,
        "stats_summary": stats_summary,
        "correlation_summary": correlation_summary,
        "sample_rows": sample_rows,
        "similar_past_insights": similar_past_insights or [],
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

    parsed: ResearchQuestionBatch = result["parsed"]
    raw = result["raw"]

    if parsed is None:
        logger.error("question_generator: structured parse failed, raw=%s", raw)
        raise ValueError("Failed to parse research questions from LLM output")

    # Drop items with unrecognised category or output type.
    valid_questions = []
    dropped_invalid = 0
    for q in parsed.questions:
        if q.category not in CATEGORIES or q.expected_output_type not in OUTPUT_TYPES:
            logger.warning(
                "question_generator: dropping question with invalid category=%r / output_type=%r: %s",
                q.category,
                q.expected_output_type,
                q.question_text[:80],
            )
            dropped_invalid += 1
        else:
            valid_questions.append(q)

    filtered_batch = ResearchQuestionBatch(questions=valid_questions)

    rs = flush_retry_stats()
    usage = getattr(raw, "usage_metadata", None) or {}
    metrics = {
        "prompt_tokens": usage.get("input_tokens", 0) if isinstance(usage, dict) else getattr(usage, "input_tokens", 0),
        "completion_tokens": usage.get("output_tokens", 0) if isinstance(usage, dict) else getattr(usage, "output_tokens", 0),
        "total_tokens": usage.get("total_tokens", 0) if isinstance(usage, dict) else getattr(usage, "total_tokens", 0),
        "llm_call_count": 1,
        "latency_ms": latency_ms,
        "rate_limit_retries": rs.rate_limit_retries,
        "other_retries": rs.other_retries,
        "retry_wait_seconds": rs.wait_seconds,
        "dropped_invalid": dropped_invalid,
    }

    return filtered_batch, metrics

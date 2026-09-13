"""RQ Quality Scorer — rates each generated ResearchQuestion 1-5.

Called synchronously from POST /datasets/{id}/questions after generation,
before persisting to the DB. RQs scoring <= 2 are considered low-quality
and filtered out. Uses a lightweight structured LLM call.

Quality scale:
  5 — Excellent: specific, actionable, grounded in actual columns
  4 — Good: clear and relevant but slightly generic
  3 — Adequate: answerable but unremarkable
  2 — Weak: too vague, unmeasurable, or not grounded in schema
  1 — Poor: nonsensical, duplicate, or impossible to answer with the data
"""
import logging
from typing import List

from pydantic import BaseModel, Field

from app.agents.schemas import ResearchQuestionItem
from app.services.llm import get_llm
from app.config import settings

logger = logging.getLogger(__name__)

MIN_QUALITY_SCORE = 3  # RQs below this threshold are dropped


class RQScore(BaseModel):
    index: int = Field(description="0-based index of the question in the input list.")
    score: int = Field(description="Quality score from 1 (poor) to 5 (excellent).")
    label: str = Field(
        description="One of: 'excellent' | 'good' | 'adequate' | 'weak' | 'poor'."
    )
    reason: str = Field(description="One-sentence explanation for the score.")


class RQScoreBatch(BaseModel):
    scores: List[RQScore] = Field(
        description="One score entry per question, in the same order as the input."
    )


_SYSTEM_PROMPT = """\
You are an expert data scientist reviewing automatically generated research questions
for a dataset analysis pipeline. Score each question on a 1-5 quality scale:

5 — Excellent: specific, actionable, directly measurable with the given columns
4 — Good: clear and relevant, only slightly generic
3 — Adequate: answerable but unremarkable or overly broad
2 — Weak: too vague, unmeasurable, or not grounded in the schema
1 — Poor: nonsensical, a duplicate, or impossible to answer with this data

Return a score for EVERY question. Use the question index (0-based) to identify each one.
"""


async def score_research_questions(
    questions: List[ResearchQuestionItem],
    schema_summary: list[dict],
) -> List[RQScore]:
    """Score all questions and return scores in the same order.

    Does not filter — filtering is done by the caller based on MIN_QUALITY_SCORE.
    Returns an empty list only if the LLM call completely fails.
    """
    if not questions:
        return []

    llm = get_llm(settings.question_generator_model).with_structured_output(
        RQScoreBatch, include_raw=True
    )

    questions_payload = [
        {
            "index": i,
            "question_text": q.question_text,
            "category": q.category,
            "target_columns": q.target_columns,
            "rationale": q.rationale,
            "expected_output_type": q.expected_output_type,
        }
        for i, q in enumerate(questions)
    ]

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {
            "role": "user",
            "content": str(
                {
                    "schema_columns": [c.get("column") for c in schema_summary],  # profiler uses 'column'
                    "questions": questions_payload,
                }
            ),
        },
    ]

    try:
        result = await llm.ainvoke(messages)
        parsed: RQScoreBatch | None = result["parsed"]
        if parsed is None:
            logger.warning("rq_quality_scorer: structured parse failed, skipping filter")
            return []
        return parsed.scores
    except Exception:
        logger.exception("rq_quality_scorer: LLM call failed, skipping quality filter")
        return []


def filter_questions(
    questions: List[ResearchQuestionItem],
    scores: List[RQScore],
    min_score: int = MIN_QUALITY_SCORE,
) -> List[tuple[ResearchQuestionItem, RQScore]]:
    """Returns (question, score) pairs that passed the quality threshold.

    If scoring failed (empty scores list), returns all questions with a default score.
    """
    if not scores:
        # Scoring failed — pass everything through with a neutral score
        return [
            (q, RQScore(index=i, score=3, label="adequate", reason="Scoring unavailable"))
            for i, q in enumerate(questions)
        ]

    score_by_index = {s.index: s for s in scores}
    result = []
    for i, q in enumerate(questions):
        sc = score_by_index.get(i)
        if sc is None:
            # LLM missed this index — include it with a neutral score
            result.append((q, RQScore(index=i, score=3, label="adequate", reason="Not scored")))
        elif sc.score >= min_score:
            result.append((q, sc))
        else:
            logger.info(
                "rq_quality_scorer: dropping RQ[%d] score=%d label=%s: %s",
                i, sc.score, sc.label, q.question_text[:80],
            )
    return result

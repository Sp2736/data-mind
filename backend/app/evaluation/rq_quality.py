"""Full RQ (Research Question) quality evaluation module.

Implements Part B.1 of todo-priority.md: evaluates relevance, specificity,
and actionability using *measurable proxy metrics*, not just LLM self-report.

This is deliberately separate from `app/agents/nodes/rq_quality_scorer.py`,
which is a live-pipeline gatekeeper (cheap, single 1-5 score, filters bad
RQs before they're persisted). This module is the *research-grade* scorer:
it combines automatic/deterministic metrics with a held-out LLM-judge call
(never the same model/prompt as the generator) and is meant to be run
offline over a batch of trials for the paper, not on every request.

Usage (offline batch scoring):

    from app.evaluation.rq_quality import (
        compute_automatic_metrics, judge_rq_batch, RQEvalResult,
    )

    auto = compute_automatic_metrics(questions, schema_summary)
    judged = await judge_rq_batch(questions, schema_summary, stats_summary)
    for q_auto, q_judge in zip(auto, judged):
        result = RQEvalResult(**q_auto.model_dump(), **q_judge.model_dump())
"""
from __future__ import annotations

import itertools
import logging
from typing import List

from pydantic import BaseModel, Field

from app.agents.schemas import ResearchQuestionItem
from app.services.llm import get_llm, with_llm_retry
from app.services.schema_utils import schema_columns
from app.config import settings

logger = logging.getLogger(__name__)

# Embedding model reused from the RAG stack so we don't add a new dependency.
_EMBEDDER = None


def _get_embedder():
    global _EMBEDDER
    if _EMBEDDER is None:
        from sentence_transformers import SentenceTransformer

        _EMBEDDER = SentenceTransformer(settings.rag_embedding_model)
    return _EMBEDDER


# ─────────────────────────────────────────────────────────────────────────
# B.1 automatic / deterministic metrics — no LLM call, no cost
# ─────────────────────────────────────────────────────────────────────────

# Import canonical categories from vocab (T03).
from app.agents.vocab import CATEGORIES as _VOCAB_CATEGORIES
from app.services.schema_utils import col_name, null_stats as _null_stats

EDA_CATEGORIES = list(_VOCAB_CATEGORIES)  # canonical: data_cleaning, distribution, …

_DUPLICATE_COSINE_THRESHOLD = 0.9


def infer_applicable_categories(
    schema_summary: list[dict],
    stats_summary: list[dict] | None = None,
    sample_rows: list[dict] | None = None,
) -> list[str]:
    """Infer which EDA_CATEGORIES can reasonably apply to this dataset's profile.

    Rules (per T03):
    - ``data_cleaning``  if any null_count > 0 OR any numeric stat where max > 5 * p75.
    - ``distribution``   if ≥1 numeric column.
    - ``anomaly``        if ≥1 numeric column.
    - ``correlation``    if ≥2 numeric columns.
    - ``trend``          if a datetime-like column exists (dtype contains 'datetime',
                          or name matches date|time|year|month|day, or a sample value
                          parses with pd.to_datetime).
    - ``segmentation``   if ≥1 low-cardinality categorical (object/str/category with
                          unique_count <= 50) AND ≥1 numeric column.
    """
    import re

    applicable: list[str] = []

    numeric_columns = [
        c for c in schema_summary
        if str(c.get("data_type", c.get("dtype", ""))).lower() in
        ("int64", "float64", "int32", "float32", "int", "float", "number", "numeric")
    ]
    categorical_low_card = [
        c for c in schema_summary
        if str(c.get("data_type", c.get("dtype", ""))).lower() in ("object", "str", "string", "category")
        and (c.get("unique_count") or float("inf")) <= 50
    ]

    # data_cleaning: any nulls or outlier signal
    has_nulls = any(c.get("null_count", 0) > 0 for c in schema_summary)
    has_outlier = False
    if stats_summary:
        for s in stats_summary:
            p75 = s.get("75%", s.get("q75", None))
            max_v = s.get("max", None)
            if p75 is not None and max_v is not None:
                try:
                    if float(max_v) > 5 * float(p75):
                        has_outlier = True
                        break
                except (TypeError, ValueError):
                    pass
    if has_nulls or has_outlier:
        applicable.append("data_cleaning")

    if numeric_columns:
        applicable.append("distribution")
        applicable.append("anomaly")
    if len(numeric_columns) >= 2:
        applicable.append("correlation")

    # trend: datetime-like column
    dt_re = re.compile(r"(?i)date|time|year|month|day")
    has_trend = False
    for c in schema_summary:
        dtype = str(c.get("data_type", c.get("dtype", ""))).lower()
        cname = col_name(c) or ""
        if "datetime" in dtype or dt_re.search(cname):
            has_trend = True
            break
    if not has_trend and sample_rows:
        import pandas as pd  # type: ignore
        for c in schema_summary:
            cname = col_name(c) or ""
            vals = [r.get(cname) for r in sample_rows[:5] if r.get(cname)]
            if vals:
                try:
                    pd.to_datetime(vals)
                    has_trend = True
                    break
                except Exception:
                    pass
    if has_trend:
        applicable.append("trend")

    # segmentation: low-cardinality categorical + at least one numeric
    if categorical_low_card and numeric_columns:
        applicable.append("segmentation")

    return applicable



class AutomaticRQMetrics(BaseModel):
    column_grounding_rate: float = Field(description="valid_questions / total_questions")
    category_coverage: dict[str, bool] = Field(description="Which of EDA_CATEGORIES were produced")
    category_coverage_rate: float = Field(description="covered_applicable / applicable categories")
    redundancy_rate: float = Field(description="Fraction of question pairs above the duplicate threshold")
    diversity_score: float = Field(description="Mean pairwise embedding cosine distance across the batch")
    total_questions: int
    grounded_questions: int


def _cosine(a: list[float], b: list[float]) -> float:
    import math

    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def compute_automatic_metrics(
    questions: List[ResearchQuestionItem],
    schema_summary: list[dict],
    applicable_categories: list[str] | None = None,
    stats_summary: list[dict] | None = None,
    sample_rows: list[dict] | None = None,
) -> AutomaticRQMetrics:
    """Deterministic metrics computable with zero LLM calls.

    ``applicable_categories`` — categories the profile could support (e.g. a
    dataset with no datetime column can't have "trend" held against it).
    When ``None``, ``infer_applicable_categories`` is called automatically
    using ``schema_summary``, ``stats_summary``, and ``sample_rows``.

    Note: an empty ``target_columns`` list is treated as ungrounded — the
    prompt requires at least one column target for a question to be specific.
    """
    from app.services.schema_utils import schema_columns

    valid_columns = set(schema_columns(schema_summary))
    if applicable_categories is None:
        applicable_categories = infer_applicable_categories(schema_summary, stats_summary, sample_rows)
    if not applicable_categories:
        applicable_categories = EDA_CATEGORIES

    total = len(questions)
    grounded = 0
    produced_categories: set[str] = set()

    for q in questions:
        if q.target_columns and all(col in valid_columns for col in q.target_columns):
            grounded += 1
        produced_categories.add(q.category)

    category_coverage = {cat: (cat in produced_categories) for cat in applicable_categories}

    # Redundancy + diversity need embeddings; both share the same pairwise matrix.
    redundancy_rate = 0.0
    diversity_score = 0.0
    if total >= 2:
        try:
            embedder = _get_embedder()
            texts = [q.question_text for q in questions]
            vectors = embedder.encode(texts).tolist()
            pairs = list(itertools.combinations(range(total), 2))
            sims = [_cosine(vectors[i], vectors[j]) for i, j in pairs]
            duplicate_pairs = sum(1 for s in sims if s > _DUPLICATE_COSINE_THRESHOLD)
            redundancy_rate = duplicate_pairs / len(pairs)
            diversity_score = sum(1 - s for s in sims) / len(pairs)
        except Exception:
            logger.exception("rq_quality: embedding-based metrics failed, defaulting to 0.0")

    covered_applicable = sum(1 for covered in category_coverage.values() if covered)
    n_applicable = len(applicable_categories)
    category_coverage_rate = (covered_applicable / n_applicable) if n_applicable else 0.0

    return AutomaticRQMetrics(
        column_grounding_rate=(grounded / total) if total else 0.0,
        category_coverage=category_coverage,
        category_coverage_rate=category_coverage_rate,
        redundancy_rate=redundancy_rate,
        diversity_score=diversity_score,
        total_questions=total,
        grounded_questions=grounded,
    )



# ─────────────────────────────────────────────────────────────────────────
# B.1 LLM-as-judge metrics — relevance / specificity / actionability
# Uses a distinct rubric prompt and (recommended) a different model from the
# question_generator, so this is never the generator grading its own work.
# ─────────────────────────────────────────────────────────────────────────

_JUDGE_SYSTEM_PROMPT = """\
You are an independent evaluator (NOT the model that generated these questions).
For each research question, score three dimensions on a 1-5 scale using the
rubric below. Be strict — most auto-generated questions should NOT get 5s.

Relevance (1-5): does the question match a real statistical signal actually
present in the profile (e.g. a proposed correlation between two columns that
are, per the correlation_summary, actually correlated)? 1 = no connection to
the data's actual signal, 5 = precisely targets a signal visible in the profile.

Specificity (1-5): 1 = generic ("explore the data"), 5 = concrete and
unambiguous ("compare median income across region=North vs region=South").

Actionability (1-5): 1 = answering it yields only a fact with no decision
value, 5 = answering it yields a decision-usable finding.

Return one entry per question, in input order, using the given index.
"""


class RQJudgeScore(BaseModel):
    index: int
    relevance: int = Field(ge=1, le=5)
    specificity: int = Field(ge=1, le=5)
    actionability: int = Field(ge=1, le=5)
    justification: str = Field(description="One sentence covering all three scores.")


class RQJudgeBatch(BaseModel):
    scores: List[RQJudgeScore]


async def judge_rq_batch(
    questions: List[ResearchQuestionItem],
    schema_summary: list[dict],
    stats_summary: list[dict],
    correlation_summary: list[dict] | None = None,
    judge_model: str | None = None,
) -> List[RQJudgeScore]:
    """Held-out LLM-judge scoring for relevance/specificity/actionability.

    `judge_model` defaults to settings.rq_judge_model (falls back to the
    insight_writer model, which is never the question_generator model in the
    default config) — see config.py for the new setting.
    """
    if not questions:
        return []

    model_spec = judge_model or getattr(settings, "rq_judge_model", settings.insight_writer_model)
    llm = get_llm(model_spec).with_structured_output(RQJudgeBatch, include_raw=True)

    payload = {
        "schema_columns": schema_columns(schema_summary),
        "stats_summary": stats_summary,
        "correlation_summary": correlation_summary or [],
        "questions": [
            {
                "index": i,
                "question_text": q.question_text,
                "category": q.category,
                "target_columns": q.target_columns,
            }
            for i, q in enumerate(questions)
        ],
    }

    messages = [
        {"role": "system", "content": _JUDGE_SYSTEM_PROMPT},
        {"role": "user", "content": str(payload)},
    ]

    try:
        @with_llm_retry
        async def _invoke():
            return await llm.ainvoke(messages)

        result = await _invoke()
        parsed: RQJudgeBatch | None = result.get("parsed")
        if parsed is None:
            logger.warning("rq_quality: judge structured parse failed")
            return []
        return parsed.scores
    except Exception:
        logger.exception("rq_quality: judge LLM call failed")
        return []


class RQEvalResult(BaseModel):
    """Merged automatic + judge result for a single trial, ready to drop into
    the `judge_scores` field of a telemetry.py trial record."""

    automatic: AutomaticRQMetrics
    judge_scores: List[RQJudgeScore]

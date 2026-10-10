"""Insight quality evaluation module.

Implements §4.3.3 of the paper evaluation methodology: rates the final
`InsightOutput` (summary_text + key_takeaways) produced by the
`insight_writer` node on four dimensions:

Automatic (zero LLM cost):
  1. Numerical Faithfulness   — numbers cited in the insight are present in /
                                derivable from the code's stdout.
  2. Readability              — Flesch-Kincaid Grade Level on summary_text.

LLM-as-judge (distinct model from the writer; offline only):
  3. Takeaway Groundedness    — each key_takeaway bullet is binary-scored
                                supported / unsupported against stdout.
  4. Data-Quality Caveat Coverage — does the summary mention any caveat
                                about data quality visible in the profile?

Public API:
    from app.evaluation.insight_quality import (
        compute_automatic_insight_metrics,
        judge_insight_batch,
        AutomaticInsightMetrics,
        InsightJudgeScore,
    )

Usage (offline batch):
    auto  = compute_automatic_insight_metrics(summary_text, key_takeaways, stdout)
    judged = await judge_insight_batch(trials)   # trials from telemetry.iter_trials()
"""
from __future__ import annotations

import logging
import math
import re
from typing import Any

from pydantic import BaseModel, Field

from app.services.llm import get_llm, with_llm_retry
from app.config import settings

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

_NUM_RE = re.compile(r"(?<![\w.])-?\d[\d,]*(?:\.\d+)?(?:[eE][+-]?\d+)?%?")


def parse_numbers(text: str) -> list[tuple[float, int, bool]]:
    out = []
    for m in _NUM_RE.finditer(text or ""):
        raw = m.group(0)
        pct = raw.endswith("%")
        s = raw.rstrip("%").replace(",", "")
        try:
            val = float(s)
        except ValueError:
            continue
        mantissa = s.lower().split("e")[0]
        decimals = len(mantissa.split(".")[1]) if "." in mantissa else 0
        out.append((val, decimals, pct))
    return out


def is_grounded(val: float, decimals: int, pct: bool, refs: list[float]) -> bool:
    for r in refs:
        cands = [r, r * 100] if pct else [r, r / 100]
        for c in cands:
            if abs(c - val) <= 0.5 * 10 ** (-decimals) + 1e-9:
                return True
            if abs(c - val) <= 0.005 * max(abs(c), 1e-12):
                return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# Syllable counting (Flesch-Kincaid) — no external dependency
# ─────────────────────────────────────────────────────────────────────────────

_VOWEL_RE = re.compile(r"[aeiouAEIOU]")
_SILENT_E_RE = re.compile(r"e\b", re.IGNORECASE)


def _syllable_count_word(word: str) -> int:
    """Approximate syllable count for one word (fallback, no textstat needed)."""
    word = re.sub(r"[^a-zA-Z]", "", word)
    if not word:
        return 0
    # Strip trailing silent e (crude heuristic)
    word = _SILENT_E_RE.sub("", word)
    count = len(_VOWEL_RE.findall(word))
    return max(count, 1)


def _syllable_count(text: str) -> int:
    return sum(_syllable_count_word(w) for w in text.split())


def _sentence_count(text: str) -> int:
    return max(len(re.split(r"[.!?]+", text.strip())), 1)


def _word_count(text: str) -> int:
    return max(len(text.split()), 1)


def flesch_kincaid_grade(text: str) -> float:
    """Flesch-Kincaid Grade Level — first tries `textstat`, falls back to
    the pure-Python estimator above."""
    try:
        import textstat  # type: ignore

        return textstat.flesch_kincaid_grade(text)
    except ImportError:
        pass

    words = _word_count(text)
    sentences = _sentence_count(text)
    syllables = _syllable_count(text)
    # FK formula: 0.39*(words/sentences) + 11.8*(syllables/words) - 15.59
    grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
    return round(grade, 2)


# ─────────────────────────────────────────────────────────────────────────────
# §4.3.3 — Automatic metrics (no LLM)
# ─────────────────────────────────────────────────────────────────────────────


class AutomaticInsightMetrics(BaseModel):
    """Deterministic insight quality metrics derived from stdout + text alone."""

    faithfulness_rate: float = Field(
        description="Fraction of numbers grounded in stdout. 1.0 = all grounded, null if none cited."
    )
    faithfulness_rate_with_profile: float = Field(
        description="Fraction of numbers grounded in stdout or profile."
    )
    faithfulness_rate_nontrivial: float = Field(
        description="Fraction of non-trivial numbers grounded."
    )
    total_numbers_cited: int = Field(description="Count of numeric values in summary + takeaways.")
    grounded_numbers: int = Field(description="Subset of cited numbers found in stdout.")
    flesch_kincaid_grade: float = Field(
        description="FK Grade Level of summary_text (lower = more readable)."
    )
    word_count: int = Field(description="Word count of summary_text.")


def compute_automatic_insight_metrics(
    summary_text: str,
    key_takeaways: list[str],
    stdout: str,
    profile_text: str = "",
) -> AutomaticInsightMetrics:
    insight_text = " ".join([summary_text] + key_takeaways)
    cited = parse_numbers(insight_text)
    
    stdout_nums = [v for v, _, _ in parse_numbers(stdout)]
    profile_nums = [v for v, _, _ in parse_numbers(profile_text)]
    both_nums = stdout_nums + profile_nums

    grounded = 0
    grounded_with_profile = 0
    nontrivial_cited = 0
    nontrivial_grounded = 0

    for val, decimals, pct in cited:
        # Check nontrivial
        is_trivial = False
        if decimals == 0 and not pct and abs(val) <= 10:
            is_trivial = True
        elif decimals == 0 and not pct and 1900 <= val <= 2100:
            is_trivial = True
            
        is_g_stdout = is_grounded(val, decimals, pct, stdout_nums)
        is_g_both = is_grounded(val, decimals, pct, both_nums)
        
        if is_g_stdout:
            grounded += 1
        if is_g_both:
            grounded_with_profile += 1
            
        if not is_trivial:
            nontrivial_cited += 1
            if is_g_stdout:
                nontrivial_grounded += 1

    total_cited = len(cited)
    f_rate = (grounded / total_cited) if total_cited > 0 else 1.0
    f_rate_prof = (grounded_with_profile / total_cited) if total_cited > 0 else 1.0
    f_rate_nontrivial = (nontrivial_grounded / nontrivial_cited) if nontrivial_cited > 0 else 1.0

    fk = flesch_kincaid_grade(summary_text) if summary_text.strip() else 0.0
    wc = _word_count(summary_text)

    return AutomaticInsightMetrics(
        faithfulness_rate=round(f_rate, 4),
        faithfulness_rate_with_profile=round(f_rate_prof, 4),
        faithfulness_rate_nontrivial=round(f_rate_nontrivial, 4),
        total_numbers_cited=total_cited,
        grounded_numbers=grounded,
        flesch_kincaid_grade=fk,
        word_count=wc,
    )


# ─────────────────────────────────────────────────────────────────────────────
# §4.3.3 — LLM-as-judge metrics
# ─────────────────────────────────────────────────────────────────────────────

_JUDGE_SYSTEM_PROMPT = """\
You are an independent evaluator assessing the quality of a data-analysis
insight produced by an AI system. You are NOT the model that wrote the insight.
Be strict — this feeds a research paper's evaluation numbers.

You will receive:
  - question_text: the research question the code was meant to answer
  - stdout: the raw output printed by the executed Python analysis script
  - summary_text: the AI's plain-language summary of the finding
  - key_takeaways: the AI's bullet-point takeaways
  - profile_null_stats: a list of {"column": ..., "null_count": ...} entries
                         from the dataset profile (may be empty)

Score two dimensions:

1. takeaway_groundedness (per bullet):
   For EACH bullet in key_takeaways, return a boolean `supported` — True only
   if the bullet's claim is directly verifiable from stdout (a specific number,
   trend, or label appears in the output). False if the claim is vague,
   contradicts stdout, or cannot be verified.

2. caveat_mentioned (boolean):
   True if summary_text or any key_takeaway explicitly mentions at least one
   limitation or data-quality caveat (e.g., missing values, small sample size,
   data imbalance, unreliable columns) consistent with the profile_null_stats.
   False otherwise.

Return JSON exactly matching the schema you are given.
"""


class TakeawayGroundednessScore(BaseModel):
    bullet_index: int
    bullet_text: str
    supported: bool
    reason: str = Field(description="One sentence justification.")


class InsightJudgeScore(BaseModel):
    """Judge scores for one insight trial."""

    trial_run_id: str
    takeaway_scores: list[TakeawayGroundednessScore]
    groundedness_rate: float = Field(description="Fraction of bullets that are supported.")
    caveat_mentioned: bool
    justification: str = Field(description="1-2 sentences on the most important issue.")


class _InsightJudgeBatch(BaseModel):
    """Structured output container for a single trial's judge response."""

    takeaway_scores: list[TakeawayGroundednessScore]
    caveat_mentioned: bool
    justification: str


async def judge_insight_batch(
    trials: list[dict[str, Any]],
    insight_judge_model: str | None = None,
) -> list[InsightJudgeScore]:
    """Held-out LLM-judge scoring for a list of trial records.

    Each element of `trials` should be a dict from `telemetry.iter_trials()`
    (or equivalent), containing at minimum:
        "run_id", "question" (dict with "text"),
        "insight" (dict with "summary_text", "key_takeaways"),
        "attempts" (list of attempt dicts with "stdout" and "succeeded").

    Returns one InsightJudgeScore per trial (same order). Trials that fail to
    score are included with groundedness_rate=0.0, caveat_mentioned=False, and
    a justification explaining the scoring failure.

    `insight_judge_model` defaults to settings.insight_judge_model.
    """
    model_spec = insight_judge_model or getattr(
        settings, "insight_judge_model", settings.insight_writer_model
    )
    llm = get_llm(model_spec).with_structured_output(_InsightJudgeBatch, include_raw=True)

    results: list[InsightJudgeScore] = []

    for trial in trials:
        run_id = trial.get("run_id", "unknown")
        insight = trial.get("insight") or {}
        summary_text = insight.get("summary_text") or ""
        key_takeaways = insight.get("key_takeaways") or []
        question_text = (trial.get("question") or {}).get("text", "")

        # Pick stdout from the last succeeded attempt; fall back to last attempt.
        attempts = trial.get("attempts") or []
        stdout = ""
        for attempt in reversed(attempts):
            if attempt.get("succeeded"):
                stdout = attempt.get("stdout", "")
                break
        if not stdout and attempts:
            stdout = attempts[-1].get("stdout", "")

        # Profile null stats (may not be present in older trial records).
        profile_dict = trial.get("profile") or {}
        profile_null_stats = profile_dict.get("null_stats") or []

        if not summary_text and not key_takeaways:
            results.append(
                InsightJudgeScore(
                    trial_run_id=run_id,
                    takeaway_scores=[],
                    groundedness_rate=0.0,
                    caveat_mentioned=False,
                    justification="No insight text to evaluate (run likely failed).",
                )
            )
            continue

        payload = {
            "question_text": question_text,
            "stdout": stdout[:4000],  # cap to avoid token blowout
            "summary_text": summary_text,
            "key_takeaways": key_takeaways,
            "profile_null_stats": profile_null_stats,
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
            parsed: _InsightJudgeBatch | None = result.get("parsed")
            if parsed is None:
                raise ValueError("structured parse returned None")

            supported_count = sum(1 for s in parsed.takeaway_scores if s.supported)
            total = len(parsed.takeaway_scores) or 1
            groundedness_rate = round(supported_count / total, 4)

            results.append(
                InsightJudgeScore(
                    trial_run_id=run_id,
                    takeaway_scores=parsed.takeaway_scores,
                    groundedness_rate=groundedness_rate,
                    caveat_mentioned=parsed.caveat_mentioned,
                    justification=parsed.justification,
                )
            )
        except Exception:
            logger.exception("insight_quality: judge call failed for run_id=%s", run_id)
            results.append(
                InsightJudgeScore(
                    trial_run_id=run_id,
                    takeaway_scores=[],
                    groundedness_rate=0.0,
                    caveat_mentioned=False,
                    justification="Judge LLM call failed — see server logs.",
                )
            )

    return results

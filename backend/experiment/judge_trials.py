"""Offline batch judge script — fills judge_scores in trials.jsonl.

Usage (from the `backend/` directory, with the venv active):

    python -m experiment.judge_trials \\
        [--input  ../data/logs/trials.jsonl] \\
        [--output ../data/logs/trials_judged.jsonl] \\
        [--rq-judge-model  google:gemini-3.1-flash-lite] \\
        [--code-judge-model google:gemini-3.1-flash-lite] \\
        [--insight-judge-model google:gemini-3.1-flash-lite]

What it does
------------
1. Reads every record from `--input` via `telemetry.iter_trials()`.
2. For trials whose judge_scores fields are still null:
   a. Computes automatic RQ metrics   (rq_quality.compute_automatic_metrics)
   b. Computes automatic code signals (code_quality.compute_static_signals)
   c. Computes automatic insight metrics (insight_quality.compute_automatic_insight_metrics)
   d. Calls judge_rq_batch()          for relevance/specificity/actionability
   e. Calls judge_code_quality()      for the best-succeeded code attempt
   f. Calls judge_insight_batch()     for groundedness / caveat coverage
3. Merges scores into the record and writes to `--output` (never mutates input).
4. Trials already scored in the output file are copied as-is (idempotent).

Notes
-----
- Uses asyncio.run() — no FastAPI server needed.
- All judge LLM calls are batched sequentially (not concurrently) to avoid
  blowing through free-tier rate limits. Add asyncio.gather() later if needed.
- Progress is reported every 10 trials (or via tqdm if installed).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("experiment.judge_trials")

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _try_tqdm(iterable, total: int, desc: str):
    try:
        from tqdm import tqdm  # type: ignore

        return tqdm(iterable, total=total, desc=desc)
    except ImportError:
        return iterable


def _already_scored(trial: dict) -> bool:
    """True if all LLM-judge scores in the record are already filled."""
    js = trial.get("judge_scores") or {}
    return all(
        js.get(k) is not None
        for k in ("relevance", "specificity", "actionability", "code_quality", "insight")
    )


def _best_stdout(trial: dict) -> str:
    """Return stdout from the last succeeded attempt, or last attempt overall."""
    attempts = trial.get("attempts") or []
    for attempt in reversed(attempts):
        if attempt.get("succeeded"):
            return attempt.get("stdout", "")
    return attempts[-1].get("stdout", "") if attempts else ""


def _best_code(trial: dict) -> str:
    """Return code from the last succeeded attempt, or last attempt overall."""
    attempts = trial.get("attempts") or []
    for attempt in reversed(attempts):
        if attempt.get("succeeded"):
            return attempt.get("code", "")
    return attempts[-1].get("code", "") if attempts else ""


# ─────────────────────────────────────────────────────────────────────────────
# Main scoring coroutine
# ─────────────────────────────────────────────────────────────────────────────


async def _score_trial(
    trial: dict,
    rq_judge_model: str | None,
    code_judge_model: str | None,
    insight_judge_model: str | None,
) -> dict:
    """Score one trial; return an augmented copy with judge_scores filled."""
    from app.evaluation.rq_quality import compute_automatic_metrics, judge_rq_batch
    from app.evaluation.code_quality import compute_static_signals, judge_code_quality
    from app.evaluation.insight_quality import (
        compute_automatic_insight_metrics,
        judge_insight_batch,
    )
    from app.agents.schemas import ResearchQuestionItem

    out = dict(trial)
    js = dict(trial.get("judge_scores") or {})

    question_data = trial.get("question") or {}
    insight_data = trial.get("insight") or {}
    stdout = _best_stdout(trial)
    code_text = _best_code(trial)

    # ── Automatic RQ metrics ──────────────────────────────────────────────────
    try:
        rq_item = ResearchQuestionItem(
            category=question_data.get("category", "distribution"),
            question_text=question_data.get("text", ""),
            target_columns=question_data.get("target_columns", []),
            rationale="",
            expected_output_type="statistic",
        )
        auto_rq = compute_automatic_metrics([rq_item], schema_summary=[])
        js["rq_automatic"] = auto_rq.model_dump()
    except Exception:
        logger.warning("RQ automatic metrics failed for run_id=%s", trial.get("run_id"))

    # ── LLM-judge RQ scores ───────────────────────────────────────────────────
    if js.get("relevance") is None:
        try:
            rq_item = ResearchQuestionItem(
                category=question_data.get("category", "distribution"),
                question_text=question_data.get("text", ""),
                target_columns=question_data.get("target_columns", []),
                rationale="",
                expected_output_type="statistic",
            )
            rq_scores = await judge_rq_batch(
                [rq_item],
                schema_summary=[],
                stats_summary=[],
                judge_model=rq_judge_model,
            )
            if rq_scores:
                s = rq_scores[0]
                js["relevance"] = s.relevance
                js["specificity"] = s.specificity
                js["actionability"] = s.actionability
                js["rq_justification"] = s.justification
        except Exception:
            logger.warning("RQ judge failed for run_id=%s", trial.get("run_id"))

    # ── Automatic code signals ────────────────────────────────────────────────
    if code_text:
        try:
            static = compute_static_signals(code_text)
            js["code_static"] = static.model_dump()
        except Exception:
            logger.warning("Code static signals failed for run_id=%s", trial.get("run_id"))

        # ── LLM-judge code quality ────────────────────────────────────────────
        if js.get("code_quality") is None:
            try:
                cq = await judge_code_quality(
                    question_text=question_data.get("text", ""),
                    code_text=code_text,
                    stdout=stdout,
                    judge_model=code_judge_model,
                )
                if cq is not None:
                    js["code_quality"] = cq.model_dump()
                    js["code_quality"]["weighted_composite"] = cq.weighted_composite
            except Exception:
                logger.warning("Code quality judge failed for run_id=%s", trial.get("run_id"))

    # ── Automatic insight metrics ─────────────────────────────────────────────
    summary_text = insight_data.get("summary_text") or ""
    key_takeaways = insight_data.get("key_takeaways") or []
    if summary_text or key_takeaways:
        try:
            auto_ins = compute_automatic_insight_metrics(summary_text, key_takeaways, stdout)
            js["insight_automatic"] = auto_ins.model_dump()
        except Exception:
            logger.warning("Insight automatic metrics failed for run_id=%s", trial.get("run_id"))

        # ── LLM-judge insight scores ──────────────────────────────────────────
        if js.get("insight") is None:
            try:
                ins_scores = await judge_insight_batch(
                    [trial],
                    insight_judge_model=insight_judge_model,
                )
                if ins_scores:
                    s = ins_scores[0]
                    js["insight"] = {
                        "groundedness_rate": s.groundedness_rate,
                        "caveat_mentioned": s.caveat_mentioned,
                        "justification": s.justification,
                        "takeaway_scores": [t.model_dump() for t in s.takeaway_scores],
                    }
            except Exception:
                logger.warning("Insight judge failed for run_id=%s", trial.get("run_id"))

    out["judge_scores"] = js
    return out


# ─────────────────────────────────────────────────────────────────────────────
# I/O helpers
# ─────────────────────────────────────────────────────────────────────────────


def _load_already_judged(output_path: Path) -> dict[str, dict]:
    """Load already-judged records keyed by run_id to support idempotency."""
    scored: dict[str, dict] = {}
    if not output_path.exists():
        return scored
    with open(output_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    rec = json.loads(line)
                    if _already_scored(rec):
                        scored[rec["run_id"]] = rec
                except Exception:
                    pass
    return scored


async def _main(args: argparse.Namespace) -> None:
    from app.services.telemetry import iter_trials

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Load trials
    trials = list(iter_trials(input_path))
    if not trials:
        logger.warning("No trials found in %s — nothing to do.", input_path)
        return

    # Load any previously scored records (idempotency); --force bypasses the cache.
    already_judged = {} if args.force else _load_already_judged(output_path)
    logger.info(
        "Loaded %d trials from input; %d already fully scored in output%s.",
        len(trials), len(already_judged),
        " (ignored — --force active)" if args.force else "",
    )

    # Score
    scored_records: list[dict] = []
    to_score = [(i, t) for i, t in enumerate(trials) if t.get("run_id") not in already_judged]

    # --limit: cap how many unscored trials we process this run.
    if args.limit is not None and args.limit > 0:
        logger.info("--limit %d: will score at most %d of %d unscored trial(s).",
                    args.limit, min(args.limit, len(to_score)), len(to_score))
        to_score = to_score[: args.limit]

    progress = _try_tqdm(to_score, total=len(to_score), desc="Judging trials")

    for i, trial in progress:
        run_id = trial.get("run_id", f"trial-{i}")
        logger.info("[%d/%d] scoring run_id=%s", i + 1, len(trials), run_id)
        try:
            judged = await _score_trial(
                trial,
                rq_judge_model=args.rq_judge_model or None,
                code_judge_model=args.code_judge_model or None,
                insight_judge_model=args.insight_judge_model or None,
            )
        except Exception:
            logger.exception("Scoring crashed for run_id=%s — copying as-is", run_id)
            judged = trial
        scored_records.append(judged)

    # Merge with already-judged and write.
    # When --force is active, already_judged is empty so all records come from scored_records;
    # unprocessed trials (beyond --limit) are re-emitted without judge_scores.
    unprocessed = [
        t for i, t in [(i, t) for i, t in enumerate(trials) if t.get("run_id") not in already_judged]
        if (i, t) not in to_score  # trials skipped due to --limit
    ]
    all_records: list[dict] = list(already_judged.values()) + scored_records + unprocessed
    with open(output_path, "w", encoding="utf-8") as f:
        for rec in all_records:
            f.write(json.dumps(rec, default=str) + "\n")

    newly_judged = sum(1 for r in scored_records if _already_scored(r))
    logger.info(
        "Done. %d/%d newly scored; output → %s",
        newly_judged, len(to_score), output_path,
    )


def main() -> None:
    from app.config import settings as _s

    parser = argparse.ArgumentParser(
        description="Offline batch judge: fills judge_scores in trials_judged.jsonl."
    )
    parser.add_argument(
        "--input",
        default="../data/logs/trials.jsonl",
        help="Path to the input trials.jsonl file (default: ../data/logs/trials.jsonl).",
    )
    parser.add_argument(
        "--output",
        default="../data/logs/trials_judged.jsonl",
        help="Path to write the judged output (default: ../data/logs/trials_judged.jsonl).",
    )
    parser.add_argument(
        "--rq-judge-model",
        default=_s.rq_judge_model,
        help=f"Model spec for RQ judge (default: {_s.rq_judge_model}).",
    )
    parser.add_argument(
        "--code-judge-model",
        default=_s.code_judge_model,
        help=f"Model spec for code-quality judge (default: {_s.code_judge_model}).",
    )
    parser.add_argument(
        "--insight-judge-model",
        default=_s.insight_judge_model,
        help=f"Model spec for insight judge (default: {_s.insight_judge_model}).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Stop after scoring N unscored trials (useful for smoke-testing; default: no limit).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignore the already-judged cache and re-score every trial from scratch.",
    )
    args = parser.parse_args()

    asyncio.run(_main(args))


if __name__ == "__main__":
    main()

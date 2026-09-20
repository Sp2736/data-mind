"""Paired RAG-vs-baseline experiment runner.

Usage (from the `backend/` directory, with the venv active):

    python -m experiment.run_experiment \\
        --dataset-id <uuid> \\
        --n-reps 5 \\
        [--max-attempts 3] \\
        [--dry-run]

What it does
------------
For each of N repetitions × 2 arms ("rag" / "baseline") × all ResearchQuestion
rows belonging to the dataset, it:
  1. Queries the dataset profile from Postgres (same query as _execute_run).
  2. For the "baseline" arm: passes similar_past_insights=[] to run_analysis().
  3. For the "rag" arm: runs the real RAG retrieval first.
  4. Calls run_analysis(initial_state, experiment_arm=arm, trial_index=rep)
     which stamps each telemetry.py record with the correct arm / index.
  5. Prints a one-line progress summary per trial.

All detailed data is in `../data/logs/trials.jsonl`; run
`experiment.judge_trials` afterwards to fill in the judge scores.

Notes
-----
- Uses its own asyncio.run() so it can be run standalone without the FastAPI
  server being up (but the DB must be reachable and the venv active).
- Builds its own AsyncSessionLocal session per the same pattern as runs.py.
- --dry-run prints the planned trial table and exits without calling any LLM.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("experiment.run_experiment")


async def _fetch_dataset_context(dataset_id: str):
    """Fetch dataset, profile, and research questions from the DB."""
    from sqlalchemy import select
    from app.db.session import AsyncSessionLocal
    from app.db.models import Dataset, DatasetProfile, ResearchQuestion

    async with AsyncSessionLocal() as db:
        ds_result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
        dataset = ds_result.scalar_one_or_none()
        if dataset is None:
            raise SystemExit(f"Dataset {dataset_id!r} not found in DB.")

        prof_result = await db.execute(
            select(DatasetProfile).where(DatasetProfile.dataset_id == dataset_id)
        )
        profile = prof_result.scalar_one_or_none()
        if profile is None:
            raise SystemExit(f"No DatasetProfile found for dataset {dataset_id!r}.")

        rq_result = await db.execute(
            select(ResearchQuestion).where(ResearchQuestion.dataset_id == dataset_id)
        )
        rqs = rq_result.scalars().all()
        if not rqs:
            raise SystemExit(f"No ResearchQuestions found for dataset {dataset_id!r}.")

    return dataset, profile, list(rqs)


async def _run_trial(
    dataset,
    profile,
    rq,
    arm: str,
    rep: int,
    max_attempts: int,
) -> dict:
    """Run one trial (one arm × one RQ × one rep) and return a summary dict."""
    from app.agents.graph import run_analysis
    from app.agents.state import AnalysisState

    similar_past_insights: list[dict] = []
    if arm == "rag" and rq.category != "system_profile":
        try:
            from app.rag.retriever import retrieve_similar_insights

            similar_past_insights = await retrieve_similar_insights(
                schema_summary=profile.schema_summary, k=5
            )
        except Exception:
            logger.warning("RAG retrieval failed for rq=%s; continuing without it", rq.id)

    initial_state: AnalysisState = {
        "dataset_id": dataset.id,
        "run_id": f"exp-{arm}-rep{rep}-{rq.id}",
        "rq_id": rq.id,
        "question_text": rq.question_text,
        "category": rq.category,
        "target_columns": rq.target_columns,
        "expected_output_type": rq.expected_output_type,
        "rationale": rq.rationale,
        "dataset_format": dataset.format,
        "raw_path": dataset.raw_path,
        "schema_summary": profile.schema_summary,
        "stats_summary": profile.stats_summary,
        "correlation_summary": profile.correlation_summary,
        "sample_rows": profile.sample_rows,
        "similar_past_insights": similar_past_insights,
        "max_attempts": max_attempts,
        "attempts": 0,
        "code_history": [],
        "execution_history": [],
        "status": "running",
        "llm_call_count": 0,
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "node_llm_calls": {},
        "node_prompt_tokens": {},
        "node_completion_tokens": {},
        "node_total_tokens": {},
        "rate_limit_retry_count": 0,
    }

    t0 = time.monotonic()
    try:
        final_state = await run_analysis(
            initial_state,
            experiment_arm=arm,
            trial_index=rep,
        )
        elapsed = time.monotonic() - t0
        return {
            "arm": arm,
            "rep": rep,
            "rq_id": rq.id,
            "status": final_state.get("status"),
            "attempts": final_state.get("attempts", 0),
            "total_tokens": final_state.get("total_tokens", 0),
            "elapsed_s": round(elapsed, 2),
        }
    except Exception as exc:
        elapsed = time.monotonic() - t0
        logger.exception("Trial arm=%s rep=%d rq=%s crashed: %s", arm, rep, rq.id, exc)
        return {
            "arm": arm,
            "rep": rep,
            "rq_id": rq.id,
            "status": "crashed",
            "attempts": 0,
            "total_tokens": 0,
            "elapsed_s": round(elapsed, 2),
        }


async def _main(args: argparse.Namespace) -> None:
    dataset, profile, rqs = await _fetch_dataset_context(args.dataset_id)

    arms = ["baseline", "rag"]
    trials = [
        (arm, rep, rq)
        for rep in range(args.n_reps)
        for arm in arms
        for rq in rqs
    ]
    total = len(trials)

    logger.info(
        "Experiment plan: dataset=%s | rqs=%d | arms=%s | reps=%d → %d trials",
        args.dataset_id, len(rqs), arms, args.n_reps, total,
    )

    if args.dry_run:
        print("\n=== DRY RUN — trial plan ===")
        print(f"{'#':>4}  {'arm':<10}  {'rep':>4}  {'rq_id'}")
        for i, (arm, rep, rq) in enumerate(trials, 1):
            print(f"{i:>4}  {arm:<10}  {rep:>4}  {rq.id}")
        print(f"\nTotal: {total} trials. Pass without --dry-run to execute.")
        return

    results = []
    for i, (arm, rep, rq) in enumerate(trials, 1):
        logger.info("[%d/%d] arm=%-10s rep=%d rq=%s", i, total, arm, rep, rq.id)
        summary = await _run_trial(dataset, profile, rq, arm, rep, args.max_attempts)
        results.append(summary)
        logger.info(
            "  → status=%-10s attempts=%d tokens=%d elapsed=%.1fs",
            summary["status"], summary["attempts"],
            summary["total_tokens"], summary["elapsed_s"],
        )

    # Print a tidy final summary table.
    print("\n=== Experiment complete ===")
    print(f"{'arm':<10}  {'rep':>4}  {'rq_id':<38}  {'status':<10}  {'tokens':>7}  {'s':>6}")
    for r in results:
        print(
            f"{r['arm']:<10}  {r['rep']:>4}  {r['rq_id']:<38}  "
            f"{r['status']:<10}  {r['total_tokens']:>7}  {r['elapsed_s']:>6.1f}"
        )

    succeeded = sum(1 for r in results if r["status"] == "succeeded")
    print(f"\n{succeeded}/{total} trials succeeded.  Details → ../data/logs/trials.jsonl")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the RAG-vs-baseline paired experiment for the DataMind paper."
    )
    parser.add_argument("--dataset-id", required=True, help="UUID of the dataset to run against.")
    parser.add_argument("--n-reps", type=int, default=5, help="Number of repetitions per arm (default: 5).")
    parser.add_argument("--max-attempts", type=int, default=3, help="Max sandbox retry attempts per trial (default: 3).")
    parser.add_argument("--dry-run", action="store_true", help="Print trial plan and exit without running anything.")
    args = parser.parse_args()

    asyncio.run(_main(args))


if __name__ == "__main__":
    main()

"""Paired RAG-vs-baseline experiment runner.

Usage:
    python -m experiment.run_experiment \
        --dataset-ids <uuid1> <uuid2> ... \
        --n-reps 5 \
        [--max-attempts 3] [--max-rqs 8] \
        [--rq-only] [--use-filter] [--seed 42] [--sleep 2] \
        [--resume] [--allow-subprocess] [--allow-empty-rag] [--dry-run]
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import random
import time
import uuid
import hashlib
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("experiment.run_experiment")


async def _fetch_dataset_context(dataset_id: str):
    from sqlalchemy import select
    from app.db.session import AsyncSessionLocal
    from app.db.models import Dataset, DatasetProfile

    async with AsyncSessionLocal() as db:
        ds_result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
        dataset = ds_result.scalar_one_or_none()
        if dataset is None:
            raise SystemExit(f"Dataset {dataset_id!r} not found in DB.")
        if dataset.status != "ready":
            raise SystemExit(f"Dataset {dataset_id!r} is not ready (status={dataset.status}).")

        prof_result = await db.execute(
            select(DatasetProfile).where(DatasetProfile.dataset_id == dataset_id)
        )
        profile = prof_result.scalar_one_or_none()
        if profile is None:
            raise SystemExit(f"No DatasetProfile found for dataset {dataset_id!r}.")

    return dataset, profile


async def _run_trial(
    dataset,
    profile,
    rq,
    arm: str,
    rep: int,
    max_attempts: int,
    batch_id: str,
    rq_index: int,
) -> dict:
    from app.agents.graph import run_analysis
    from app.agents.state import AnalysisState

    initial_state: AnalysisState = {
        "dataset_id": dataset.id,
        "run_id": f"exp-{arm}-rep{rep}-{rq.id}-{uuid.uuid4().hex[:8]}",
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
        "similar_past_insights": [], # RAG only affects question generation
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
            extra_meta={"batch_id": batch_id, "rq_index": rq_index, "dataset_id": dataset.id}
        )
        elapsed = time.monotonic() - t0
        return {
            "status": final_state.get("status"),
            "attempts": final_state.get("attempts", 0),
            "total_tokens": final_state.get("total_tokens", 0),
            "elapsed_s": round(elapsed, 2),
        }
    except Exception as exc:
        elapsed = time.monotonic() - t0
        logger.exception("Trial arm=%s rep=%d rq=%s crashed: %s", arm, rep, rq.id, exc)
        return {
            "status": "crashed",
            "attempts": 0,
            "total_tokens": 0,
            "elapsed_s": round(elapsed, 2),
        }


def _get_corpus_stats():
    from app.rag.store import get_collection
    col = get_collection()
    count = col.count()
    if count == 0:
        return 0, ""
    docs = col.get()
    ids = sorted(docs.get("ids", []))
    ids_hash = hashlib.md5("".join(ids).encode()).hexdigest()[:8]
    return count, ids_hash


def _get_git_commit():
    import subprocess
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        return None


def _get_completed_batches():
    import json
    logs_dir = Path(settings.logs_dir)
    batch_file = logs_dir / "rq_batches.jsonl"
    completed = set()
    if batch_file.exists():
        with open(batch_file, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip(): continue
                try:
                    d = json.loads(line)
                    completed.add((d["dataset_id"], d["rep"], d["arm"]))
                except Exception:
                    pass
    return completed


async def _main(args: argparse.Namespace) -> None:
    if not settings.use_docker_sandbox and not args.allow_subprocess and not args.rq_only:
        raise SystemExit("Error: USE_DOCKER_SANDBOX is false. Pass --allow-subprocess to override.")

    corpus_count, corpus_hash = _get_corpus_stats()
    if corpus_count == 0 and not args.allow_empty_rag:
        raise SystemExit("Error: RAG corpus is empty. Pass --allow-empty-rag to override.")

    from app.agents.nodes.question_generator import generate_research_questions
    from app.agents.nodes.rq_quality_scorer import score_research_questions, filter_questions
    from app.services.telemetry import record_rq_batch
    from app.agents.vocab import CATEGORIES
    from app.services.schema_utils import null_stats

    completed_batches = _get_completed_batches() if args.resume else set()

    # Plan tasks
    tasks = []
    rng = random.Random(args.seed) if args.seed is not None else random.Random()
    
    for ds_id in args.dataset_ids:
        for rep in range(args.n_reps):
            arms = ["baseline", "rag"]
            rng.shuffle(arms)
            for arm in arms:
                if (ds_id, rep, arm) in completed_batches:
                    continue
                tasks.append((ds_id, rep, arm))

    if not tasks:
        logger.info("No tasks to run.")
        return

    logger.info(
        "Experiment plan: datasets=%d | reps=%d | total_batches=%d",
        len(args.dataset_ids), args.n_reps, len(tasks)
    )

    if args.dry_run:
        print("\n=== DRY RUN ===")
        for i, (ds_id, rep, arm) in enumerate(tasks, 1):
            print(f"{i:>4}  ds={ds_id[:8]}  rep={rep}  arm={arm}")
        return

    config_snapshot = {
        "models": {
            "question_generator": settings.question_generator_model,
            "code_generator": settings.code_generator_model,
            "code_corrector": settings.code_corrector_model,
            "insight_writer": settings.insight_writer_model,
            "rq_judge": settings.rq_judge_model,
            "code_judge": settings.code_judge_model,
            "insight_judge": settings.insight_judge_model,
        },
        "temperature": settings.llm_temperature,
        "rag_k": settings.rag_k,
        "embedding_model": settings.rag_embedding_model,
        "sandbox_mode": "docker" if settings.use_docker_sandbox else "subprocess",
        "git_commit": _get_git_commit(),
        "rag_corpus_count": corpus_count,
        "rag_corpus_hash": corpus_hash,
    }

    # Execute
    for idx, (ds_id, rep, arm) in enumerate(tasks, 1):
        logger.info("=== Batch %d/%d: %s | %s | rep %d ===", idx, len(tasks), ds_id, arm, rep)
        dataset, profile = await _fetch_dataset_context(ds_id)

        retrieved = []
        if arm == "rag":
            try:
                from app.rag.retriever import retrieve_similar_insights
                retrieved = await retrieve_similar_insights(
                    schema_summary=profile.schema_summary,
                    k=settings.rag_k,
                    exclude_dataset_id=dataset.id,
                )
            except Exception:
                logger.exception("RAG retrieval failed")

        batch, gen_metrics = await generate_research_questions(
            schema_summary=profile.schema_summary,
            stats_summary=profile.stats_summary,
            correlation_summary=profile.correlation_summary,
            sample_rows=profile.sample_rows,
            similar_past_insights=retrieved,
        )

        try:
            scores, scorer_metrics = await score_research_questions(batch.questions, profile.schema_summary)
            if args.use_filter:
                passing = filter_questions(batch.questions, scores)
                analysis_questions = [item for item, _ in passing]
                kept_indices = [s.index for s in scores if s.score >= 3]
            else:
                analysis_questions = batch.questions
                kept_indices = list(range(len(batch.questions)))
        except Exception:
            logger.exception("Quality scoring failed, using all")
            scores = []
            scorer_metrics = {}
            analysis_questions = batch.questions
            kept_indices = list(range(len(batch.questions)))

        # Filter categories and limits
        final_qs = []
        for i, q in enumerate(analysis_questions):
            if q.category in CATEGORIES and q.category != "system_profile":
                final_qs.append((i, q))
        final_qs = final_qs[:args.max_rqs]

        batch_id = f"batch-{dataset.id}-{arm}-rep{rep}-{uuid.uuid4().hex[:8]}"

        record_rq_batch({
            "batch_id": batch_id,
            "source": "experiment",
            "dataset_id": dataset.id,
            "arm": arm,
            "rep": rep,
            "use_rag": (arm == "rag"),
            "retrieved": retrieved,
            "questions_raw": [q.model_dump() for q in batch.questions],
            "scorer": [s.model_dump() for s in scores] if hasattr(scores[0], "model_dump") else scores,
            "kept_indices": kept_indices,
            "profile_snapshot": {
                "schema_summary": profile.schema_summary,
                "stats_summary": profile.stats_summary,
                "correlation_summary": profile.correlation_summary,
                "null_stats": null_stats(profile.schema_summary),
                "row_count": dataset.row_count,
                "column_count": dataset.column_count,
            },
            "gen_metrics": gen_metrics,
            "scorer_metrics": scorer_metrics,
            "config": config_snapshot,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        if not args.rq_only:
            class DummyRQ:
                pass
            for orig_idx, rq in final_qs:
                if args.sleep > 0:
                    await asyncio.sleep(args.sleep)
                drq = DummyRQ()
                drq.id = f"{batch_id}-q{orig_idx}"
                drq.question_text = rq.question_text
                drq.category = rq.category
                drq.target_columns = rq.target_columns
                drq.expected_output_type = rq.expected_output_type
                drq.rationale = rq.rationale

                res = await _run_trial(dataset, profile, drq, arm, rep, args.max_attempts, batch_id, orig_idx)
                logger.info("  -> Q%d: %s (attempts=%d)", orig_idx, res["status"], res["attempts"])

        if args.sleep > 0 and idx < len(tasks):
            await asyncio.sleep(args.sleep)

    logger.info("Experiment complete.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the RAG-vs-baseline paired experiment.")
    parser.add_argument("--dataset-ids", nargs="+", required=True)
    parser.add_argument("--n-reps", type=int, default=5)
    parser.add_argument("--max-attempts", type=int, default=3)
    parser.add_argument("--max-rqs", type=int, default=8)
    parser.add_argument("--rq-only", action="store_true")
    parser.add_argument("--use-filter", action="store_true")
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--sleep", type=float, default=0.0)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--allow-subprocess", action="store_true")
    parser.add_argument("--allow-empty-rag", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    
    args = parser.parse_args()
    asyncio.run(_main(args))

if __name__ == "__main__":
    main()

"""Offline batch judge script (T12).

Reads rq_batches.jsonl and trials.jsonl.
Outputs rq_batches_judged.jsonl and trials_judged.jsonl.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import random
from pathlib import Path
from typing import Any

from app.config import settings
from app.evaluation.rq_quality import compute_automatic_metrics, judge_rq_batch
from app.evaluation.code_quality import compute_static_signals, judge_code_quality, check_reproducibility
from app.evaluation.insight_quality import compute_automatic_insight_metrics, judge_insight_batch
from app.agents.schemas import ResearchQuestionItem

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("experiment.judge_trials")


def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    res = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                try:
                    res.append(json.loads(line))
                except Exception:
                    pass
    return res


def _write_jsonl(path: Path, data: list[dict]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for d in data:
            f.write(json.dumps(d, default=str) + "\n")


async def _judge_batch_record(
    batch: dict,
    judge_model: str,
    sem: asyncio.Semaphore,
) -> dict:
    if "judge" in batch:
        return batch  # idempotent

    async with sem:
        out = dict(batch)
        try:
            questions_raw = batch.get("questions_raw", [])
            questions = [
                ResearchQuestionItem(
                    category=q.get("category", "distribution"),
                    question_text=q.get("question_text", ""),
                    target_columns=q.get("target_columns", []),
                    rationale=q.get("rationale", ""),
                    expected_output_type=q.get("expected_output_type", "statistic"),
                ) for q in questions_raw
            ]
            profile_snap = batch.get("profile_snapshot", {})
            schema = profile_snap.get("schema_summary", [])
            stats = profile_snap.get("stats_summary", [])
            corr = profile_snap.get("correlation_summary", [])
            
            auto_metrics = compute_automatic_metrics(questions, schema, stats_summary=stats)
            rq_scores = await judge_rq_batch(questions, schema, stats, corr, judge_model=judge_model)
            
            out["judge"] = {
                "rq_scores": [s.model_dump() for s in rq_scores],
                "auto": auto_metrics.model_dump()
            }
        except Exception as e:
            out["judge"] = {"error": str(e)}
        return out


async def _judge_trial_record(
    trial: dict,
    code_judge_model: str,
    insight_judge_model: str,
    sem: asyncio.Semaphore,
    do_reproducibility: bool,
) -> dict:
    if trial.get("judge_scores", {}).get("skipped") or all(
        k in trial.get("judge_scores", {})
        for k in ("code_static", "code_quality", "insight_automatic", "insight")
    ):
        return trial

    out = dict(trial)
    js = out.get("judge_scores") or {}
    out["judge_scores"] = js

    attempts = trial.get("attempts", [])
    succeeded_attempts = [a for a in attempts if a.get("succeeded")]
    best = succeeded_attempts[-1] if succeeded_attempts else None

    if not best:
        js["skipped"] = "no_successful_execution"
        return out

    async with sem:
        code_text = best.get("code", "")
        stdout = best.get("stdout", "")
        qtext = trial.get("question", {}).get("text", "")
        
        # Code
        if "code_static" not in js:
            js["code_static"] = compute_static_signals(code_text).model_dump()

        if "code_quality" not in js:
            try:
                cq = await judge_code_quality(qtext, code_text, stdout, judge_model=code_judge_model)
                if cq:
                    js["code_quality"] = cq.model_dump()
            except Exception as e:
                js["error_code"] = str(e)
                
        if do_reproducibility and "reproducibility" not in js:
            # mock for now since check_reproducibility needs dataset_path etc.
            try:
                js["reproducibility"] = await check_reproducibility(code_text, trial.get("meta", {}).get("dataset_path", ""), trial["run_id"])
            except Exception:
                pass

        # Insight
        insight = trial.get("insight", {})
        summary = insight.get("summary_text", "")
        takeaways = insight.get("key_takeaways", [])
        
        if "insight_automatic" not in js:
            js["insight_automatic"] = compute_automatic_insight_metrics(summary, takeaways, stdout).model_dump()
            
        if "insight" not in js:
            try:
                # Add profile null stats for insight judge
                if "profile" not in trial:
                    trial["profile"] = {"null_stats": []} # Fallback
                ins = await judge_insight_batch([trial], insight_judge_model=insight_judge_model)
                if ins:
                    js["insight"] = {
                        "groundedness_rate": ins[0].groundedness_rate,
                        "caveat_mentioned": ins[0].caveat_mentioned,
                        "takeaway_scores": [s.model_dump() for s in ins[0].takeaway_scores],
                        "justification": ins[0].justification,
                    }
            except Exception as e:
                js["error_insight"] = str(e)

    return out


async def _main(args: argparse.Namespace) -> None:
    logs_dir = Path(settings.logs_dir)
    in_batches = logs_dir / "rq_batches.jsonl"
    out_batches = logs_dir / "rq_batches_judged.jsonl"
    in_trials = logs_dir / "trials.jsonl"
    out_trials = logs_dir / "trials_judged.jsonl"

    if args.force:
        if out_batches.exists(): out_batches.unlink()
        if out_trials.exists(): out_trials.unlink()

    rq_model = getattr(settings, "rq_judge_model", settings.insight_writer_model)
    code_model = getattr(settings, "code_judge_model", settings.insight_writer_model)
    ins_model = getattr(settings, "insight_judge_model", settings.insight_writer_model)

    gen_model = settings.question_generator_model
    if not args.allow_same_model:
        if rq_model == gen_model or code_model == gen_model or ins_model == gen_model:
            raise SystemExit("Error: Judge model is same as generator. Pass --allow-same-model to override.")

    sem = asyncio.Semaphore(args.concurrency)
    
    # 1. Batches
    batches = _read_jsonl(in_batches)
    judged_batches = _read_jsonl(out_batches)
    judged_batch_ids = {b["batch_id"]: b for b in judged_batches if "judge" in b and "error" not in b["judge"]}

    batches_to_judge = [b for b in batches if b["batch_id"] not in judged_batch_ids]
    if batches_to_judge:
        logger.info(f"Judging {len(batches_to_judge)} batches (already judged: {len(judged_batch_ids)})...")
        for idx, b in enumerate(batches_to_judge, 1):
            logger.info(f"  [Batch {idx}/{len(batches_to_judge)}] batch_id={b.get('batch_id')} (arm={b.get('arm')})...")
            res = await _judge_batch_record(b, rq_model, sem)
            b.update(res)
            judged_batch_ids[b["batch_id"]] = b
            for ob in batches:
                if ob["batch_id"] == b["batch_id"]:
                    ob.update(b)
            _write_jsonl(out_batches, batches)
            if args.sleep > 0:
                await asyncio.sleep(args.sleep)
    else:
        logger.info(f"All {len(batches)} batches already judged.")

    # 2. Trials
    trials = _read_jsonl(in_trials)
    judged_trials = _read_jsonl(out_trials)
    judged_trial_ids = {
        t["run_id"]: t for t in judged_trials
        if "skipped" in t.get("judge_scores", {}) or (
            "insight" in t.get("judge_scores", {}) and "error_insight" not in t.get("judge_scores", {})
        )
    }

    trials_to_judge = [t for t in trials if t["run_id"] not in judged_trial_ids]
    if trials_to_judge:
        logger.info(f"Judging {len(trials_to_judge)} trials (already judged: {len(judged_trial_ids)})...")
        for idx, t in enumerate(trials_to_judge, 1):
            logger.info(f"  [Trial {idx}/{len(trials_to_judge)}] run_id={t.get('run_id')} (arm={t.get('experiment_arm')})...")
            res = await _judge_trial_record(t, code_model, ins_model, sem, args.reproducibility)
            t.update(res)
            judged_trial_ids[t["run_id"]] = t
            for ot in trials:
                if ot["run_id"] == t["run_id"]:
                    ot.update(t)
            _write_jsonl(out_trials, trials)
            if args.sleep > 0:
                await asyncio.sleep(args.sleep)
    else:
        logger.info(f"All {len(trials)} trials already judged.")

    # 3. Human sample
    if args.human_sample > 0:
        sample = random.sample(trials, min(args.human_sample, len(trials)))
        import csv
        with open("judge_human_sample.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["run_id", "question", "code", "insight", "human_score"])
            for t in sample:
                w.writerow([t.get("run_id"), t.get("question", {}).get("text"), "", t.get("insight", {}).get("summary_text"), ""])

    logger.info("Scoring complete.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--concurrency", type=int, default=1)
    parser.add_argument("--sleep", type=float, default=0.0)
    parser.add_argument("--allow-same-model", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--reproducibility", action="store_true")
    parser.add_argument("--human-sample", type=int, default=0)
    args = parser.parse_args()
    asyncio.run(_main(args))

if __name__ == "__main__":
    main()

"""Structured trial-record telemetry (Part C of todo-priority.md).

Writes one JSON line per AnalysisRun to a JSONL file alongside the existing
SQLite rows, so the paper's analysis notebook can query trials without
re-deriving anything from the live DB. This module ONLY appends — it never
reads or mutates app state.

**Source routing (T05)**:
- `experiment_arm is None` → app run → writes to ``data/logs/app_trials.jsonl``
  with ``"source": "app"``.
- `experiment_arm` set → experiment run → writes to ``data/logs/trials.jsonl``
  with ``"source": "experiment"``.

`judge_scores` is intentionally left null at write time — an offline batch
job (not part of the live pipeline) fills it in later using
app/evaluation/rq_quality.py and app/evaluation/code_quality.py, keeping
judge LLM calls out of the live pipeline's latency/cost budget.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

_WRITE_LOCK = threading.Lock()


def _trials_file_path(source: str = "experiment") -> Path:
    """Return the correct JSONL path based on the record source."""
    logs_dir = Path(settings.logs_dir)
    logs_dir.mkdir(parents=True, exist_ok=True)
    if source == "app":
        return logs_dir / "app_trials.jsonl"
    return logs_dir / "trials.jsonl"


def build_trial_record(
    state: dict[str, Any],
    experiment_arm: str | None = None,
    trial_index: int = 0,
    extra_meta: dict | None = None,
) -> dict[str, Any]:
    """Convert a finished AnalysisState into the Part C JSONL trial shape.

    `experiment_arm is None` → app run (source="app").
    `experiment_arm` set → experiment run (source="experiment").
    `extra_meta` is merged under "meta" (e.g. batch_id, rq_index from T10).
    """
    source = "app" if experiment_arm is None else "experiment"
    arm = experiment_arm or "baseline"

    attempts_out = []
    code_by_attempt = {c["attempt_number"]: c["code_text"] for c in state.get("code_history", [])}
    for execution in state.get("execution_history", []):
        attempts_out.append(
            {
                "attempt_number": execution["attempt_number"],
                "code": code_by_attempt.get(execution["attempt_number"], ""),
                "exit_code": execution.get("exit_code"),
                "stdout": execution.get("stdout", ""),
                "stderr": execution.get("stderr", ""),
                "duration_ms": execution.get("duration_ms", 0),
                "succeeded": execution.get("succeeded", False),
            }
        )

    final_insight = state.get("final_insight") or {}
    failure_reason = None
    if state.get("status") == "failed":
        last = state.get("execution_history", [])
        failure_reason = classify_failure(last[-1]["stderr"]) if last else "unknown"

    sandbox_duration_ms = sum(e.get("duration_ms", 0) for e in state.get("execution_history", []))
    node_latency = state.get("node_llm_latency_ms", {})
    llm_duration_ms = sum(node_latency.values()) if node_latency else 0

    return {
        "run_id": state.get("run_id"),
        "dataset_id": state.get("dataset_id"),
        "rq_id": state.get("rq_id"),
        "source": source,
        "experiment_arm": arm,
        "trial_index": trial_index,
        "meta": extra_meta or {},
        "question": {
            "category": state.get("category"),
            "text": state.get("question_text"),
            "target_columns": state.get("target_columns", []),
        },
        "attempts": attempts_out,
        "insight": {
            "summary_text": final_insight.get("summary_text"),
            "key_takeaways": final_insight.get("key_takeaways", []),
        },
        "metrics": {
            "prompt_tokens": state.get("prompt_tokens", 0),
            "completion_tokens": state.get("completion_tokens", 0),
            "total_tokens": state.get("total_tokens", 0),
            "llm_call_count": state.get("llm_call_count", 0),
            "correction_attempts": max(state.get("attempts", 1) - 1, 0),
            # T07 latency breakdown
            "end_to_end_ms": state.get("end_to_end_ms", 0),
            "total_duration_ms": state.get("end_to_end_ms", 0),  # backward compat alias
            "sandbox_duration_ms": sandbox_duration_ms,
            "llm_duration_ms": llm_duration_ms,
            "retry_wait_ms": int(state.get("retry_wait_seconds", 0.0) * 1000),
            # §4.3.4 — per-node breakdown
            "node_llm_calls": state.get("node_llm_calls", {}),
            "node_prompt_tokens": state.get("node_prompt_tokens", {}),
            "node_completion_tokens": state.get("node_completion_tokens", {}),
            "node_total_tokens": state.get("node_total_tokens", {}),
            "node_llm_latency_ms": node_latency,
            # §4.3.4 — rate-limit resilience
            "rate_limit_retry_count": state.get("rate_limit_retry_count", 0),
            "other_retry_count": state.get("other_retry_count", 0),
        },
        "judge_scores": {
            "relevance": None,
            "specificity": None,
            "actionability": None,
            "code_quality": None,
        },
        "failure_reason": failure_reason,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# Simple, extensible failure taxonomy (Part B.4 "Failure Taxonomy" metric).
_FAILURE_PATTERNS: list[tuple[str, str]] = [
    ("KeyError", "column_keyerror"),
    ("TimeoutExpired", "timeout"),
    ("timed out", "timeout"),
    ("dtype", "dtype_mismatch"),
    ("TypeError", "type_error"),
    ("ValueError", "value_error"),
    ("JSONDecodeError", "llm_malformed_json"),
    ("MemoryError", "sandbox_oom"),
]


def classify_failure(stderr: str) -> str:
    """Rule-based failure-taxonomy classifier for the Part B.4 metric.

    Kept deliberately simple/extensible: a first match wins list of
    substrings rather than a full parser, since the paper only needs
    frequency counts per category, not perfect root-cause diagnosis.
    """
    if not stderr:
        return "unknown"
    for needle, label in _FAILURE_PATTERNS:
        if needle in stderr:
            return label
    return "other"


def record_trial(
    state: dict[str, Any],
    experiment_arm: str | None = None,
    trial_index: int = 0,
    extra_meta: dict | None = None,
) -> None:
    """Append one trial record to the correct JSONL telemetry file.

    - experiment_arm is None  → app run → app_trials.jsonl
    - experiment_arm set      → experiment run → trials.jsonl

    Best-effort: any failure here is logged and swallowed so telemetry can
    never take down a real user's pipeline run.
    """
    try:
        record = build_trial_record(
            state,
            experiment_arm=experiment_arm,
            trial_index=trial_index,
            extra_meta=extra_meta,
        )
        source = record["source"]
        line = json.dumps(record, default=str)
        path = _trials_file_path(source)
        with _WRITE_LOCK:
            with open(path, "a", encoding="utf-8") as f:
                f.write(line + "\n")
                f.flush()
                os.fsync(f.fileno())
    except Exception:
        logger.exception("telemetry: failed to record trial for run_id=%s", state.get("run_id"))


def record_rq_batch(record: dict[str, Any], source: str = "app") -> None:
    """Append one RQ-batch record to the correct JSONL log (T07).

    - source="app"        → app_rq_batches.jsonl
    - source="experiment" → rq_batches.jsonl
    """
    try:
        logs_dir = Path(settings.logs_dir)
        logs_dir.mkdir(parents=True, exist_ok=True)
        fname = "app_rq_batches.jsonl" if source == "app" else "rq_batches.jsonl"
        path = logs_dir / fname
        line = json.dumps(record, default=str)
        with _WRITE_LOCK:
            with open(path, "a", encoding="utf-8") as f:
                f.write(line + "\n")
                f.flush()
                os.fsync(f.fileno())
    except Exception:
        logger.exception("telemetry: failed to record rq_batch")


def iter_trials(path: Path | None = None, source: str = "experiment"):
    """Read back trial records for the offline batch-scoring script / notebook."""
    p = path or _trials_file_path(source)
    if not p.exists():
        return
    with open(p, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)

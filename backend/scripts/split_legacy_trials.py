#!/usr/bin/env python3
"""One-off script to split legacy trials.jsonl into app vs experiment files (T05).

Legacy trials.jsonl may contain app runs recorded before source routing was
implemented.  This script moves records with rq_id NOT starting with 'exp-'
or 'batch-' to app_trials.jsonl.

Run once from the backend/ directory:
    python backend/scripts/split_legacy_trials.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Resolve the data/logs directory relative to this script.
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent

# Default logs dir (can be overridden via env if different)
LOGS_DIR = BACKEND_DIR.parent / "data" / "logs"
TRIALS_FILE = LOGS_DIR / "trials.jsonl"
APP_TRIALS_FILE = LOGS_DIR / "app_trials.jsonl"


def main() -> None:
    if not TRIALS_FILE.exists():
        print(f"[split_legacy_trials] {TRIALS_FILE} does not exist, nothing to do.")
        return

    records = []
    with open(TRIALS_FILE, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f"  WARNING: line {line_no} is not valid JSON: {e}", file=sys.stderr)

    experiment_records = []
    app_records = []
    for r in records:
        rq_id = r.get("rq_id") or ""
        source = r.get("source", "")
        if source == "experiment" or rq_id.startswith(("exp-", "batch-")):
            experiment_records.append(r)
        else:
            app_records.append(r)

    print(f"[split_legacy_trials] Total records: {len(records)}")
    print(f"  → experiment (kept in trials.jsonl): {len(experiment_records)}")
    print(f"  → app (moved to app_trials.jsonl): {len(app_records)}")

    if app_records:
        # Append to app_trials.jsonl (never overwrite — it may already have records)
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        with open(APP_TRIALS_FILE, "a", encoding="utf-8") as f:
            for r in app_records:
                f.write(json.dumps(r, default=str) + "\n")
        print(f"  Appended {len(app_records)} records to {APP_TRIALS_FILE}")

        # Rewrite trials.jsonl with only experiment records
        with open(TRIALS_FILE, "w", encoding="utf-8") as f:
            for r in experiment_records:
                f.write(json.dumps(r, default=str) + "\n")
        print(f"  Rewrote {TRIALS_FILE} with {len(experiment_records)} experiment records")
    else:
        print("  No app records found, trials.jsonl unchanged.")


if __name__ == "__main__":
    main()

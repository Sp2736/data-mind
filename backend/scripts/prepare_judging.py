"""prepare_judging.py -- bridge app-path logs to experiment-path judging.

PROBLEM SOLVED
--------------
The judge_trials.py and analyze_results.py scripts consume:
    data/logs/rq_batches.jsonl
    data/logs/trials.jsonl

But all your actual data lives in:
    data/logs/app_rq_batches.jsonl
    data/logs/app_trials.jsonl

Additionally, each dataset was uploaded twice (once for RAG, once for baseline),
giving each arm a different dataset_id -- so there is no natural pairing key.

WHAT THIS SCRIPT DOES
---------------------
1. Reads SQLite (read-only) to resolve dataset_id -> filename.
2. Groups batches by (filename, arm); picks one representative per group
   (the one with the most questions, ties broken by latest timestamp).
3. Assigns a stable canonical_dataset_id per filename (SHA-256 of filename).
   Both RAG and baseline runs of "athlete_events.csv" share the same
   canonical id, enabling paired statistical tests downstream.
4. Corrects each trial's experiment_arm: app-path always recorded "baseline"
   due to the run_analysis() default -- this script re-infers the arm from
   the trial's dataset_id via the batch map.
5. Writes rq_batches.jsonl and trials.jsonl (inputs to judge_trials.py)
   and dataset_pairing.json (audit trail).

MERGING TEAMMATE DATA
---------------------
After running sync_data to bring in your teammate's logs, re-run this script
with --force. Her datasets (different filenames from yours) will be appended
and will pair correctly. If she ran the same filenames as you, the
representative-picking logic (most questions, latest timestamp) will keep
the best copy.

USAGE
-----
    # From backend/ directory:
    python scripts/prepare_judging.py
    python scripts/prepare_judging.py --paired-only    # only fully-paired datasets
    python scripts/prepare_judging.py --force           # overwrite existing output
    python scripts/prepare_judging.py --logs-dir ../data/logs --db-path ../data/datamind.db
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from collections import defaultdict
from pathlib import Path


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    records: list[dict] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                try:
                    records.append(json.loads(line))
                except Exception:
                    pass
    return records


def _write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, default=str) + "\n")


# ---------------------------------------------------------------------------
# Canonical dataset ID
# ---------------------------------------------------------------------------

def _canonical_id(filename: str) -> str:
    """Stable, deterministic dataset_id derived from the filename alone.

    Both RAG and baseline entries for e.g. 'athlete_events.csv' will share
    this id, enabling paired analysis downstream.
    """
    h = hashlib.sha256(filename.strip().lower().encode()).hexdigest()[:12]
    return f"ds_canonical_{h}"


def _filename_from_raw_path(raw_path: str) -> str:
    """Extract the bare filename from an absolute raw_path column value."""
    return Path(raw_path).name


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def _pick_representative(candidates: list[dict]) -> dict:
    """From multiple batches for the same (filename, arm), pick the best one.

    Priority: most questions_raw -> latest timestamp (ISO string sort is fine).
    """
    return max(
        candidates,
        key=lambda b: (len(b.get("questions_raw", [])), b.get("timestamp", "")),
    )


def run(args: argparse.Namespace) -> None:
    logs_dir = Path(args.logs_dir).resolve()
    db_path = Path(args.db_path).resolve()
    out_batches = logs_dir / "rq_batches.jsonl"
    out_trials = logs_dir / "trials.jsonl"
    out_pairing = logs_dir / "dataset_pairing.json"

    # Guard: refuse to overwrite unless --force
    if not args.force and (out_batches.exists() or out_trials.exists()):
        existing = [str(p) for p in [out_batches, out_trials] if p.exists()]
        raise SystemExit(
            f"Output file(s) already exist: {existing}\n"
            "Re-run with --force to overwrite (safe -- judge_trials.py is idempotent)."
        )

    # ------------------------------------------------------------------
    # 1. Load dataset_id -> filename from DB (read-only)
    # ------------------------------------------------------------------
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    cur = conn.cursor()
    cur.execute("SELECT id, filename FROM datasets")
    ds_id_to_filename: dict[str, str] = {
        row[0]: _filename_from_raw_path(row[1]) for row in cur.fetchall()
    }
    conn.close()
    print(f"[DB] Loaded {len(ds_id_to_filename)} datasets.")

    # ------------------------------------------------------------------
    # 2. Read app batches; group by (filename, arm)
    # ------------------------------------------------------------------
    app_batches = _read_jsonl(logs_dir / "app_rq_batches.jsonl")
    if not app_batches:
        raise SystemExit("app_rq_batches.jsonl is empty or missing -- nothing to process.")
    print(f"[BATCHES] Loaded {len(app_batches)} records from app_rq_batches.jsonl.")

    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    unknown_ds_ids: set[str] = set()
    for batch in app_batches:
        ds_id = batch.get("dataset_id", "")
        filename = ds_id_to_filename.get(ds_id)
        if not filename:
            unknown_ds_ids.add(ds_id)
            continue
        arm = batch.get("arm", "baseline")
        grouped[(filename, arm)].append(batch)

    if unknown_ds_ids:
        print(f"[WARN] {len(unknown_ds_ids)} batch(es) had unknown dataset_id -- skipped.")

    # Pick one representative per (filename, arm)
    chosen: dict[tuple[str, str], dict] = {
        key: _pick_representative(cands) for key, cands in grouped.items()
    }

    all_filenames: set[str] = {fn for (fn, _) in chosen}
    rag_fns = {fn for (fn, arm) in chosen if arm == "rag"}
    base_fns = {fn for (fn, arm) in chosen if arm == "baseline"}
    both_fns = rag_fns & base_fns

    print(f"\n[PAIRING]  Distinct filenames: {len(all_filenames)}")
    print(f"           RAG-only:           {len(rag_fns - base_fns)}")
    print(f"           Baseline-only:      {len(base_fns - rag_fns)}")
    print(f"           Both arms:          {len(both_fns)}")

    include_fns = both_fns if args.paired_only else all_filenames
    if args.paired_only:
        print(f"[INFO] --paired-only: including {len(include_fns)} fully-paired filenames.")
    else:
        print(f"[INFO] Including all {len(include_fns)} filenames.")
        if rag_fns - base_fns:
            print(f"       RAG-only ({len(rag_fns - base_fns)}): "
                  f"{sorted(rag_fns - base_fns)} -- baseline will come from teammate merge.")
        if base_fns - rag_fns:
            print(f"       Baseline-only ({len(base_fns - rag_fns)}): "
                  f"{sorted(base_fns - rag_fns)} -- RAG will come from teammate merge.")

    # ------------------------------------------------------------------
    # 3. Build output batch records + mapping tables
    # ------------------------------------------------------------------
    # Maps used for trial rewriting
    ds_id_to_canonical: dict[str, str] = {}   # original_ds_id -> canonical_id
    ds_id_to_arm: dict[str, str] = {}          # original_ds_id -> arm

    out_batch_records: list[dict] = []
    pairing_info: dict[str, dict] = {}

    for filename in sorted(include_fns):
        canonical = _canonical_id(filename)
        pairing_info[filename] = {
            "canonical_dataset_id": canonical,
            "rag_original_dataset_id": None,
            "baseline_original_dataset_id": None,
        }
        for arm in ("rag", "baseline"):
            key = (filename, arm)
            if key not in chosen:
                continue
            batch = dict(chosen[key])
            original_id = batch.get("dataset_id", "")
            ds_id_to_canonical[original_id] = canonical
            ds_id_to_arm[original_id] = arm
            pairing_info[filename][f"{arm}_original_dataset_id"] = original_id
            # Rewrite fields
            batch["original_dataset_id"] = original_id
            batch["dataset_id"] = canonical
            batch["source"] = "experiment"
            out_batch_records.append(batch)

    # ------------------------------------------------------------------
    # 4. Read trials; correct arm + dataset_id
    # ------------------------------------------------------------------
    app_trials = _read_jsonl(logs_dir / "app_trials.jsonl")
    print(f"\n[TRIALS]   Loaded {len(app_trials)} records from app_trials.jsonl.")

    out_trial_records: list[dict] = []
    skipped_no_mapping = 0
    arm_fixed = 0
    for trial in app_trials:
        original_id = trial.get("dataset_id", "")
        if original_id not in ds_id_to_canonical:
            skipped_no_mapping += 1
            continue
        t = dict(trial)
        t["original_dataset_id"] = original_id
        t["dataset_id"] = ds_id_to_canonical[original_id]
        # Fix arm -- app-path always wrote "baseline" as default regardless of
        # whether the questions were RAG-generated; infer from the batch map.
        inferred_arm = ds_id_to_arm.get(original_id)
        if inferred_arm and t.get("experiment_arm") != inferred_arm:
            t["experiment_arm"] = inferred_arm
            arm_fixed += 1
        out_trial_records.append(t)

    print(f"           Included:  {len(out_trial_records)}")
    print(f"           Skipped (no batch mapping): {skipped_no_mapping}")
    print(f"           Arm labels corrected: {arm_fixed}")

    # ------------------------------------------------------------------
    # 5. Write output files
    # ------------------------------------------------------------------
    _write_jsonl(out_batches, out_batch_records)
    _write_jsonl(out_trials, out_trial_records)
    with open(out_pairing, "w", encoding="utf-8") as f:
        json.dump(pairing_info, f, indent=2)

    # ------------------------------------------------------------------
    # 6. Summary
    # ------------------------------------------------------------------
    rag_batches_out = sum(1 for b in out_batch_records if b.get("arm") == "rag")
    base_batches_out = sum(1 for b in out_batch_records if b.get("arm") == "baseline")
    rag_trials_out = sum(1 for t in out_trial_records if t.get("experiment_arm") == "rag")
    base_trials_out = sum(1 for t in out_trial_records if t.get("experiment_arm") == "baseline")
    paired_count = sum(
        1 for info in pairing_info.values()
        if info.get("rag_original_dataset_id") and info.get("baseline_original_dataset_id")
    )

    print(f"""
+------------------------------------------------------+
|               prepare_judging.py -- done             |
+------------------------------------------------------+
|  Output files                                        |
|    rq_batches.jsonl : {out_batches}
|    trials.jsonl     : {out_trials}
|    dataset_pairing  : {out_pairing}
+------------------------------------------------------+
|  Batch records  : {len(out_batch_records):>4}  (RAG {rag_batches_out:>3}, baseline {base_batches_out:>3})
|  Trial records  : {len(out_trial_records):>4}  (RAG {rag_trials_out:>3}, baseline {base_trials_out:>3})
|  Canonical IDs  : {len(pairing_info):>4}
|  Fully paired   : {paired_count:>4} / {len(pairing_info)} datasets
+------------------------------------------------------+

Next steps:
  1. python -m experiment.judge_trials --allow-same-model
  2. python -m experiment.analyze_results
  3. After teammate merge: python scripts/prepare_judging.py --force  (re-run)
                           python -m experiment.judge_trials --allow-same-model  (idempotent -- only scores new records)
""")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--logs-dir",
        default="../data/logs",
        help="Path to data/logs directory (default: ../data/logs relative to backend/)",
    )
    parser.add_argument(
        "--db-path",
        default="../data/datamind.db",
        help="Path to datamind.db (default: ../data/datamind.db relative to backend/)",
    )
    parser.add_argument(
        "--paired-only",
        action="store_true",
        help="Only include datasets where both RAG and baseline batches already exist locally. "
             "Default: include all (unpaired ones will be completed by teammate merge later).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing rq_batches.jsonl / trials.jsonl. Safe because "
             "judge_trials.py is idempotent and skips already-judged records.",
    )
    run(parser.parse_args())


if __name__ == "__main__":
    main()

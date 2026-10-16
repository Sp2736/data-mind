"""sync_data.py -- Bidirectional data export and merge tool for DataMind.

Usage:
    # 1. Export local data to a portable ZIP bundle:
    python scripts/sync_data.py export --out teammate_data.zip

    # 2. Import & merge bundle on another machine:
    python scripts/sync_data.py import --bundle teammate_data.zip

    # 3. Dry-run to inspect what would be merged without writing:
    python scripts/sync_data.py import --bundle teammate_data.zip --dry-run
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path

# Add backend/ to path so app modules import cleanly
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))


def _get_project_root() -> Path:
    return _BACKEND_DIR.parent


def _get_data_dir() -> Path:
    return _get_project_root() / "data"


# ---------------------------------------------------------------------------
# EXPORT
# ---------------------------------------------------------------------------

def run_export(out_zip: Path, include_raw: bool = False) -> None:
    data_dir = _get_data_dir()
    db_path = data_dir / "datamind.db"
    if not db_path.exists():
        raise SystemExit(f"Database not found at {db_path}")

    print(f"[EXPORT] Packaging DataMind data from {data_dir}...")
    out_zip = out_zip.resolve()
    out_zip.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_str:
        tmp_dir = Path(tmp_str)
        manifest = {
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "source_platform": sys.platform,
            "included_raw_datasets": include_raw,
        }

        # 1. SQLite database copy
        shutil.copy2(db_path, tmp_dir / "datamind.db")
        print("  - Copied SQLite database.")

        # 2. ChromaDB vectors export (fast direct read, no model loading)
        try:
            import chromadb
            from app.config import settings
            client = chromadb.PersistentClient(path=settings.rag_persist_dir)
            col = client.get_collection("datamind_insights")
            count = col.count()
            if count > 0:
                data = col.get(include=["documents", "metadatas"])
                chroma_records = []
                for i in range(len(data["ids"])):
                    chroma_records.append({
                        "id": data["ids"][i],
                        "document": data["documents"][i] if data.get("documents") else "",
                        "metadata": data["metadatas"][i] if data.get("metadatas") else {},
                    })
                with open(tmp_dir / "chroma_export.jsonl", "w", encoding="utf-8") as f:
                    for rec in chroma_records:
                        f.write(json.dumps(rec, default=str) + "\n")
                print(f"  - Exported {len(chroma_records)} Chroma vectors.")
                manifest["chroma_count"] = len(chroma_records)
            else:
                print("  - Chroma collection is empty.")
                manifest["chroma_count"] = 0
        except Exception as e:
            print(f"  [WARN] Could not export ChromaDB vectors: {e}")
            manifest["chroma_error"] = str(e)

        # 3. Raw datasets (optional)
        raw_dir = data_dir / "datasets" / "raw"
        if include_raw and raw_dir.exists():
            shutil.copytree(raw_dir, tmp_dir / "datasets" / "raw", dirs_exist_ok=True)
            print("  - Copied raw datasets directory.")
        else:
            print("  - Raw CSVs excluded by default (use --include-raw if needed).")

        # 4. Generated code (excluding duplicate sandbox CSV copies)
        code_dir = data_dir / "generated_code"
        if code_dir.exists():
            shutil.copytree(
                code_dir,
                tmp_dir / "generated_code",
                ignore=shutil.ignore_patterns("*.csv"),
                dirs_exist_ok=True,
            )
            print("  - Copied generated code directory (excluding duplicate sandbox CSV copies).")

        # 5. Telemetry logs
        logs_dir = data_dir / "logs"
        if logs_dir.exists():
            target_logs = tmp_dir / "logs"
            target_logs.mkdir(parents=True, exist_ok=True)
            copied_logs = 0
            for src in logs_dir.glob("*.jsonl"):
                shutil.copy2(src, target_logs / src.name)
                copied_logs += 1
            for src in logs_dir.glob("*.json"):
                shutil.copy2(src, target_logs / src.name)
                copied_logs += 1
            print(f"  - Copied {copied_logs} log/pairing files.")

        # 6. Write manifest
        with open(tmp_dir / "manifest.json", "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

        # 7. Create ZIP archive
        print(f"  - Compressing into {out_zip}...")
        with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(tmp_dir):
                for f in files:
                    full_p = Path(root) / f
                    rel_p = full_p.relative_to(tmp_dir)
                    zf.write(full_p, rel_p)

    size_mb = out_zip.stat().st_size / (1024 * 1024)
    print(f"\n[DONE] Successfully created export bundle: {out_zip} ({size_mb:.2f} MB)")


# ---------------------------------------------------------------------------
# IMPORT & MERGE
# ---------------------------------------------------------------------------

def _merge_sqlite(target_db: Path, source_db: Path, dry_run: bool = False) -> dict[str, int]:
    conn = sqlite3.connect(target_db)
    cur = conn.cursor()
    cur.execute("ATTACH DATABASE ? AS bundle_db", (str(source_db),))

    cur.execute("SELECT name FROM bundle_db.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = [r[0] for r in cur.fetchall()]

    table_inserts: dict[str, int] = {}
    for table in tables:
        if table == "alembic_version":
            continue
        # Count before
        cur.execute(f"SELECT COUNT(*) FROM main.{table}")
        count_before = cur.fetchone()[0]

        if not dry_run:
            cur.execute(f"INSERT OR IGNORE INTO main.{table} SELECT * FROM bundle_db.{table}")
            conn.commit()
            cur.execute(f"SELECT COUNT(*) FROM main.{table}")
            count_after = cur.fetchone()[0]
            table_inserts[table] = count_after - count_before
        else:
            cur.execute(f"SELECT COUNT(*) FROM bundle_db.{table}")
            bundle_count = cur.fetchone()[0]
            table_inserts[table] = bundle_count

    cur.execute("DETACH DATABASE bundle_db")
    conn.close()
    return table_inserts


def _merge_jsonl(target_path: Path, source_path: Path, key_field: str, dry_run: bool = False) -> int:
    if not source_path.exists():
        return 0
    existing_records: list[dict] = []
    seen_keys: set[str] = set()

    if target_path.exists():
        with open(target_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    try:
                        rec = json.loads(line)
                        existing_records.append(rec)
                        if rec.get(key_field):
                            seen_keys.add(rec[key_field])
                    except Exception:
                        pass

    new_count = 0
    incoming_to_add: list[dict] = []
    with open(source_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                try:
                    rec = json.loads(line)
                    k = rec.get(key_field)
                    if k and k not in seen_keys:
                        seen_keys.add(k)
                        incoming_to_add.append(rec)
                        new_count += 1
                except Exception:
                    pass

    if not dry_run and incoming_to_add:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with open(target_path, "a", encoding="utf-8") as f:
            for rec in incoming_to_add:
                f.write(json.dumps(rec, default=str) + "\n")

    return new_count


def run_import(bundle_zip: Path, dry_run: bool = False) -> None:
    data_dir = _get_data_dir()
    db_path = data_dir / "datamind.db"
    if not bundle_zip.exists():
        raise SystemExit(f"Bundle file not found: {bundle_zip}")

    print(f"[IMPORT] Unpacking {bundle_zip}...")
    with tempfile.TemporaryDirectory() as tmp_str:
        tmp_dir = Path(tmp_str)
        with zipfile.ZipFile(bundle_zip, "r") as zf:
            zf.extractall(tmp_dir)

        manifest_file = tmp_dir / "manifest.json"
        if manifest_file.exists():
            with open(manifest_file, "r", encoding="utf-8") as f:
                manifest = json.load(f)
            print(f"  - Bundle created at: {manifest.get('timestamp')}")

        bundle_db = tmp_dir / "datamind.db"
        if not bundle_db.exists():
            raise SystemExit("Bundle is invalid: datamind.db not found in ZIP.")

        # 1. Safety backup first
        if not dry_run:
            ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_dir = data_dir / "_backups" / f"pre_sync_{ts}"
            backup_dir.mkdir(parents=True, exist_ok=True)
            if db_path.exists():
                shutil.copy2(db_path, backup_dir / "datamind.db")
            rag_dir = data_dir / "rag_store"
            if rag_dir.exists():
                shutil.copytree(rag_dir, backup_dir / "rag_store", dirs_exist_ok=True)
            print(f"  - Created safety backup at {backup_dir}")

        # 2. SQLite merge
        print("\n[MERGE: SQLITE]")
        inserts = _merge_sqlite(db_path, bundle_db, dry_run=dry_run)
        action_verb = "Would insert" if dry_run else "Inserted"
        for tbl, count in sorted(inserts.items()):
            print(f"  - {tbl:20}: {action_verb} {count} new records")

        # 3. ChromaDB merge
        chroma_file = tmp_dir / "chroma_export.jsonl"
        print("\n[MERGE: CHROMADB]")
        if chroma_file.exists():
            records = []
            with open(chroma_file, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        try:
                            records.append(json.loads(line))
                        except Exception:
                            pass
            if records:
                if not dry_run:
                    from app.rag.store import get_collection
                    col = get_collection()
                    ids = [r["id"] for r in records]
                    docs = [r["document"] for r in records]
                    metas = [r["metadata"] for r in records]
                    col.upsert(ids=ids, documents=docs, metadatas=metas)
                    print(f"  - Upserted {len(records)} vectors into local Chroma collection.")
                else:
                    print(f"  - Would upsert {len(records)} vectors into local Chroma collection.")
            else:
                print("  - No vectors in bundle.")
        else:
            print("  - No Chroma export file found in bundle.")

        # 4. Copy raw datasets and generated code
        print("\n[MERGE: FILES]")
        for subpath in [("datasets", "raw"), ("generated_code",)]:
            src = tmp_dir.joinpath(*subpath)
            dst = data_dir.joinpath(*subpath)
            if src.exists():
                if not dry_run:
                    shutil.copytree(src, dst, dirs_exist_ok=True)
                    print(f"  - Merged directory: data/{'/'.join(subpath)}/")
                else:
                    print(f"  - Would merge directory: data/{'/'.join(subpath)}/")

        # 5. Merge telemetry logs
        print("\n[MERGE: LOGS]")
        target_logs = data_dir / "logs"
        bundle_logs = tmp_dir / "logs"
        b_batches = _merge_jsonl(
            target_logs / "app_rq_batches.jsonl",
            bundle_logs / "app_rq_batches.jsonl",
            key_field="batch_id",
            dry_run=dry_run,
        )
        b_trials = _merge_jsonl(
            target_logs / "app_trials.jsonl",
            bundle_logs / "app_trials.jsonl",
            key_field="run_id",
            dry_run=dry_run,
        )
        action_verb = "Would add" if dry_run else "Added"
        print(f"  - app_rq_batches.jsonl: {action_verb} {b_batches} new batch records")
        print(f"  - app_trials.jsonl:     {action_verb} {b_trials} new trial records")

    print("\n[DONE] Import completed successfully." if not dry_run else "\n[DRY RUN] Completed check. No files modified.")
    if not dry_run:
        print("\nNext step: Re-run prepare_judging to rebuild combined experiment inputs:")
        print("  python scripts/prepare_judging.py --force")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # export
    p_export = subparsers.add_parser("export", help="Export local DataMind data into a ZIP bundle.")
    p_export.add_argument("--out", type=Path, default=Path("datamind_bundle.zip"), help="Output ZIP path.")
    p_export.add_argument(
        "--include-raw",
        action="store_true",
        help="Include full raw dataset CSV files (warning: can be multi-gigabyte). Default: False.",
    )

    # import
    p_import = subparsers.add_parser("import", help="Import & merge a ZIP bundle into local DataMind.")
    p_import.add_argument("--bundle", type=Path, required=True, help="Input ZIP bundle to import.")
    p_import.add_argument("--dry-run", action="store_true", help="Inspect without modifying local data.")

    args = parser.parse_args()
    if args.command == "export":
        run_export(args.out, include_raw=args.include_raw)
    elif args.command == "import":
        run_import(args.bundle, dry_run=args.dry_run)


if __name__ == "__main__":
    main()

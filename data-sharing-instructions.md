Listed directory data
Listed directory logs
Listed directory datasets
Listed directory raw
Listed directory generated_code
Listed directory rag_store
Ran command: `dir d:\SWAYAM\STUDIES\PROJECTS\data-mind`
Ran command: `Get-ChildItem -Path d:\SWAYAM\STUDIES\PROJECTS\data-mind -Filter "*SPEC*" -Recurse -File`
Ran command: `git status`
Ran command: `git check-ignore -v DATAMIND_AGENT_SPEC.md`
Ran command: `venv\Scripts\python -c "import sqlite3; conn = sqlite3.connect('file:d:/SWAYAM/STUDIES/PROJECTS/data-mind/data/datamind.db?mode=ro', uri=True); cur = conn.cursor(); cur.execute('SELECT name FROM sqlite_master WHERE type=\'table\';'); print([r[0] for r in cur.fetchall()])"`
Viewed store.py:1-56

Because the `data/` directory contains stateful, local stores, **you cannot simply copy and replace the `data/` folder**, otherwise one person's work will overwrite the other's (e.g. your 15 datasets will replace her datasets, or vice-versa).

Here is how the data is structured and how each part must be handled to achieve a seamless, bidirectional merge:

---

### The 4 Parts of the `data/` Directory

| Component | What it is | Why simple overwrite fails | Safe Merge Method |
|---|---|---|---|
| **`data/datasets/raw/`** & **`data/generated_code/`** | Raw CSV/JSON files and Python code runs | Safe — every subfolder is named after a unique UUID (`ds_...`, `run_...`) | **Direct file copy / folder union**. No collisions exist. |
| **`data/datamind.db`** | SQLite relational DB (datasets, profiles, questions, runs, insights, metrics) | Replacing `datamind.db` deletes the other person's rows | **Relational SQL merge (`INSERT OR IGNORE`)**. Because all primary keys are UUIDs, records from both DBs combine without conflicting IDs. |
| **`data/rag_store/`** | ChromaDB vector store (`chroma.sqlite3`) | Overwriting replaces the internal index entirely | **Export & Upsert**. Export Chroma items (`id`, `document`, `metadata`) to JSONL, then run `collection.upsert()` on the destination machine. |
| **`data/logs/`** | `app_trials.jsonl`, `app_rq_batches.jsonl` | File overwrite loses lines | **JSONL deduplication / append** keyed by `batch_id` and `run_id`. |

---

### Recommended Solution: A 1-Click `sync_data.py` Tool

To make this effortless and error-free for both of you, we can create a script (`backend/scripts/sync_data.py`) with two commands:

#### 1. Export (e.g., run by your teammate on her machine):
```bash
python scripts/sync_data.py export --out teammate_data.zip
```
This automatically:
- Dumps all her SQLite records (`datasets`, `dataset_profiles`, `research_questions`, `analysis_runs`, `generated_code`, `execution_attempts`, `insights`, `visualizations`, `reports`, `run_metrics`) into a portable bundle.
- Exports her Chroma vectors (text + metadata).
- Collects raw dataset files, generated code, and log files.
- Packages everything into a single zip file.

#### 2. Import & Merge (run by you on your machine):
```bash
python scripts/sync_data.py import --bundle teammate_data.zip
```
This automatically:
- Backs up your existing DB and Chroma store first (safety net).
- Merges all her SQLite records into your `datamind.db` using `INSERT OR IGNORE`.
- Upserts her Chroma vectors into your local Chroma store using the same embedding model.
- Copies her raw dataset folders and generated code into your `data/datasets/raw/` and `data/generated_code/`.
- Merges and deduplicates JSONL logs.

#### 3. Reciprocal Sync:
You then run `python scripts/sync_data.py export --out swayam_data.zip`, send it to her, and she imports it.

**Result:** Both machines will have all 30 datasets, all runs, all insights, all Chroma vectors, and all telemetry logs combined.

---

Would you like me to create this `sync_data.py` script now and verify it with automated tests?
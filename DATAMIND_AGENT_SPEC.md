# DATAMIND_AGENT_SPEC.md

**Audience:** an autonomous coding agent (Claude Sonnet inside Antigravity) working in the DataMind repository.
**Owner:** Jalisa (runs this on one machine; a teammate runs the same protocol on a second machine).
**Goal:** prepare the repository and tooling so the two of them can run a paired **RAG vs baseline** experiment on 60 datasets, merge the results, judge them, and produce the tables and figures for a conference paper (Section 4 *Evaluation Methodology* and Section 5 *Results*).

Read this whole file before doing anything. Work **phase by phase** and stop at every **STOP** marker.

---

## 0. Rules of engagement (non-negotiable)

1. **Orient before you edit.** Phase 1 is read-only. Do not modify code, the database, Chroma, or logs until the Phase 1 report is written and the owner has seen it.
2. **Never spend LLM budget on your own.** Do **not** run `run_experiment.py` (except `--dry-run`), `judge_trials.py`, `seed_datasets.py`, the corpus builder, the pilot, or anything that calls Gemini/OpenRouter, unless the owner explicitly says to. Everything you build must be testable offline (fixtures, mocks, `--dry-run`) wherever possible.
3. **Never touch real data destructively.** Do not delete or rewrite `data/datamind.db`, `data/rag_store/`, or `data/logs/*`. Work on copies in a temp dir when you need to test against real data. Open SQLite **read-only** (`sqlite3.connect("file:<path>?mode=ro", uri=True)`).
4. **Secrets:** never print, log, or commit values from `.env`, `~/.kaggle/kaggle.json`, API keys, or JWT secrets. Report only whether a key is present.
5. **Discover, don't assume.** Where this spec says "verify", open the code or the data and confirm. If reality differs from this document, trust reality, and note the discrepancy in your report.
6. **Small, reviewable changes.** Create a branch `experiment-prep`. One commit per task ID (e.g. `E-03: ...`). Do not refactor unrelated code. Do not reformat files you are not changing.
7. **Cross-platform.** The repo appears to live on Windows (a `desktop.ini` is present). Detect the OS first. Write helper tooling in Python using `pathlib`, not bash-only pipelines. When giving shell commands, give both PowerShell and bash forms for environment variables (`$env:LOGS_DIR="..."` vs `LOGS_DIR=... cmd`).
8. **Ask when ambiguous** (one concise question), otherwise pick the simplest option and record the decision.
9. After each task, report: files changed, how you tested it, and anything the owner must do manually.

---

## 1. Phase 1: Orientation (read-only)

Produce `docs/AGENT_ORIENTATION_REPORT.md`. Its purpose is that you, and the owner, know exactly what already exists before anything is built. Do not skip any subsection.

### 1.1 Repository map

- Run `git status`, `git log --oneline -20`, current branch, uncommitted changes.
- List top-level files and the structure of `backend/app`, `backend/experiment`, `backend/scripts`, `backend/tests`, `frontend/src`.
- Read these in full and summarize each in 2-5 lines: `README.md`, `INSTRUCTIONS_FOR_SETUP.md`, `EXPERIMENT_PROTOCOL.md`, `RESEARCH_SCOPE_STATUS.md`, `todo-priority.md`.
- Read the backend code that matters for the experiment: `app/config.py`, `app/main.py`, `app/agents/graph.py`, `app/agents/state.py`, `app/agents/vocab.py`, every file in `app/agents/nodes/`, `app/rag/*`, `app/services/telemetry.py`, `app/services/llm.py`, `app/services/sandbox.py`, `app/api/runs.py`, `app/api/research_questions.py`, `app/api/datasets.py`, `app/schemas/pipeline.py`, `app/evaluation/*`, `experiment/*`, `seed_datasets.py`, `kaggle_github_datasets.json` (structure only).
- Note: the API route prefixes (verify in `main.py`), run status values (`queued`, `running`, `succeeded`, `failed`, ... verify in `runs.py`), the category vocabulary (`vocab.py`), and which node reads `similar_past_insights` (verify).

### 1.2 Runtime and environment

Check, without printing secret values:
- Python version, whether a venv exists, whether `requirements.txt` packages are installed (`chromadb`, `sentence-transformers`, `langgraph`, `sqlalchemy`, `aiosqlite`, `scipy`, `pandas`, `matplotlib`; note missing ones).
- `.env` exists? List **key names** present and whether each is non-empty. Specifically report: `DATABASE_URL`, `USE_DOCKER_SANDBOX`, `QUESTION_GENERATOR_MODEL`, `CODE_GENERATOR_MODEL`, `CODE_CORRECTOR_MODEL`, `INSIGHT_WRITER_MODEL`, `RQ_JUDGE_MODEL`, `CODE_JUDGE_MODEL`, `INSIGHT_JUDGE_MODEL`, `LLM_TEMPERATURE`, `LOGS_DIR`, `RAG_PERSIST_DIR`, `RAG_K`, and whether `GOOGLE_API_KEY` / `OPENROUTER_API_KEY` are set. (Model names are not secret; print them.)
- Docker: is it installed and running? Does image `datamind-sandbox:latest` exist (`docker images`)? Do not build it yet.
- Kaggle credentials: does `~/.kaggle/kaggle.json` (or env equivalents) exist? (presence only)
- Is the backend currently running? (Do not start it.)

### 1.3 Database inspection (SQLite, read-only)

Locate the DB from `DATABASE_URL` (expected `../data/datamind.db` relative to `backend/`; resolve to an absolute path). Then report:

**Schema.** Tables (verify against `app/db/models.py`): `local_user, datasets, dataset_profiles, research_questions, analysis_runs, generated_code, execution_attempts, insights, visualizations, reports, run_metrics`. Also the Alembic version table and whether the DB is at head.

**Row counts** for every table.

**Queries to run and report as tables:**

```sql
-- datasets by status
SELECT status, COUNT(*) FROM datasets GROUP BY status;

-- dataset registry
SELECT id, filename, primary_domain, source_url, format, row_count, column_count,
       file_size_bytes, status, uploaded_at
FROM datasets ORDER BY uploaded_at;

-- datasets with no profile (broken ingests)
SELECT d.id, d.filename, d.status FROM datasets d
LEFT JOIN dataset_profiles p ON p.dataset_id = d.id WHERE p.id IS NULL;

-- research questions per dataset (excluding the hidden system_profile RQ)
SELECT d.id, d.filename, COUNT(rq.id) AS n_rq
FROM datasets d LEFT JOIN research_questions rq
  ON rq.dataset_id = d.id AND rq.category != 'system_profile'
GROUP BY d.id;

-- category mix
SELECT category, COUNT(*) FROM research_questions GROUP BY category;

-- runs by status, and per dataset
SELECT status, COUNT(*) FROM analysis_runs GROUP BY status;
SELECT dataset_id, status, COUNT(*) FROM analysis_runs GROUP BY dataset_id, status;

-- insights per dataset (the future RAG corpus candidates)
SELECT r.dataset_id, i.category, COUNT(*)
FROM insights i JOIN analysis_runs r ON r.id = i.run_id
GROUP BY r.dataset_id, i.category;

-- token/latency aggregates from the app path
SELECT llm_model, COUNT(*), SUM(total_tokens), AVG(total_tokens),
       AVG(correction_attempts), AVG(total_duration_ms)
FROM run_metrics GROUP BY llm_model;
```

Also report: the earliest and latest `uploaded_at`, datasets whose `source_url` is null, duplicate `source_url`s, and whether any dataset's `raw_path` file is missing on disk.

### 1.4 Vector store (Chroma)

Using `app.rag.store.get_collection()` (read operations only; do not upsert/delete):
- `collection.count()`.
- Group by metadata `dataset_id` and `category`.
- Cross-check: Chroma `dataset_id`s that no longer exist in the DB (stale vectors) and DB insights that are missing from Chroma (not indexed).
- Report the collection's embedding model/config if discoverable, and the `rag_corpus_hash` that `experiment/run_experiment.py::_get_corpus_stats()` would produce (call that function's logic; do not run the experiment).

### 1.5 Logs and files

List everything under `data/` with sizes (top two levels). For each JSONL in `data/logs/` (`trials.jsonl`, `app_trials.jsonl`, `rq_batches.jsonl`, `app_rq_batches.jsonl`, `*_judged.jsonl`, `results.md`, ...): line count, first and last timestamp, distinct `experiment_arm`, distinct `trial_index`/`rep`, distinct `dataset_id` count, and one **redacted** example record's key structure (keys only, no code or text bodies).

### 1.6 What already exists vs what is missing

End the report with two tables:

1. **Already present:** a row per capability (paired harness, RQ batch logging, leave-one-dataset-out retrieval, judge scripts, analysis script, telemetry fields, corpus export, ...) with the file that implements it.
2. **Missing or broken:** compare against Phase 2 (below). Mark each item *missing / partial / done*. Include the known issues in 2.1 only if you can confirm them in the code.

**STOP.** Present the report. Do not proceed until the owner says "continue".

---

## 2. Phase 2: Fixes and tooling

Everything here must work offline, with unit tests (`pytest`, existing tests live in `backend/tests`; follow their style). Before starting a task, re-verify that the described problem still exists.

### 2.1 Fixes to existing code

**E-01: Crash when the RQ scorer fails (`experiment/run_experiment.py`).**
The `record_rq_batch({...})` call contains `"scorer": [...] if hasattr(scores[0], "model_dump") else scores`. If scoring raised, `scores` is `[]`, so `scores[0]` raises `IndexError` and the whole batch is lost. Replace with a safe expression (e.g. `[s.model_dump() if hasattr(s, "model_dump") else s for s in scores]`).
*Acceptance:* a unit test where `score_research_questions` is mocked to raise still writes a batch record with `scorer == []` and does not crash.

**E-02: `experiment/analyze_results.py` has a hardcoded log path.**
It uses `Path("../data/logs")`. Use `settings.logs_dir` (same as other scripts) and allow an optional `--logs-dir` CLI override. Keep the current Markdown output working.
*Acceptance:* running with `LOGS_DIR` set to a temp dir containing fixture judged files reads from that dir.

**E-03: Make the batch-then-trials resume hole detectable.**
`run_experiment.py` writes the RQ batch record *before* running its trials, and `--resume` skips any `(dataset_id, rep, arm)` already in `rq_batches.jsonl`. A crash mid-batch therefore leaves a partial batch that is never completed. Do **not** change the existing resume semantics silently. Instead implement E-08 (completeness checker) and add a `--repair-incomplete` option to `run_experiment.py` that, when combined with `--resume`, treats a batch as not done if it has fewer trials (matched by `trials.jsonl` → `meta.batch_id`) than expected (`min(max_rqs, number of non-system_profile questions that pass the same category filter)`), and re-runs it after removing the partial records from both files into a timestamped backup file. Default behavior stays unchanged.
*Acceptance:* test with fixture logs: an incomplete batch is detected, backed up, and re-queued; a complete batch is skipped.

**E-04: Optional switch to disable RAG inside app-path runs (default OFF = current behavior).**
`api/runs.py` calls `retrieve_similar_insights(schema_summary=..., k=5)` for every app run (no dataset exclusion). When building the RAG corpus we want to optionally avoid insights influencing each other. Add a setting `rag_in_app_runs: bool = True` in `config.py` (env `RAG_IN_APP_RUNS`) and honor it in `api/runs.py`. Do not change the default.
*Acceptance:* with the setting false, `retrieve_similar_insights` is not called for app runs (test via monkeypatch).

**E-05: Docs.**
`EXPERIMENT_PROTOCOL.md` tells the reader to run `python seed_datasets.py` from `backend/`, but the script is at the repo root; fix the path. Update `RESEARCH_SCOPE_STATUS.md` to reflect what actually exists (verify against the code). Add the final runbook (Section 4 of this spec) to `EXPERIMENT_PROTOCOL.md` after you finish.

### 2.2 New tools (put in `backend/scripts/` unless stated)

For every script: `argparse` CLI, `--help`, no network or LLM calls unless stated, idempotent, writes only where asked, clear errors.

**E-06: `tools/make_split.py` (repo root `tools/`).**
Deterministic split of `kaggle_github_datasets.json` into two people's lists. Spec:
- `random.seed(42)`; separate GitHub raw URLs (`githubusercontent.com` in `url`) from Kaggle entries (verify the JSON keys: `url`, `domain`, ...).
- 7 GitHub entries are all included. 53 Kaggle entries are chosen by **round-robin across domains** (domains ordered by size desc, shuffled within), plus 12 Kaggle **reserves** (picked the same way, after the 53).
- Assign the 53 Kaggle primaries alternately after sorting by domain (so domains are balanced): person B gets even indices (27), person A gets odd (26). GitHub: first 4 shuffled → A, remaining 3 → B. Result: **30 primary each**. Reserves alternate A/B with a `reserve_rank`.
- Output `splits/A.json` and `splits/B.json`; each entry = original fields + `role` (`primary`/`reserve`) (+ `reserve_rank`). Print counts; assert 30/30 primaries and no overlaps.
- Refuse to overwrite existing split files without `--force` (the split must be generated once and committed).
*Acceptance:* test asserts 30/30, disjointness, GitHub 4/3, same output on two runs.

**E-07: `scripts/export_dataset_registry.py`.**
Reads the SQLite DB (read-only) and writes `dataset_registry.csv`: `dataset_id, source_url, filename, primary_domain, format, row_count, column_count, file_size_bytes, status, uploaded_at, sha256_of_raw_file, operator`. `operator` comes from `--operator A|B`. SHA-256 is computed from `raw_path` (blank if the file is missing). This is the table that lets merged logs be joined to dataset names/domains (trial and batch records only carry the per-machine `dataset_id`), and it feeds Table 1.
*Acceptance:* test against a fixture SQLite DB created from the models.

**E-08: `scripts/check_completeness.py`.**
Inputs: `--logs-dir` (default `settings.logs_dir`), optional `--registry dataset_registry.csv`, `--expect-reps N`, `--max-rqs 8`, `--arms baseline rag`. Reports (and exits non-zero if any fail):
1. For each dataset: which `(rep, arm)` batches exist; missing ones.
2. For each batch in `rq_batches.jsonl` with `source == "experiment"`: expected vs actual trial count (trials grouped by `meta.batch_id`; skip trials when the batch was `--rq-only`: detect by rep ≥ 1 or by absence of any trial for the dataset-arm and report as "rq-only" rather than "incomplete" using an explicit `--rq-only-reps` option).
3. Duplicate `run_id`s, trials whose `batch_id` has no batch, batches with `questions_raw` empty.
4. Per-arm counts (batches, trials, successes) as a small table.
5. Config consistency: all batches share the same `config.models`, `config.temperature`, `config.rag_k`, `config.embedding_model`, `config.git_commit`, and the same `config.rag_corpus_hash` (RAG-arm validity). Flag any mismatch. Also warn if any RAG-arm batch has `retrieved == []`.
*Acceptance:* fixture logs with one incomplete batch, one hash mismatch, one empty retrieval → each is reported.

**E-09: `scripts/rag_export.py` and `scripts/rag_import.py`.**
- Export: `get_collection().get(include=["documents","metadatas"])` → JSONL `{"id","document","metadata"}` to `--out`. Paged if the collection is large.
- Import: accept one or more JSONL files; `upsert` in batches of 100 using the same collection (same embedding function, so vectors are recomputed identically). Print count before/after and the same `rag_corpus_hash` the harness computes (reuse `_get_corpus_stats` logic; do not duplicate it incorrectly, so import the function or factor it into a shared helper without changing its output).
- `--dry-run` for import prints what would change. Never delete from the collection.
*Purpose:* both machines must end with an identical frozen corpus (same ids, same hash), because Chroma ids are per-machine insight UUIDs.
*Acceptance:* round-trip test with a temp persistent dir: export → import into an empty store → same count, same hash.

**E-10: `scripts/build_corpus.py` (calls the running backend API; costs LLM budget).**
Builds the RAG corpus by driving the normal app flow, since insights are only indexed in `api/runs.py` after a successful app run.
- Args: `--base-url`, `--email`, `--password` (or read from `.env` `LOCAL_USER_EMAIL`/`LOCAL_USER_PASSWORD`), `--dataset-ids` (or `--registry` + `--status ready`), `--max-rqs 8`, `--sleep`, `--timeout-per-dataset`, `--dry-run`.
- For each dataset: skip if the Chroma store already has ≥1 insight for that `dataset_id` (idempotent resume); `POST /datasets/{id}/questions` with `{"use_rag": false}`; take up to `--max-rqs` returned RQ ids; `POST /datasets/{id}/runs` with `{"rq_ids": [...]}`; poll `GET /datasets/{id}/runs` until every run is terminal (use the real status names from `runs.py`); log per-dataset outcome to `corpus_build_log.csv`.
- Verify the exact route paths, auth flow (`POST /auth/login` → `access_token`) and request schemas from `main.py`, `api/*.py`, `schemas/pipeline.py`, and `seed_datasets.py`.
- It must **not** start the backend and must fail clearly if it is unreachable.
*Acceptance:* tested against a mocked HTTP server (e.g. `responses`/`httpx` mock) covering success, partial failure, and resume. **Do not run it for real.**

**E-11: `tools/merge_results.py`.**
Inputs: one or more per-person log dirs, each with `trials.jsonl` and `rq_batches.jsonl` (and optionally the registry CSVs). Output: `--out-dir` containing merged `trials.jsonl`, `rq_batches.jsonl`, and `dataset_registry.csv`.
- Annotate each record with `operator` (from folder name or `--operator-map A=path B=path`) if missing.
- Dedupe: trials by `run_id`; batches by `batch_id`. On conflict (same id, different content) fail loudly.
- Assert: dataset ids are disjoint across operators (each dataset belongs to exactly one machine); report any overlap.
- Do **not** merge `app_*` files into the experiment files.
*Acceptance:* fixture test with two operators, duplicates, and one conflict.

**E-12: `experiment/paired_analysis.py`: the paper's numbers.**
Reads a merged logs dir containing `rq_batches_judged.jsonl`, `trials_judged.jsonl` (outputs of `judge_trials.py`) and `dataset_registry.csv`. Writes into `--out-dir` (default `analysis_out/`): CSV + Markdown (+ optional LaTeX `.tex` via `--latex`) tables, PDF figures, and `numbers_for_paper.md`.

First **verify the real field names** by reading `experiment/judge_trials.py` and `app/evaluation/*.py` and by inspecting one judged record. Known/likely structure (confirm before relying on it):
- Batch record: `batch_id, dataset_id, arm, rep, retrieved, questions_raw, scorer, kept_indices, profile_snapshot, gen_metrics, scorer_metrics, config{...rag_corpus_hash...}, judge{auto{column_grounding_rate, diversity_score, ...}, rq_scores[{relevance, specificity, actionability, ...}]}`.
- Trial record: `run_id, dataset_id, rq_id, experiment_arm, trial_index, meta{batch_id, rq_index, dataset_id}, question{category,text,target_columns}, attempts[{attempt_number, exit_code, stdout, stderr, duration_ms, succeeded}], insight{summary_text,key_takeaways}, metrics{prompt_tokens, completion_tokens, total_tokens, llm_call_count, correction_attempts, end_to_end_ms, sandbox_duration_ms, llm_duration_ms, retry_wait_ms, node_*, rate_limit_retry_count, other_retry_count}, judge_scores{...}, failure_reason`.

**Statistical design (implement exactly):**
- **Unit of analysis = dataset.** For each metric, average within (dataset, arm) first (over RQs and reps), then compare arms **paired by dataset**. Never treat individual RQs as independent samples.
- For each metric report: n pairs, baseline mean, RAG mean, mean paired difference, 95% bootstrap CI of the difference (10,000 resamples, fixed seed), paired Wilcoxon signed-rank p-value (handle all-zero differences), paired effect size Cohen's d_z (and rank-biserial if easy).
- **Holm correction** across the primary family: relevance, actionability, tokens per successful insight. Mark all other metrics "exploratory" (uncorrected p).
- Optional `--rep0-only` to restrict trial-level metrics to rep 0 (execution is run for rep 0 in the recommended design) while RQ-level metrics use all reps.

**Metrics to compute:**

| Group | Metrics (source) |
|-------|------------------|
| RQ quality (per batch → per dataset-arm) | relevance, specificity, actionability (judge, mean over a batch's RQs); column grounding rate; diversity score; redundancy; category coverage (use whatever `rq_quality.py` really computes) |
| Code/execution (per trial → per dataset-arm) | First-pass success rate = share of trials whose `attempts[0].succeeded`; final success rate (insight produced); mean correction attempts; code-quality judge score; attempt-by-attempt cumulative success (1, 2, 3) |
| Insight quality | numeric faithfulness, readability (FK grade), groundedness, caveat coverage (names per `insight_quality.py`) |
| System efficiency | total tokens; LLM calls per run; end-to-end latency (`end_to_end_ms`); rate-limit retries; **tokens per successful insight** |

**Tokens per successful insight (H3, primary):** for each (dataset, arm): `(Σ trial total_tokens + Σ batch generation tokens + Σ batch scorer tokens) / (number of successful insights)`, where generation/scorer tokens come from `gen_metrics` / `scorer_metrics` (verify their key names). Datasets with zero successes in an arm have an undefined ratio: report how many, exclude them from that metric's paired test, and add a sensitivity line. Document the exact definition in `numbers_for_paper.md`.

**Success definition:** verify from data; a trial succeeded if its final attempt `succeeded` is true and `insight.summary_text` is non-empty (and `failure_reason` is null). Document what you used.

**Failure taxonomy (Section 5.3):** counts and shares of `failure_reason` values (categories come from `classify_failure` in `telemetry.py`; also count `unknown`/missing) per arm and overall, top 3 highlighted.

**Robustness checks (outputs in `robustness.md`):** (a) results split by operator (A vs B); (b) by source (Kaggle vs GitHub, derived from `source_url`); (c) by arm order within a rep (if recorded; otherwise skip and say so); (d) RAG retrieval sanity: share of RAG batches with non-empty `retrieved`, mean/min/max `similarity`; (e) counts table: datasets included, batches, RQs, trials per arm, and how many were dropped and why.

**Figures (matplotlib, vector PDF, 8 pt fonts, grayscale-safe):**
- `fig6_combined.pdf`: one figure, two panels: (a) grouped bars of relevance/specificity/actionability by arm with 95% CI error bars; (b) box plot of tokens per successful insight by arm (per-dataset points overlaid). Full-width size 7.16 in × ~2.6 in.
- `fig7_attempt_curve.pdf`: cumulative success by attempt number per arm, single-column 3.5 in wide.

**Tables written (each as `.csv` and `.md`, `--latex` adds `.tex`):**
- `table1_datasets` (grouped summary: counts by domain group, Kaggle vs GitHub, min/median/max rows and columns; also full per-dataset list as `datasets_full.csv` for the repo)
- `table_metrics_definitions` (Metric | Category | One-line definition | Source field), generated from a dict in the script, and the owner will confirm wording against the code
- `table3_rq_quality`, `table4_code_execution`

**`numbers_for_paper.md`:** ready-to-paste sentences with all numbers for Sections 5.1–5.3 (headline paired differences with CI and p; top-3 failure categories with shares; H1/H2/H3 verdict lines marked `SUPPORTED / NOT SUPPORTED / MIXED` by an explicit rule you state in the file, e.g. primary metric difference > 0 with Holm-adjusted p < 0.05). Never invent a number; every number must be computed.

*Acceptance:* unit tests on synthetic merged fixtures with a **known** effect size (e.g. RAG +0.4 relevance): the script recovers it within tolerance, Holm adjustment is correct (test against a hand-computed case), undefined-ratio handling works, and figures are produced without error. Run it on real data **only when the owner asks**.

**E-13: `scripts/human_validation.py`.**
- `make-sheet`: sample N items (default 30, stratified across RQ/code/insight and across arms; seeded) from the **judged** merged logs into `human_validation/sheet_<A|B>.csv` with columns `id, type, dataset_name, text_shown, score_rater` and **no arm label and no judge score**, shuffled order. Both raters get the same item set but independent files.
- `agree`: read both raters' completed sheets plus the judge scores; compute Cohen's weighted kappa (quadratic) between raters, and Spearman correlation (and mean absolute difference) between the human mean and the judge. Output `human_validation/agreement.md`.
*Acceptance:* tests with synthetic scores.

### 2.3 Quality gate for Phase 2

- `pytest` passes (existing and new tests).
- Every new script has `--help` and a short docstring with usage.
- No new dependency without justification; if needed (`scipy`, `matplotlib`, `pandas`), add to `requirements.txt` in a separate commit and say why.
- Update `docs/AGENT_ORIENTATION_REPORT.md` section 1.6 table to *done* for each finished task.

**STOP.** Summarize what changed and wait for the owner.

---

## 3. Experimental design constants (the agent must preserve these)

These come from the paper plan; do not change them without asking.

- **Arms:** `baseline` (no retrieval) and `rag` (top-`k` retrieved insights, `k = RAG_K` = 5, leave-one-dataset-out via `exclude_dataset_id`).
- **What RAG affects:** question generation only (`similar_past_insights` is `[]` in experiment trials). Do not change this.
- **Datasets:** 60 total, 30 per person; the primary list/reserve rule from E-06; exclusion rules in the pre-registration. Reserves are used only in rank order.
- **Reps:** RQ-generation reps = 3 per dataset per arm; code execution on rep 0 only, `--max-rqs 8`, `--max-attempts 3`, no `--use-filter`, `--seed 42`.
- **Frozen corpus:** built once from app-path insights, exported/imported so both machines have identical ids/hash; nothing indexes new insights during the experiment.
- **Judges:** different model than the generators (set `RQ_JUDGE_MODEL`, `CODE_JUDGE_MODEL`, `INSIGHT_JUDGE_MODEL`), the same judge for both arms and both machines; run once on merged logs; do not use `--allow-same-model`.
- **Pre-registered hypotheses** live in `PREREGISTRATION.md` (create it from the template below if absent; the owner fills in wording):

```
H1: RAG-augmented question generation increases RQ quality (relevance, specificity, actionability).
H2: RAG does not reduce code execution reliability (first-pass and final success rate).
H3: RAG's token overhead per successful insight stays within an acceptable factor of baseline.
Primary: relevance, actionability, tokens per successful insight (Holm-corrected). Others exploratory.
Unit of analysis: dataset (paired). Tests: Wilcoxon signed-rank + 95% bootstrap CI.
Inclusion: tabular, >= 500 rows, >= 4 columns, <= ~50 MB; exclusions replaced only from the reserve list in order.
```

---

## 4. Operator runbook (for the human; the agent writes this into `EXPERIMENT_PROTOCOL.md` at the end of Phase 2, adapted to the real CLI)

Run in this order. The agent does **not** execute these without being told.

1. **Both machines:** same commit (tag `experiment-v1`), same `.env` model settings, `USE_DOCKER_SANDBOX=true`, Docker image built (`docker build -t datamind-sandbox:latest backend/sandbox`), judge models set different from generators.
2. **Split once:** `python tools/make_split.py` → commit `splits/A.json`, `splits/B.json`.
3. **Ingest:** `python seed_datasets.py --list splits/<A|B>.json --email ... --password ... --wait` → record failures; use reserves in order. Then `python backend/scripts/export_dataset_registry.py --operator <A|B>`.
4. **Build corpus:** (backend running) `python backend/scripts/build_corpus.py ...` (optionally with `RAG_IN_APP_RUNS=false`).
5. **Sync corpus:** `rag_export.py` on each machine → exchange files → `rag_import.py` with **both** files on **both** machines. Confirm both machines print the same `rag_corpus_hash`.
6. **Pass 1 (rep 0 with execution):**
   `python -m experiment.run_experiment --dataset-ids <ids> --n-reps 1 --max-attempts 3 --max-rqs 8 --sleep 2 --seed 42 --resume --repair-incomplete`
7. **Pass 2 (extra reps, RQ only):**
   `python -m experiment.run_experiment --dataset-ids <ids> --n-reps 3 --rq-only --sleep 2 --seed 42 --resume`
8. **Check:** `python backend/scripts/check_completeness.py --expect-reps 3 --rq-only-reps 1 2`.
9. **Share:** commit each person's `trials.jsonl`, `rq_batches.jsonl`, `dataset_registry.csv` into `results/<A|B>/` of a private repo (never `.env`, DB, Chroma, raw datasets). Merge with `python tools/merge_results.py --in results/A results/B --out results/merged`.
10. **Judge once on merged logs:** `LOGS_DIR=results/merged python -m experiment.judge_trials --concurrency 3 --sleep 1 --human-sample 30` (PowerShell: `$env:LOGS_DIR="results/merged"`).
11. **Human validation:** `human_validation.py make-sheet` → both score independently → `agree`.
12. **Analyze:** `python -m experiment.paired_analysis --logs-dir results/merged --out-dir analysis_out --latex`.

---

## 5. Mapping outputs → paper sections

| Paper element | Produced by |
|---------------|-------------|
| Table 1 (datasets) | `table1_datasets` from the merged registry |
| 4.1 numbers (datasets, reps, runs) | robustness counts table + `check_completeness.py` summary |
| 4.3 metrics table | `table_metrics_definitions` (owner verifies definitions against code) |
| 4.4 judging/statistics/logging | judge config snapshot (from batch `config`), `agreement.md`, statistical design in E-12 |
| Table 3 | `table3_rq_quality` |
| Table 4 | `table4_code_execution` |
| Figure 6 (a)/(b) | `fig6_combined.pdf` |
| Figure 7 | `fig7_attempt_curve.pdf` (or one sentence) |
| 5.3 prose (insight quality, failures, H1–H3) | `numbers_for_paper.md` |
| Repo-link sentence (appendix removed) | repository containing judge prompts, ER diagram, per-dataset tables |

---

## 6. Known facts about the codebase (verify, don't trust blindly)

- Backend: FastAPI + async SQLAlchemy (SQLite by default, `../data/datamind.db`), LangGraph pipeline, Chroma local vector store (`../data/rag_store`, embedding `all-MiniLM-L6-v2`), sandbox via Docker (`--network none`) or subprocess.
- Experiment path writes `data/logs/trials.jsonl` and `data/logs/rq_batches.jsonl`; app path writes `app_trials.jsonl` and `app_rq_batches.jsonl`. Judging writes `*_judged.jsonl`; `analyze_results.py` writes `results.md` (means only, no paired statistics).
- `run_experiment.py` requires a non-empty RAG corpus (unless `--allow-empty-rag`) and Docker sandbox (unless `--allow-subprocess`), shuffles arm order per rep with `--seed`, passes `exclude_dataset_id` for retrieval, excludes `system_profile`, writes a `config` snapshot (models, temperature, `rag_k`, embedding model, git commit, `rag_corpus_count`, `rag_corpus_hash`) into every batch record.
- Insights are indexed into Chroma only in `api/runs.py` (app path), never in the experiment path.
- Dataset ids look like `ds_xxxx...` (per-machine, random); stable identification across machines needs `source_url` (from the registry export).
- `judge_trials.py` refuses to run when a judge model equals the generator unless `--allow-same-model`; defaults in `config.py` currently make all of them identical.
- The hidden `system_profile` RQ/run exists for every dataset; it must be excluded from every experiment statistic and from the RAG corpus (the indexer already skips it; verify).

---

## 7. Definition of done

- [ ] `docs/AGENT_ORIENTATION_REPORT.md` exists and the owner has seen it
- [ ] E-01 … E-13 implemented with tests; `pytest` green; each on its own commit in branch `experiment-prep`
- [ ] No LLM/API calls were made by the agent; no real data modified
- [ ] `EXPERIMENT_PROTOCOL.md` and `RESEARCH_SCOPE_STATUS.md` updated to match reality
- [ ] `PREREGISTRATION.md` present (owner to finalize wording)
- [ ] A final message listing: what was built, how it was tested, commands the owner must run manually, and any open questions or discrepancies found in Phase 1

---

## 8. Final report format (end of each phase)

```
## Phase <n> report
Done: <task ids>
Changed files: <list>
Tests: <what ran, result>
Discrepancies vs this spec: <list or "none">
Needs owner action: <list or "none">
Questions: <max 3>
```

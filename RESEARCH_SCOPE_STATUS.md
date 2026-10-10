# DataMind — Research Scope Status (Paper §4.3 / §5 Coverage)

Consolidated from a full read of `backend/` against the paper draft's Evaluation
Methodology (§4) and Results (§5) sections, plus `todo-priority.md`.
Reflects the current repo state (post-implementation).

> **Database:** SQLite (`aiosqlite`). All references to PostgreSQL/pgvector in older
> docs were stale — the runtime has always been SQLite + Chroma.
>
> **LLM Provider:** Google Gemini API via `langchain-google-genai`. Model specs use the
> `google:<model>` format (e.g. `google:gemini-3.1-flash-lite`).

---

## 1. Built — No Further Action Needed

### 1.1 RQ Quality Metrics (§4.3.1)
- **Column Grounding Rate, Category Coverage, Redundancy Rate, Semantic
  Diversity** — `app/evaluation/rq_quality.py::compute_automatic_metrics()`.
  Fully deterministic, embedding-based (reuses the RAG stack's
  `sentence-transformers` model), zero LLM cost.
- **Relevance / Specificity / Actionability** — `judge_rq_batch()`. Held-out
  LLM-judge, distinct rubric prompt, configurable via `rq_judge_model`.
- **Applicable category inference** — `infer_applicable_categories()` derives
  which EDA categories apply to a given profile (cleaning, distribution,
  correlation, trend, segmentation) so coverage can be computed accurately.

### 1.2 Code Generation & Execution Quality Metrics (§4.3.2)
- **Static Code Quality Signals** (cyclomatic complexity, `.iterrows()`
  anti-pattern detection, guard clauses, matplotlib backend check, syntax
  validity, vectorisation heuristic, forbidden-call detection) —
  `app/evaluation/code_quality.py::compute_static_signals()`.
- **Code Quality Rubric Score** (5-dimension, weighted composite:
  correctness, idiomatic usage, robustness, output clarity, professional
  style) — `judge_code_quality()`.
- **FPSR, ESR, Mean Attempts to Success, Execution Latency** — computable
  directly from `trials.jsonl`'s per-trial `attempts[]` array.
- **Reproducibility** — Docker sandbox mode (`USE_DOCKER_SANDBOX=true`) is
  purpose-built for this: `--rm`, `--network none`, memory/CPU caps, no
  container reuse.

### 1.3 Insight Quality Module (§4.3.3) — **built**
`app/evaluation/insight_quality.py` provides:
- **Numerical Faithfulness** — regex-based number extraction from stdout and
  `summary_text`, tolerance-aware match with proper decimal and percentage
  handling. Reports `faithfulness_rate`, `faithfulness_rate_with_profile`,
  and `faithfulness_rate_nontrivial` (excluding trivial integers/years).
- **Takeaway Groundedness** — LLM-as-judge, binary supported/unsupported per
  `key_takeaways` bullet, reported as % grounded.
- **Readability** — Flesch-Kincaid (via `textstat` if installed, fallback
  estimator otherwise) on `summary_text`.
- **Caveat Coverage** — LLM-as-judge cross-referenced against the dataset
  profile's null/count stats (`profile_null_stats`).

### 1.4 System-Level Efficiency Metrics (§4.3.4)
- **Failure Taxonomy** — `telemetry.py::classify_failure()`, rule-based
  (KeyError, timeout, dtype mismatch, TypeError/ValueError, malformed JSON,
  sandbox OOM), written into every trial record automatically.
- **End-to-End Latency** — `AnalysisRun.started_at` / `finished_at` are both
  populated in `runs.py`. `end_to_end_ms` is recorded in trial telemetry.
- **Token Cost per Successful Insight** — `RunMetrics.total_tokens` exists
  and is aggregated into each trial's `metrics.total_tokens`.
- **Per-Node LLM Call/Token Breakdown** — `AnalysisState` carries
  `node_llm_calls`, `node_prompt_tokens`, `node_completion_tokens`,
  `node_total_tokens` dicts (keyed by node name), populated by nodes that
  make LLM calls.
- **Rate-Limit Resilience** — `rate_limit_retry_count` in `AnalysisState`
  counts 429-triggered tenacity retries. `flush_retry_count()` in `llm.py`
  reports and resets the per-task counter.

### 1.5 Config Additions
`config.py` has explicit settings for all judge models:
- `rq_judge_model` — held-out judge for RQ quality scoring.
- `code_judge_model` — held-out judge for code quality scoring.
- `insight_judge_model` — held-out judge for insight quality scoring.

These are documented in `backend/.env` and used only by offline batch-scoring
scripts in `backend/experiment/judge_trials.py` and `app/evaluation/*.py`.
They are **never** called during a live user-facing pipeline run.

### 1.6 Experiment Harness Scripts
`backend/experiment/` contains:
- `run_experiment.py` — paired RAG-vs-baseline trial runner (`N` reps × 2
  arms via `run_analysis()`). The RAG variable is **question generation**:
  both arms run the full pipeline but only the RAG arm retrieves past insights
  for question generation. Neither arm injects RAG context into `insight_writer`.
  Writes to `data/logs/trials.jsonl` (experiment) and
  `data/logs/rq_batches.jsonl`; never writes to app logs.
- `judge_trials.py` — offline batch judge: reads `rq_batches.jsonl` and
  `trials.jsonl`, fills `judge_scores` via `judge_rq_batch()` /
  `judge_code_quality()` / `judge_insight_batch()`, writes to
  `rq_batches_judged.jsonl` / `trials_judged.jsonl` (inputs are never
  mutated; idempotent unless `--force`).
- `__init__.py` — package marker.

---

## 2. Confirmed Correct — Mechanics

### 2.1 FPSR/ESR Polling Concern
**No fix needed.** `execution_history` (the source of `attempts[]` in
`trials.jsonl`) is only appended to when the LangGraph loop genuinely
re-enters `code_corrector → sandbox_execute`. Frontend polling only reads
`AnalysisRun.status` from SQLite — it is read-only and cannot create or
trigger new attempts.

- **FPSR** = trials where `attempts[0].succeeded == True`.
- **ESR** = trials where any `attempts[i].succeeded == True` within the
  retry budget (`max_attempts`, default 3).
- **Mean Attempts to Success** = `len(attempts)` at the succeeding index,
  averaged over trials that eventually succeeded.

### 2.2 Telemetry Source Separation
App runs write to `data/logs/app_trials.jsonl` and `data/logs/app_rq_batches.jsonl`.
Experiment runs write to `data/logs/trials.jsonl` and `data/logs/rq_batches.jsonl`.
This keeps experiment data clean for the paper's analysis scripts.

### 2.3 Pipeline Flow
All research questions — including `system_profile` — flow through
`code_generator → sandbox_execute` (no bypass). `insight_writer` requires
non-empty stdout and will raise `ValueError` if execution output is absent.

---

## 3. Remaining / In Progress

### 3.1 Vocabulary Canonicalisation
Category taxonomy and output type strings are partially standardised.
`app/agents/vocab.py` (canonical categories/aliases) and
`schemas.py` field validators are not yet landed. The `DATAMIND_FIX_INSTRUCTIONS.md`
tasks T03/T04 cover this.

### 3.2 RAG Leakage Fix (T06)
`retrieve_similar_insights(...)` in `research_questions.py` does not yet pass
`exclude_dataset_id`, so a dataset can retrieve its own past insights.

### 3.3 Polling Termination (T04)
Frontend polling loops do not yet stop once all runs reach a terminal status
(`succeeded`/`failed`). The `useRunsPolling` hook described in T04 is not
yet implemented.

### 3.4 Per-Node Latency & Wait Seconds (T02/T07)
`node_llm_latency_ms`, `other_retry_count`, and `retry_wait_seconds` are not
yet present in `AnalysisState` or the telemetry record. The improved
`RetryStats` dataclass described in T01 is not yet landed either (current
implementation counts all retries, not just 429s).

---

## 4. Out of Scope (No Code Needed)

- **Statistical analysis** (§4.5) — paired t-test/Wilcoxon, confidence
  intervals, effect sizes. This is post-hoc analysis run over
  `trials_judged.jsonl` in a notebook/script once trial data exists.
- **Human-agreement validation** — 20–30 sample double-scoring for
  judge-human correlation. A manual step, tracked in `todo-priority.md` B.5.
- **Paper text, UI redesign** — out of scope of the codebase.

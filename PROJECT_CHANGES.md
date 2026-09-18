# Research-scope engineering — file map

Addresses the three "Research-scope engineering" items in `todo-priority.md`.
Everything here is additive; only one existing file has a small, backward-compatible edit.

## New files (copy into `data-mind/backend/app/...`)

| File | Destination | What it does |
|---|---|---|
| `evaluation/__init__.py` | `backend/app/evaluation/__init__.py` | New package marker + notes on how/when this package is invoked (offline, not inline). |
| `evaluation/rq_quality.py` | `backend/app/evaluation/rq_quality.py` | **RQ quality module (Part B.1).** `compute_automatic_metrics()` — zero-LLM, deterministic: column grounding rate, category coverage, redundancy rate, embedding-based diversity score (reuses the RAG stack's `sentence-transformers` model, no new dependency). `judge_rq_batch()` — held-out LLM-as-judge (different model than the generator) scoring relevance/specificity/actionability 1-5 against a documented rubric. |
| `evaluation/code_quality.py` | `backend/app/evaluation/code_quality.py` | **Code-quality module (Part B.2 / B.2.1).** `compute_static_signals()` — zero-LLM: cyclomatic complexity (AST-based), `.iterrows()` anti-pattern detection, guard-clause (try/except) detection, `matplotlib.use("Agg")` check, line count, syntax validity. `judge_code_quality()` — LLM-as-judge scoring the 5-dimension rubric (Correctness, Idiomatic usage, Robustness, Output clarity, Professional style) with a weighted composite property. Returns `None` on judge failure rather than a fabricated score. |
| `services/telemetry.py` | `backend/app/services/telemetry.py` | **Backend logging/telemetry system (Part C).** `record_trial()` appends one JSONL line per `AnalysisRun` to `<logs_dir>/trials.jsonl`, in exactly the schema from Part C of `todo-priority.md` (run/dataset/rq ids, experiment arm, per-attempt code+stdout+stderr+timing, insight, token/latency metrics, `judge_scores` left `null` for later offline fill-in, and a rule-based `failure_reason` via `classify_failure()` — Part B.4's failure taxonomy). `iter_trials()` reads it back for the paper's analysis notebook / offline judge-scoring script. Every write is wrapped in try/except so telemetry can never break or slow down a real run.

## Modified file (small, additive edit only)

| File | Change |
|---|---|
| `backend/app/agents/graph.py` | `run_analysis()` gained two **optional, defaulted** kwargs (`experiment_arm="baseline"`, `trial_index=0`) and now calls `telemetry.record_trial(...)` once, right after `ainvoke` returns, inside a try/except. Existing callers (`api/runs.py` etc.) that call `run_analysis(initial_state)` with no other args are unaffected — they just get a "baseline" trial 0 recorded for free. Nothing about the graph's nodes, edges, or return value changed. |

## Not touched, but relevant for later wiring

- `app/agents/nodes/rq_quality_scorer.py` is untouched — it stays the cheap live-pipeline gate. `evaluation/rq_quality.py` is the separate, heavier research-grade scorer; the two are intentionally decoupled.
- To actually run an RAG-vs-baseline experiment, a small standalone script (not included here, since it's an experiment harness rather than an app-relevant change) would call `run_analysis(state, experiment_arm="rag"|"baseline", trial_index=i)` N times per dataset with `similar_past_insights` populated or empty, then batch-run `evaluation/rq_quality.judge_rq_batch()` and `evaluation/code_quality.judge_code_quality()` over `telemetry.iter_trials()` to fill in `judge_scores`.
- Optional config additions (not added, to avoid touching `config.py`): `settings.rq_judge_model` / `settings.code_judge_model`. Both modules already fall back gracefully via `getattr(settings, "...", <existing model>)` if you don't add them — add them to `.env` / `Settings` only when you want the judge to use a model distinct from every pipeline node.

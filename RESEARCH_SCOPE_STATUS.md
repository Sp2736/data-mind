# DataMind — Research Scope Status (Paper §4.3 / §5 Coverage)

Consolidated from a full read of `backend/` against the paper draft's Evaluation
Methodology (§4) and Results (§5) sections, plus `implementation_plan.md` and
`todo-priority.md`. Reflects the repo state as of the uploaded `data-mind.zip`.

---

## 1. Already Done — No Action Needed

### 1.1 RQ Quality Metrics (§4.3.1)
- **Column Grounding Rate, Category Coverage, Redundancy Rate, Semantic
  Diversity** — `app/evaluation/rq_quality.py::compute_automatic_metrics()`.
  Fully deterministic, embedding-based (reuses the RAG stack's
  `sentence-transformers` model), zero LLM cost.
- **Relevance / Specificity / Actionability** — `judge_rq_batch()`. Held-out
  LLM-judge, distinct rubric prompt, defaults to a different model than the
  question generator.

### 1.2 Code Generation & Execution Quality Metrics (§4.3.2)
- **Static Code Quality Signals** (cyclomatic complexity, `.iterrows()`
  anti-pattern detection, guard clauses, matplotlib backend check, syntax
  validity) — `app/evaluation/code_quality.py::compute_static_signals()`.
- **Code Quality Rubric Score** (5-dimension, weighted composite:
  correctness, idiomatic usage, robustness, output clarity, professional
  style) — `judge_code_quality()`.
- **FPSR, ESR, Mean Attempts to Success, Execution Latency** — computable
  directly from `trials.jsonl`'s per-trial `attempts[]` array (see §2 below
  for why this is safe).
- **Reproducibility** — Docker sandbox mode (`USE_DOCKER_SANDBOX=true`) is
  purpose-built for this: `--rm`, `--network none`, memory/CPU caps, no
  container reuse. Documented in `sandbox.py` as the mode to use for paper
  experiments.

### 1.3 System-Level Efficiency Metrics (§4.3.4) — partial
- **Failure Taxonomy** — `telemetry.py::classify_failure()`, rule-based
  (KeyError, timeout, dtype mismatch, TypeError/ValueError, malformed JSON,
  sandbox OOM), written into every trial record automatically.
- **End-to-End Latency** — `AnalysisRun.started_at` / `finished_at` are both
  populated in `runs.py`.
- **Token Cost per Successful Insight** — `RunMetrics.total_tokens` exists
  and is aggregated into each trial's `metrics.total_tokens`.

---

## 2. Confirmed Correct — Your FPSR/ESR Polling Concern

**No fix needed.** Verified by reading `graph.py`, `sandbox_execute.py`,
`runs.py`, `job_bus.py`, and the frontend polling code
(`upload/page.tsx`, `datasets/[id]/page.tsx`, `datasets/[id]/status/page.tsx`):

- `execution_history` (the source of `attempts[]` in `trials.jsonl`) is only
  appended to when the LangGraph loop genuinely re-enters
  `code_corrector → sandbox_execute` — i.e. one entry per real code
  generation + sandbox run, driven by `route_after_execution`.
- Frontend polling (`setTimeout`/`setInterval` loops, WS-fallback) only hits
  `GET /datasets/{id}/runs`, which reads `AnalysisRun.status` from Postgres.
  Confirmed read-only — polling frequency cannot create, duplicate, or
  trigger new attempts.
- **FPSR** = trials where `attempts[0].succeeded == True`.
- **ESR** = trials where any `attempts[i].succeeded == True` within the
  retry budget (`max_attempts`, default 3).
- **Mean Attempts to Success** = `len(attempts)` at the succeeding index,
  averaged over trials that eventually succeeded.

All three are safe to compute exactly this way from `trials.jsonl` as-is.

---

## 3. Remaining — Needed Before §5 Can Be Fully Written

### 3.1 Insight Quality module (§4.3.3 / §5.3) — **not built**
No `insight_quality.py` or equivalent exists anywhere in `app/evaluation/`.
`todo-priority.md` §B.3 specs four metrics with no implementation yet:
- **Numerical Faithfulness** — regex-extract numbers from `stdout` and
  `summary_text`, check containment/tolerance match. Automatic, no LLM call.
- **Takeaway Groundedness** — LLM-as-judge, binary supported/unsupported per
  `key_takeaways` bullet, reported as % grounded.
- **Readability** — automatic Flesch-Kincaid (or similar) on `summary_text`.
- **Coverage of Data-Quality Caveats** — LLM-as-judge, cross-referenced
  against the dataset profile's null/count stats.

This is the largest gap: without it, §5.3 has no data source at all.

### 3.2 Config additions (`config.py`) — **not landed**
`rq_judge_model` / `code_judge_model` are referenced via
`getattr(settings, "rq_judge_model", settings.insight_writer_model)` (and
equivalent for code), so the pipeline **works today off the fallback
model** — nothing is broken — but the explicit, paper-documented settings
fields from `implementation_plan.md` aren't actually in `config.py` yet, and
there's no corresponding `.env` entries either.

### 3.3 Per-node LLM call/token breakdown (§4.3.4) — **partial**
`RunMetrics` / `trials.jsonl.metrics` store `total_tokens` and
`llm_call_count` as **one aggregate number per run**. The paper asks for
counts split by node (question_generator / code_generator / code_corrector
/ insight_writer). Nothing currently tags LLM calls by node before
aggregating.

### 3.4 Rate-Limit Resilience (§4.3.4) — **not captured**
`services/llm.py` has a `tenacity`-based retry decorator (`with_llm_retry`,
exponential backoff + jitter) that fires on 429s, but retry attempts and
their added latency are **not counted or logged anywhere**. There is
currently no data source for this metric.

### 3.5 Experiment harness scripts — **not created**
No `experiment/` directory exists in the repo. Still to be written, per
`implementation_plan.md`:
- `backend/experiment/run_experiment.py` — paired RAG-vs-baseline trial
  runner (`N` reps × 2 arms via `run_analysis()`).
- `backend/experiment/judge_trials.py` — offline batch judge, reads
  `trials.jsonl`, fills `judge_scores` via `judge_rq_batch()` /
  `judge_code_quality()`, writes to `trials_judged.jsonl` (never mutates
  the original).
- `backend/experiment/__init__.py` — package marker.

### 3.6 Statistical analysis (§4.5) — **out of scope of the code**, flagged for awareness
Paired t-test/Wilcoxon, confidence intervals, effect sizes — this is
post-hoc analysis run over `trials_judged.jsonl`, not something the backend
needs to compute. No action item here beyond remembering it's a separate
step (notebook/script) once trial data exists.

---

## 4. Suggested Build Order

1. **Insight quality module** (§3.1) — biggest blocker for §5.3, and the
   automatic half (numerical faithfulness, readability) is cheap/fast to
   write since it mirrors the deterministic-metrics pattern already used in
   `rq_quality.py`.
2. **Config additions** (§3.2) — trivial, low-risk, unblocks explicit
   `.env` control before running real experiments.
3. **Experiment harness + judge script** (§3.5) — needed to actually
   generate `trials.jsonl` / `trials_judged.jsonl` at scale for the paper.
4. **Per-node token/call breakdown + retry-count logging** (§3.3, §3.4) —
   smaller, additive changes to `telemetry.py`'s `build_trial_record()` and
   `with_llm_retry`; can land alongside or after the harness since they
   only enrich the record shape.

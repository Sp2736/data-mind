# DataMind — Engineering TODOs, Evaluation Framework & Paper Support Material

---

## Part A — Engineering TODOs (as given)

### Near-term fixes / polish
- Download-sample button should render the correct dynamic URL to download the full dataset, based on whatever domain/host it was ingested from (direct URL vs Kaggle vs local upload).
- After sandbox execution completes, the "View Insights" button is not appearing — pipeline finishes and the UI just sits idle. Needs a fix so the frontend transitions to the insights view on run completion.
- The frontend's polling loop against `/runs/{id}` and `/datasets/{id}/questions` should stop issuing repeated requests once insights are ready (currently keeps hitting the API indefinitely).
- On the Insights page: remove the "Download CSV" button and any dataset-download-related functionality; remove the component that indicates whether a cleaned dataset was found.
- Generate a report from the insights, rendered as a properly formatted Markdown component in the UI, with a "Download as PDF" option. The report should include any recommended visualizations needed to support comparisons.

### Research-scope engineering
- Full ML-based comparison module: evaluates RQ (research question) quality — relevance, specificity, actionability — using measurable proxy metrics (not just LLM self-report).
- Code-quality evaluation: rate generated-and-executed code for real-world/professional relevance — "would a data analyst actually write it this way" — using concrete rubric-based or automated metrics, not a single subjective score.
- A backend logging/telemetry system that captures a full pipeline summary for every trial (every run, every attempt, every node), structured so it directly feeds every evaluation metric chosen below, rather than metrics being computed ad hoc after the fact.

---

## Part B — Evaluation Metrics for the Research Paper

The paper's core claim is a **controlled RAG-vs-baseline comparison**: does retrieval-augmented question generation produce measurably better research questions, code, and insights than a non-RAG baseline, and at what token/latency cost? Every metric below should be computed for **both arms** (RAG-enabled vs baseline) on the **same set of datasets**, so results are directly comparable. Structure the experiment as paired trials: same dataset, same profiling output, two independent pipeline runs (RAG on / off), same LLM model and temperature, N repetitions per dataset to control for LLM stochasticity.

### B.1 Research Question (RQ) Quality Metrics
These evaluate the `question_generator` node's output — the paper's primary scored variable.

| Metric | What it measures | How to compute |
|---|---|---|
| **Column Grounding Rate** | Fraction of generated questions whose `target_columns` all exist in the dataset's actual schema | Automatic, deterministic — no LLM needed. `valid_questions / total_questions` |
| **Category Coverage** | Whether the generator produced at least one question per applicable EDA category (data_quality, distribution, relationship, trend, segmentation) | Automatic — compare categories present in profile-implied applicability (e.g. has a datetime column → trend should appear) vs categories actually generated |
| **Relevance Score** | How well a question matches the actual statistical signal in the profile (e.g. proposing a correlation question between two columns that are, in fact, correlated) | LLM-as-judge (a separate, held-out judge model, not the generator itself) scores 1–5 against the profile; report mean ± std, and inter-rater agreement if a second judge model is used for validation |
| **Specificity Score** | Penalizes vague/generic questions ("explore the data") vs concrete ones ("compare median income across region X vs Y") | Rubric-based LLM-as-judge, 1–5 scale, with explicit rubric anchors documented in the appendix |
| **Actionability Score** | Whether answering the question would yield a decision-usable finding, not just a fact | LLM-as-judge 1–5, same rubric approach |
| **Redundancy Rate** | Fraction of question pairs within one batch that are near-duplicates (same columns + same statistical operation) | Automatic — cosine similarity of question-text embeddings above a threshold (e.g. >0.9) counted as duplicate pairs |
| **RQ Diversity (semantic spread)** | How much the question set covers different parts of the dataset vs clustering on one column pair | Automatic — mean pairwise embedding cosine distance across the batch; higher = more diverse |

**RAG-specific comparison metric:** for each of the above, report **Δ(RAG − baseline)** with a paired statistical test (paired t-test or Wilcoxon signed-rank, depending on normality) across the dataset sample, plus effect size (Cohen's d).

### B.2 Code Generation & Execution Quality Metrics
These evaluate `code_generator` / `code_corrector` / sandbox execution — the second engineering TODO item above maps directly here.

| Metric | What it measures | How to compute |
|---|---|---|
| **First-Pass Success Rate (FPSR)** | Fraction of runs where attempt 1 executes successfully (no correction needed) | Automatic, from `execution_attempts.succeeded` where `attempt_number == 1` |
| **Eventual Success Rate (ESR)** | Fraction of runs that eventually succeed within `max_attempts` | Automatic, from final `AnalysisRun.status` |
| **Mean Attempts to Success** | Average number of attempts consumed before success | Automatic, from `AnalysisRun.attempts` on succeeded runs |
| **Self-Correction Effectiveness** | Of runs that failed attempt 1, what fraction did the corrector fix by attempt 2? by attempt 3? | Automatic — attempt-by-attempt success curve |
| **Execution Latency** | Wall-clock time per attempt inside the sandbox | Automatic, from `execution_attempts.duration_ms` |
| **Code Quality Rubric Score** | "Would a professional data analyst write it this way?" — the requested professional-relevance rating | LLM-as-judge with an explicit, documented rubric (see B.2.1 below), scored 1–5 per dimension |
| **Static Code Quality Signals** | Objective, non-LLM code health signals to corroborate the rubric score | Automated: cyclomatic complexity, use of vectorized pandas ops vs manual loops (flag `.iterrows()`), presence of guard clauses / try-except around risky ops, presence of a `matplotlib.use("Agg")` call, line count |
| **Statistical Validity of Output** | Whether the code's chosen statistical method fits the data (e.g. Pearson correlation only applied to genuinely numeric/continuous pairs, not encoded categoricals) | LLM-as-judge or rule-based checklist per category |
| **Reproducibility** | Does re-running the identical generated code on the same dataset produce identical stdout output (determinism check, excluding intentional randomness) | Automatic — re-execute successful code once more, diff stdout |

#### B.2.1 Suggested Code-Quality Rubric (for the LLM-as-judge prompt, and for the paper's methodology section)
Score each 1–5, report per-dimension means plus a weighted composite:
1. **Correctness** — does the code actually answer the stated research question with the right computation?
2. **Idiomatic pandas/numpy usage** — vectorized operations preferred over manual loops, appropriate use of `groupby`/`agg`/`merge`.
3. **Robustness** — handles missing values, type coercion, empty groups, division-by-zero without crashing or silently producing wrong numbers.
4. **Output clarity** — stdout is human-readable and states concrete numbers; charts (if any) are labeled, legible, and saved correctly.
5. **Professional style** — a working analyst would plausibly write this: minimal but sufficient comments, no redundant computation, meaningful variable names.

This directly operationalizes "would a professional data scientist prefer that type of code" into a defensible, reportable number rather than a single subjective label — important for reviewers who'll ask how "professional relevance" was measured.

### B.3 Insight Quality Metrics
Evaluates `insight_writer` output — the final human-facing artifact.

| Metric | What it measures | How to compute |
|---|---|---|
| **Numerical Faithfulness** | Whether every number stated in the insight summary actually appears in the sandbox stdout (no hallucinated statistics) | Automatic — regex-extract numbers from both `stdout` and `summary_text`, check containment/tolerance match |
| **Takeaway Groundedness** | Whether each `key_takeaway` bullet is directly supported by the stdout, not an unsupported generalization | LLM-as-judge, binary supported/unsupported per bullet, report % grounded |
| **Readability** | Whether the summary is accessible to a non-technical stakeholder | Automatic readability score (Flesch-Kincaid or similar) as a secondary/supporting metric |
| **Coverage of Caveats** | Whether the insight flags data-quality caveats (high nulls, small subgroup sizes) when the underlying data genuinely has them | LLM-as-judge cross-referenced against the dataset profile's null/count stats |

### B.4 System-Level / Efficiency Metrics
These support the paper's "cost" side of the RAG-vs-baseline trade-off and demonstrate engineering rigor.

| Metric | What it measures |
|---|---|
| **Token Cost per Successful Insight** | `total_tokens` (from `RunMetrics`) divided by number of successfully answered RQs — the key trade-off metric against RAG's quality gains |
| **LLM Call Count per Run** | Total `llm_call_count`, split by node (question_generator, code_generator, code_corrector, insight_writer) |
| **End-to-End Latency** | Wall-clock from `AnalysisRun.started_at` to `finished_at`, split into LLM-wait time vs sandbox-execution time |
| **Rate-Limit Resilience** | Number of tenacity retries triggered per run due to OpenRouter 429s, and their added latency — relevant since the paper uses a free-tier model |
| **Failure Taxonomy** | Categorize failed runs by root cause (timeout, column KeyError, dtype mismatch, LLM malformed JSON, sandbox crash) — a simple frequency table strengthens the discussion/limitations section |

### B.5 Statistical Methodology Notes for the Paper
- State sample size (number of datasets × repetitions per arm) up front and justify it (power analysis if feasible, or at minimum acknowledge it as a limitation).
- Use paired tests since RAG/baseline are run on the *same* datasets — this controls for dataset difficulty as a confound.
- Report confidence intervals, not just p-values, for every headline metric (RQ relevance Δ, code FPSR Δ, token cost Δ).
- Pre-register (even informally, in the methodology section) which metrics are primary (RQ relevance, actionability, token cost) vs secondary/exploratory (readability, diversity) — this pre-empts a reviewer accusing the paper of metric fishing.
- Disclose the judge model used for LLM-as-judge scores, and ideally run a small human-agreement validation subset (e.g. 20–30 samples double-scored by a human) to report judge-human correlation as a validity check on the automated scores.

---

## Part C — Backend Logging System Design (supports every metric above)

To make every metric in Part B computable without re-deriving it later, the pipeline should log a **structured trial record** per `AnalysisRun`, not just the existing DB rows. Recommended shape (JSONL, one line per run, written alongside the existing Postgres rows so it's queryable independently for the paper's analysis notebook):

```json
{
  "run_id": "...",
  "dataset_id": "...",
  "rq_id": "...",
  "experiment_arm": "rag" | "baseline",
  "trial_index": 0,
  "question": {"category": "...", "text": "...", "target_columns": [...]},
  "attempts": [
    {"attempt_number": 1, "code": "...", "exit_code": 0, "stdout": "...", "stderr": "...", "duration_ms": 0, "succeeded": true}
  ],
  "insight": {"summary_text": "...", "key_takeaways": [...]},
  "metrics": {"prompt_tokens": 0, "completion_tokens": 0, "llm_call_count": 0, "correction_attempts": 0, "total_duration_ms": 0},
  "judge_scores": {"relevance": null, "specificity": null, "actionability": null, "code_quality": {...}},
  "failure_reason": null,
  "timestamp": "..."
}
```

`judge_scores` starts null and is filled in by an offline batch-scoring script that runs after data collection (keeps the judge LLM calls out of the live pipeline's latency/cost budget). This file becomes the single source the paper's results section and any charts are generated from — important for reproducibility, and worth mentioning explicitly in the paper's methodology as an artifact you can release.

---

## Part D — Diagrams for the Paper (short descriptions)

1. **System Architecture Diagram** — top-level boxes: Frontend (Next.js) ↔ FastAPI Backend ↔ PostgreSQL (+ pgvector) ↔ Docker Sandbox (network-isolated) ↔ OpenRouter LLM API. Shows the local-only, self-contained deployment boundary — useful for establishing reproducibility/cost claims.

2. **LangGraph Pipeline / State Machine Diagram** — the per-question graph: `code_generator → result_analyzer → (conditional: success → insight_writer → visualization_builder → END; failure+attempts left → code_corrector → back to result_analyzer; failure+exhausted → give_up → END)`. This is the paper's central "self-correcting agent" figure — one diagram reviewers will look for immediately.

3. **RAG Retrieval Flow Diagram** — shows how the question_generator node's prompt is augmented: dataset profile → embedding → similarity search against a corpus (past questions / domain knowledge / prior insights) → retrieved context spliced into the system prompt → LLM call. Should visually contrast with the baseline path (profile → LLM call directly, no retrieval step) since that contrast *is* the experiment.

4. **End-to-End Data Flow / Sequence Diagram** — user uploads dataset → storage + profiling service → question_generator produces RQs → user/system triggers runs → LangGraph pipeline executes per RQ → insights + visualizations persisted → report generator aggregates into final Markdown/PDF report. A sequence diagram (actors: User, Frontend, API, DB, Sandbox, LLM) works well here to show timing/ordering, including the WebSocket status-streaming path.

5. **Evaluation Framework Diagram** — shows the paired-trial experimental design: one dataset → two parallel arms (RAG / baseline) → same metrics computed on both → statistical comparison → results. This is the diagram that most directly visualizes the paper's methodology section and should sit right before the results tables.

6. **Results Charts (not diagrams, but plan these now):**
   - Grouped bar chart: RAG vs baseline mean scores for relevance/specificity/actionability, with error bars (95% CI).
   - Line or box plot: token cost distribution per arm, to visualize the cost trade-off.
   - Stacked bar or funnel: attempt-by-attempt success rate (how much of the self-correction loop is "doing work").
   - Confusion-style or grouped bar: failure taxonomy frequencies.

7. **(Optional) Database ER Diagram** — `datasets → dataset_profiles`, `research_questions → analysis_runs → generated_code → execution_attempts`, `analysis_runs → insights → visualizations`, `run_metrics`. Useful in an implementation/appendix section to show how the logging system in Part C maps onto persisted state.
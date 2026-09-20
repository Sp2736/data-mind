<div align="center">

<img src="assets/banner.svg" alt="DataMind banner" width="100%" />

<br/>

[![Backend](https://img.shields.io/badge/backend-FastAPI-0f766e?style=flat-square)](#-backend)
[![Orchestration](https://img.shields.io/badge/orchestration-LangGraph-6d28d9?style=flat-square)](#-the-analysis-pipeline)
[![Frontend](https://img.shields.io/badge/frontend-Next.js-black?style=flat-square)](#-frontend)
[![Database](https://img.shields.io/badge/database-PostgreSQL%20%2B%20pgvector-336791?style=flat-square)](#-persistence-layer)
[![Sandbox](https://img.shields.io/badge/execution-Docker%20sandboxed-2496ed?style=flat-square)](#-sandboxed-code-execution)
[![RAG](https://img.shields.io/badge/retrieval-Chroma%20%2B%20MiniLM-f97316?style=flat-square)](#-retrieval-augmented-question-generation-rag)
[![License](https://img.shields.io/badge/license-see%20LICENSE-lightgrey?style=flat-square)](./LICENSE)

**Upload a dataset. Get back research questions, self-correcting analysis code, grounded insights, charts, and a written report — with no human in the loop.**

</div>

---

## What is DataMind?

DataMind is a **local-first, LLM-orchestrated framework for autonomous exploratory data analysis (EDA)**. Point it at a CSV/JSON/Excel/Parquet dataset and it runs the entire analyst workflow end to end:

1. **Profiles** the dataset (schema, nulls, distributions, correlations) — deterministically, with pandas.
2. **Proposes research questions worth asking**, using an LLM grounded in that profile and (optionally) *retrieved context from similar past datasets it has analyzed before*.
3. **Writes Python analysis code** for each question, executes it inside an isolated, network-disabled Docker sandbox, and **self-corrects on failure** — reading the traceback and rewriting the script, up to a configurable retry budget.
4. **Turns the raw execution output into a grounded, human-readable insight** — no invented numbers, every claim traceable back to what the code actually printed.
5. **Builds a chart** where one belongs, and finally **assembles everything into a single narrative report**.

It was built as a research project studying a specific question: *does retrieval-augmented generation measurably improve the relevance and actionability of LLM-generated research questions, and what does that cost in tokens?* Every stage of the pipeline emits structured telemetry so that question is answerable from data, not vibes — see [Evaluation & Research Instrumentation](#-evaluation--research-instrumentation).

<br/>

<div align="center">
<img src="assets/data-flow.svg" alt="End-to-end data flow animation" width="100%" />
<sub>Animated in a browser (GitHub renders raw SVG natively) — packets show a request moving from upload through profiling, orchestration, sandbox execution, and back.</sub>
</div>

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [Architecture at a Glance](#-architecture-at-a-glance)
- [The Analysis Pipeline](#-the-analysis-pipeline)
- [Retrieval-Augmented Question Generation (RAG)](#-retrieval-augmented-question-generation-rag)
- [Sandboxed Code Execution](#-sandboxed-code-execution)
- [Persistence Layer](#-persistence-layer)
- [Backend](#-backend)
- [Frontend](#-frontend)
- [Evaluation & Research Instrumentation](#-evaluation--research-instrumentation)
- [API Surface](#-api-surface)
- [Getting Started](#-getting-started)
- [Configuration Reference](#-configuration-reference)
- [Project Layout](#-project-layout)
- [Roadmap](#-roadmap)
- [Research Context](#-research-context)

---

## Why This Exists

Manual EDA doesn't scale with the number of datasets a team accumulates, and it gate-keeps on statistical fluency. Most "AI data analyst" demos stop at *generate one chart from one prompt*. DataMind is an attempt to push further on the parts that are actually hard to get right unattended:

- **Grounding** — the LLM never sees raw rows beyond a small sample; every question and insight is anchored to a computed profile, not hallucinated from vibes.
- **Recovery** — generated code fails sometimes. DataMind treats that as an expected state transition (see the retry loop below), not an error path the user has to handle.
- **Isolation** — arbitrary LLM-generated code runs in a `--network none`, resource-capped, `--rm` Docker container. It cannot exfiltrate data or persist beyond its own attempt.
- **Measurability** — every run — successful or not — is logged as a structured trial record, so the research question ("does RAG help, and by how much?") can be answered with paired statistical comparisons instead of anecdotes.

---

## 🏗 Architecture at a Glance

```mermaid
flowchart LR
    subgraph Client["🖥️ Frontend — Next.js"]
        UI[Upload / Datasets / Insights UI]
    end

    subgraph API["⚡ FastAPI Backend"]
        REST[REST routes]
        WSAPI[WebSocket status stream]
    end

    subgraph Data["🗄️ Persistence"]
        PG[(PostgreSQL + pgvector)]
        FS[(Local filesystem<br/>raw datasets · sandbox I/O · logs)]
    end

    subgraph Agents["🧠 LangGraph Orchestration"]
        QG[question_generator]
        Graph[Per-question analysis graph]
    end

    subgraph RAGStack["🔎 RAG Store"]
        Chroma[(Chroma vector store)]
        Embed[sentence-transformers<br/>all-MiniLM-L6-v2]
    end

    subgraph Exec["📦 Sandbox"]
        Docker[Docker container<br/>--network none · --rm · capped CPU/mem]
    end

    subgraph LLMs["☁️ LLM Providers"]
        OR[OpenRouter free-tier models]
        GE[Google Gemini]
    end

    UI <-->|REST + WS| API
    API --> PG
    API --> FS
    API --> QG
    API --> Graph
    QG -->|retrieve similar insights| Chroma
    Chroma <--> Embed
    QG -->|prompt| LLMs
    Graph -->|generate / correct code| LLMs
    Graph -->|execute| Docker
    Docker --> FS
    Graph --> PG
    Graph -->|append trial record| FS

    style Client fill:#111827,color:#e5e7eb,stroke:#334155
    style API fill:#0f172a,color:#e5e7eb,stroke:#334155
    style Data fill:#111827,color:#e5e7eb,stroke:#334155
    style Agents fill:#1e1b4b,color:#e5e7eb,stroke:#4c1d95
    style RAGStack fill:#1c1917,color:#e5e7eb,stroke:#9a3412
    style Exec fill:#0c4a6e,color:#e5e7eb,stroke:#0369a1
    style LLMs fill:#111827,color:#e5e7eb,stroke:#334155
```

**Everything runs locally except the LLM API calls.** Postgres, the vector store, the sandbox, and the filesystem are all self-hosted — there's no managed cloud dependency to stand this project up beyond an OpenRouter or Google API key.

---

## 🔄 The Analysis Pipeline

Each **Research Question** is answered by an independent run of a compiled **LangGraph** state machine. Question generation itself happens once *per dataset* (not per question) and is a separate entry point — see the RAG section below.

<div align="center">
<img src="assets/pipeline-flow.svg" alt="Animated LangGraph pipeline diagram" width="100%" />
</div>

```mermaid
stateDiagram-v2
    [*] --> code_generator: category != system_profile
    [*] --> insight_writer: category == system_profile (bypass execution)

    code_generator --> sandbox_execute: script written

    sandbox_execute --> result_analyzer: succeeded
    sandbox_execute --> code_corrector: failed, attempts remaining
    sandbox_execute --> give_up: failed, attempts exhausted

    code_corrector --> sandbox_execute: rewritten script

    result_analyzer --> insight_writer: stdout parsed
    insight_writer --> visualization_builder: grounded summary
    visualization_builder --> [*]: chart + insight persisted
    give_up --> [*]: run marked failed
```

| Node | Responsibility | LLM call? |
|---|---|---|
| `code_generator` | Writes a self-contained pandas/matplotlib script for the research question, using only the dataset's schema (never raw data) | ✅ |
| `sandbox_execute` | Runs the script in an isolated Docker container; captures stdout/stderr/exit code/output files | ❌ |
| `code_corrector` | Reads the traceback from a failed attempt and rewrites the script to fix the specific error | ✅ |
| `result_analyzer` | Parses successful stdout into structured findings | — |
| `insight_writer` | Converts findings into a plain-English, numerically-grounded summary + key takeaways | ✅ |
| `visualization_builder` | Selects and binds the right chart type to the insight | — |
| `give_up` | Terminal failure state once the retry budget is exhausted; records the last traceback | ❌ |

The self-correction loop is bounded by `max_attempts` (configurable per run) so a persistently broken generation can't loop forever — it fails cleanly and is logged as a failure with its full traceback, which itself becomes data (see [Failure Taxonomy](#-evaluation--research-instrumentation)).

---

## 🔎 Retrieval-Augmented Question Generation (RAG)

The central research question this project investigates: **does retrieving context from previously analyzed, structurally similar datasets improve the quality of newly generated research questions?**

```mermaid
sequenceDiagram
    participant U as User
    participant API as FastAPI
    participant QG as question_generator
    participant Chroma as Chroma Vector Store
    participant LLM as LLM Provider

    U->>API: POST /datasets/{id}/questions
    API->>QG: dataset profile (schema, stats, correlations, sample)
    QG->>Chroma: embed schema signature → query similar past insights
    Chroma-->>QG: top-k similar (question, summary, category) triples
    QG->>LLM: profile + retrieved context → generate research questions
    LLM-->>QG: JSON list of research questions
    QG-->>API: persisted ResearchQuestion rows
    API-->>U: research questions ready
```

- **Embedding model:** `all-MiniLM-L6-v2` via `sentence-transformers` — small, CPU-friendly, runs fully offline after first download. No embedding API cost.
- **Store:** Chroma's local persistent client — a folder on disk, no separate server process, no Docker.
- **Similarity signal:** a synthetic "schema text" (column names + dtypes) rather than raw content, so retrieval approximates *"datasets shaped like this one"* without needing dataset-content access.
- **Baseline arm:** the same pipeline with retrieval disabled (`similar_past_insights = []`), so the RAG vs. baseline comparison is a controlled, single-variable swap — everything else about the run is identical.

---

## 📦 Sandboxed Code Execution

LLM-generated code is arbitrary code. DataMind never trusts it:

```
docker run --rm --network none \
  --memory <sandbox_memory_limit> --cpus <sandbox_cpu_limit> \
  -v <script>:/workspace/code.py:ro \
  -v <dataset>:/workspace/data/input.<ext>:ro \
  -v <outputs>:/workspace/outputs:rw \
  datamind-sandbox:latest
```

- **No network access** — the container cannot phone home or exfiltrate anything.
- **`--rm`** — nothing persists in the container between attempts; every attempt starts clean.
- **Resource-capped** — memory and CPU limits prevent a runaway script from starving the host.
- **Host-side wall-clock timeout** — a hang is killed and recorded as a `timed_out` failure, not left running.
- **Dev mode:** a fast in-process subprocess execution mode (`USE_DOCKER_SANDBOX=false`) is available for local iteration; production/paper-experiment runs use the real Docker sandbox.

---

## 🗄 Persistence Layer

```mermaid
erDiagram
    DATASETS ||--o| DATASET_PROFILES : has
    DATASETS ||--o{ RESEARCH_QUESTIONS : generates
    RESEARCH_QUESTIONS ||--o{ ANALYSIS_RUNS : answered_by
    ANALYSIS_RUNS ||--o{ GENERATED_CODE : produces
    GENERATED_CODE ||--o{ EXECUTION_ATTEMPTS : executes_as
    ANALYSIS_RUNS ||--o| INSIGHT : yields
    INSIGHT ||--o| VISUALIZATION : renders_as
    ANALYSIS_RUNS ||--o| RUN_METRICS : measured_by
    DATASETS ||--o| REPORT : summarized_by

    DATASETS {
        string id PK
        string filename
        string format
        int row_count
        string status
    }
    DATASET_PROFILES {
        string dataset_id FK
        json schema_summary
        json stats_summary
        json correlation_summary
    }
    RESEARCH_QUESTIONS {
        string id PK
        string dataset_id FK
        string category
        string question_text
        json target_columns
    }
    ANALYSIS_RUNS {
        string id PK
        string rq_id FK
        string status
        int attempts
        int max_attempts
    }
    INSIGHT {
        string id PK
        string run_id FK
        text summary_text
        json key_takeaways
    }
    RUN_METRICS {
        string run_id FK
        int total_tokens
        int llm_call_count
    }
```

Postgres holds everything durable; the local filesystem holds raw dataset files, per-attempt generated code, sandbox output artifacts, and the append-only research telemetry log (`data/logs/trials.jsonl`) — kept deliberately separate from the DB so the paper's analysis scripts can read it without touching the live application state.

---

## ⚙ Backend

**Stack:** FastAPI · SQLAlchemy (async) · PostgreSQL + `pgvector` · LangGraph · Chroma · Docker SDK/CLI · OpenRouter / Google Gemini via a provider-agnostic LLM client with `tenacity`-based retry for free-tier rate limits.

Key modules:

| Path | Responsibility |
|---|---|
| `app/services/storage.py` | Streams uploads to disk, validates type/size |
| `app/services/profiling.py` | Pandas-based schema/stats/correlation/sample profiling |
| `app/services/sandbox.py` | Docker sandbox invocation, timeout enforcement |
| `app/services/llm.py` | Provider-agnostic LLM client + rate-limit retry |
| `app/services/job_bus.py` | In-process pub/sub for live run-status streaming |
| `app/services/telemetry.py` | Structured per-trial JSONL research logging |
| `app/rag/` | Vector store, embedding, and retrieval for question generation |
| `app/agents/` | LangGraph state, nodes, and the compiled pipeline |
| `app/evaluation/` | Offline RQ-quality and code-quality scoring modules for the paper |
| `app/api/` | REST routes: `auth`, `datasets`, `research_questions`, `runs`, `insights`, `reports`, `ws` |

---

## 🖥 Frontend

**Stack:** Next.js · React · TypeScript.

The UI walks the same journey the pipeline runs: upload a dataset → watch profiling and question generation complete → kick off runs per question → watch live status over the WebSocket → browse resulting insights, charts, and the final report.

---

## 📊 Evaluation & Research Instrumentation

DataMind was built to *answer a research question*, not just to work. Every run is measurable:

- **RQ Quality** — column-grounding rate, EDA-category coverage, redundancy, and semantic diversity computed automatically (zero LLM cost); relevance/specificity/actionability scored by a **held-out LLM judge** using a different model/prompt than the generator itself, so the pipeline never grades its own homework.
- **Code Quality** — deterministic static signals (cyclomatic complexity, `.iterrows()` anti-pattern detection, guard-clause presence, backend correctness) *and* a documented 5-dimension rubric (correctness, idiomatic usage, robustness, output clarity, professional style) scored by an LLM judge — reported side by side so one can corroborate the other.
- **Execution Metrics** — first-pass success rate, eventual success rate, mean attempts to success, and a rule-based failure taxonomy (timeout / KeyError / dtype mismatch / malformed JSON / sandbox OOM), all derived directly from the append-only trial log.
- **Cost Metrics** — total tokens and LLM call count per run, captured per trial for a token-cost-per-successful-insight comparison between the RAG and baseline arms.

Every trial — RAG arm or baseline, success or failure — becomes one line in `data/logs/trials.jsonl`, independent of the live Postgres state, so a paired statistical comparison (t-test / Wilcoxon, with confidence intervals) can be run entirely offline against that log.

---

## 🔌 API Surface

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/auth/login` | Local single-user auth (JWT) |
| `POST` | `/datasets` | Upload a dataset, kicks off background profiling |
| `GET` | `/datasets` / `/datasets/{id}` | List / fetch a dataset |
| `GET` | `/datasets/{id}/profile` | Fetch computed profile |
| `POST` | `/datasets/{id}/questions` | Generate research questions (RAG-augmented) |
| `GET` | `/datasets/{id}/questions` | List generated questions |
| `POST` | `/runs` | Start an analysis run for one research question |
| `GET` | `/runs/{id}` | Poll run status |
| `GET` | `/insights/...` | Fetch insights + visualizations |
| `POST` / `GET` | `/datasets/{id}/report` | Build / fetch the aggregated report |
| `WS` | `/ws/datasets/{id}/status` | Live status stream for an in-progress dataset's runs |

---

## 🚀 Getting Started

```bash
git clone https://github.com/sp2736/data-mind.git
cd data-mind

# --- backend ---
cd backend
cp .env.example .env        # fill in DATABASE_URL, an LLM API key, etc.
pip install -r requirements.txt
docker compose up -d        # Postgres
docker build -t datamind-sandbox:latest -f sandbox/Dockerfile .
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload

# --- frontend (separate shell) ---
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Then open the frontend, upload a dataset, and watch the pipeline run.

---

## 🔧 Configuration Reference

The most relevant `.env` values (see `app/config.py` for the full list):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Async Postgres connection string |
| `OPENROUTER_API_KEY` / `GOOGLE_API_KEY` | LLM provider credentials |
| `QUESTION_GENERATOR_MODEL`, `CODE_GENERATOR_MODEL`, `CODE_CORRECTOR_MODEL`, `INSIGHT_WRITER_MODEL` | Per-node model selection |
| `USE_DOCKER_SANDBOX` | `true` for real Docker isolation, `false` for fast local dev execution |
| `SANDBOX_TIMEOUT_SECONDS`, `SANDBOX_MEMORY_LIMIT`, `SANDBOX_CPU_LIMIT` | Sandbox resource caps |
| `RAG_PERSIST_DIR`, `RAG_EMBEDDING_MODEL` | Local vector store location and embedding model |
| `LOGS_DIR` | Where `trials.jsonl` research telemetry is written |

---

## 📁 Project Layout

```
data-mind/
├── backend/
│   ├── app/
│   │   ├── agents/            # LangGraph state, nodes, compiled pipeline
│   │   ├── api/                # FastAPI routers
│   │   ├── db/                  # SQLAlchemy models + session
│   │   ├── evaluation/       # Offline RQ-quality / code-quality scoring
│   │   ├── rag/                  # Vector store + retriever
│   │   ├── services/           # Storage, profiling, sandbox, LLM, telemetry
│   │   └── schemas/           # Pydantic I/O models
│   ├── migrations/           # Alembic
│   └── sandbox/                # Sandbox Docker image
└── frontend/
    └── src/
        ├── app/                  # Next.js routes (upload, datasets, login, home)
        ├── components/     # UI, charts, auth, layout
        └── lib/                    # API client, auth, mocks
```

---

## 🗺 Roadmap

- [ ] Insight-quality evaluation module (numerical faithfulness, takeaway groundedness, readability, caveat coverage)
- [ ] `experiment/run_experiment.py` — paired RAG-vs-baseline trial harness (N reps × 2 arms)
- [ ] `experiment/judge_trials.py` — offline batch judge scoring into `trials_judged.jsonl`
- [ ] Explicit `rq_judge_model` / `code_judge_model` config fields
- [ ] Per-node LLM call/token breakdown in telemetry
- [ ] Rate-limit retry counting for the resilience metric

---

## 📄 Research Context

DataMind is developed as a B.Tech research project studying whether retrieval-augmented generation measurably improves the relevance, specificity, and actionability of autonomously generated research questions over a non-RAG baseline — and what that improvement costs in tokens. Self-correcting sandboxed code execution is a supporting engineering capability that makes the pipeline reliable enough to generate the trial data the comparison depends on.

<div align="center">
<sub>Built locally-first, end to end — Postgres, the vector store, and the sandbox all run on your own machine.</sub>
</div>

# DataMind — LangGraph Orchestrator: Completion Guide

This documents what was built to complete Phase 4 of your plan
(`datamind-local-backend-plan.md` §5). All code below is **already written
into the corrected zip** at the paths shown — this doc explains the
architecture and the decisions that deviate from the original plan (mainly:
no Docker).

## Key deviation from the original plan: no Docker sandbox

Your original plan (§6) ran generated code via `docker run --rm --network
none ...`. Since you're going fully local now, `backend/app/services/sandbox.py`
was rewritten as a **subprocess-based executor**:

- Each attempt gets a fresh scratch directory under
  `data/generated_code/{run_id}/attempt_{n}/`.
- The dataset is copied in as `./data.<ext>` inside that directory (matches
  the path contract the LLM prompts describe).
- A small wrapper is prepended to the generated script that:
  - sets POSIX `RLIMIT_AS` (address space) and `RLIMIT_CPU` from
    `SANDBOX_MEMORY_LIMIT` / `SANDBOX_TIMEOUT_SECONDS` (Linux/Mac only — a
    no-op on Windows),
  - monkey-patches `socket.socket`/`socket.create_connection` to raise, as a
    best-effort network block.
- `subprocess.run(..., timeout=...)` is the real, OS-agnostic enforcement —
  this is what actually kills a runaway script.

**Be clear-eyed about the trade-off:** this is *not* the isolation Docker
gave you. The script runs as a subprocess of your own backend process,
under your OS user, with full filesystem read access (just no obvious
write target outside its scratch dir, and no working network). This is a
reasonable trade-off for a single-user local research prototype running
LLM-generated pandas/matplotlib code you're actively iterating on — it is
**not** something to expose to untrusted input or run multi-tenant. If you
ever need real isolation again, `services/sandbox.py` keeps the same
function signature (`run_in_sandbox(code_text, dataset_path, run_id, attempt) -> dict`)
as the original Docker design, so swapping the implementation back later
doesn't touch any calling code.

## What was built

```
backend/app/agents/
├── state.py                          # AnalysisState TypedDict (one run = one RQ)
├── schemas.py                        # Pydantic structured-output models for every LLM call
├── graph.py                          # StateGraph assembly + run_analysis() entry point
├── prompts/
│   ├── question_generator_system_prompt.md
│   ├── code_generator_system_prompt.md
│   ├── code_corrector_system_prompt.md
│   └── insight_writer_system_prompt.md
└── nodes/
    ├── question_generator.py         # NOT a graph node — runs once per dataset (see below)
    ├── code_generator.py
    ├── sandbox_execute.py            # + route_after_execution() conditional edge fn
    ├── code_corrector.py
    ├── result_analyzer.py            # deterministic truncation/cleanup, no LLM call
    ├── insight_writer.py
    └── visualization_builder.py

backend/app/services/
├── sandbox.py                        # subprocess-based executor (see above)
└── job_bus.py                        # in-process asyncio.Queue registry for WS pushes

backend/app/api/
├── research_questions.py             # POST/GET /datasets/{id}/questions
├── runs.py                           # POST/GET /datasets/{id}/runs — the pipeline entry point
├── insights.py                       # GET /datasets/{id}/insights
├── reports.py                        # POST/GET /datasets/{id}/report
└── ws.py                             # GET /ws/datasets/{id}/status (WebSocket)
```

### Why `question_generator` isn't a graph node

Your plan's diagram put `question_generator` at the top of the same graph
as the code/sandbox/correction loop. I split it out because the two have
genuinely different cardinality: question generation happens **once per
dataset** (produces N `ResearchQuestion` rows), while the rest of the
pipeline runs **once per research question** (one `AnalysisRun` each). Forcing
both into one `StateGraph` means either re-running question generation on
every RQ (wasteful, and non-deterministic — you'd get different questions
each time) or bolting on branching logic to skip it conditionally, which
just re-implements "call this function once, then call that other thing N
times" with extra ceremony. So:

- `agents/nodes/question_generator.py` is a plain async function, invoked
  directly from `POST /datasets/{id}/questions`.
- `agents/graph.py` is the actual LangGraph `StateGraph`, invoked once per
  `AnalysisRun` from `POST /datasets/{id}/runs`.

### The graph itself

```
START
  → code_generator
  → sandbox_execute
  → [conditional: route_after_execution]
        succeeded            → result_analyzer → insight_writer → visualization_builder → END
        not succeeded, retry → code_corrector → sandbox_execute   (loop)
        attempts exhausted   → give_up → END
```

This matches your plan's diagram exactly, just without the question
generator node (above) and with `sandbox_execute` calling the local
subprocess executor instead of `docker run`.

### Structured outputs (guardrail from your plan §9)

Every LLM call uses `.with_structured_output(SomeModel, include_raw=True)`
against a Pydantic model in `agents/schemas.py` — no manual JSON parsing
anywhere. `include_raw=True` is used specifically so each node can pull
`usage_metadata` (token counts) off the raw response for `run_metrics`,
while still getting the validated `parsed` object.

### Metrics (Phase 5, folded in now instead of retrofitted later)

Every node that makes an LLM call accumulates `llm_call_count`,
`prompt_tokens`, `completion_tokens`, `total_tokens` into the graph state.
`api/runs.py::_execute_run` writes one `RunMetrics` row per completed run
with these totals plus `total_duration_ms` (wall clock across the whole
graph) and `correction_attempts`. This was your plan's explicit warning
(§9: "retrofitting token/cost tracking after the fact means losing data
from your earliest experiment runs") — it's live from the first run.

### WebSocket status updates

`api/ws.py` exposes `GET /ws/datasets/{id}/status?token=<jwt>`. Browsers
can't set an `Authorization` header on a WS handshake, so the JWT goes as a
query param instead — same token you already get from `/auth/login`.
`services/job_bus.py` is a plain in-process `asyncio.Queue` per
`dataset_id` (no Redis needed for a single-process local app); `api/runs.py`
publishes a `run_update` event at `running` and again at the final status.

### What still needs a decision from you: models/prompt tuning

The prompts in `agents/prompts/*.md` are complete and follow your plan's
structure (Role → Input contract → Output contract → Constraints), but
they're a first pass — you should run them against 2-3 real datasets (see
`DATABASE_AND_DATASETS.md` for where to get those), turn on
`LANGCHAIN_TRACING_V2=true`, and tighten the Constraints sections based on
what you actually see the model doing wrong, exactly as your plan's §7
describes.

## Remaining wiring you still need to do by hand

1. **Alembic migration** for the new `Dataset.source_url` column (added to
   support URL-based dataset submission — see `DATABASE_AND_DATASETS.md`):
   ```bash
   cd backend
   alembic revision --autogenerate -m "add source_url to datasets"
   alembic upgrade head
   ```
2. **Install the new dependencies** (already appended to
   `requirements.txt`: `chromadb`, `sentence-transformers`, `kaggle`):
   ```bash
   pip install -r requirements.txt --break-system-packages   # or inside your venv, no flag needed
   ```
3. **Kaggle credentials** for URL-based ingestion — see
   `DATABASE_AND_DATASETS.md`.
4. First run will download the `all-MiniLM-L6-v2` embedding model
   (~80MB, one-time, from Hugging Face) — make sure that's not blocked by
   your network setup before you're fully offline-only.

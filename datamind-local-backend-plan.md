# DataMind — Local-Only Backend Implementation Plan

**Status:** Supersedes `datamind-backend-implementation-plan.md` (the earlier Supabase/R2/Upstash version). That doc is obsolete — do not use it. This project runs entirely on one laptop. No cloud services, no deployment, no public auth.

**Confirmed decisions (do not revisit without a new reason):**
- DB: PostgreSQL in Docker (not SQLite, not Supabase, not MSSQL/Oracle)
- Background jobs: FastAPI `BackgroundTasks` + in-process `asyncio.Queue` per job (not Redis/Celery/Dramatiq)
- Sandbox: Docker container, fresh per execution, `--network none`, resource-limited
- Orchestration: LangGraph only (no PydanticAI)
- Dataframe engine: Pandas only (no Polars)
- Auth: single local user, self-signed JWT (no Supabase Auth, no multi-user system)
- Storage: local filesystem, path references in Postgres (no S3/R2)

---

## 0. How to use this file

Feed this to Antigravity phase by phase. Do not let it skip ahead. Each phase lists scope, files, acceptance criteria, and explicit "do NOT"s. Commit after each phase passes its acceptance criteria.

---

## 1. Architecture

```
Windows Laptop
│
├── Next.js frontend        localhost:3000   (existing repo, mostly unchanged)
├── FastAPI backend         localhost:8000   (new)
│     └── LangGraph graph runs in-process, driven by BackgroundTasks
├── Docker
│     ├── datamind-postgres     (always-on, persistent volume)
│     └── datamind-sandbox      (spun up fresh per code execution, --rm, --network none)
├── Local filesystem (repo-adjacent, gitignored)
│     ├── datasets/{raw,processed}/
│     ├── experiments/
│     ├── generated_code/{run_id}/
│     ├── outputs/{run_id}/{charts,reports,insights}/
│     ├── evaluation/
│     └── logs/
└── External LLM API (OpenAI / Anthropic — network call only, no local compute)
```

No Redis. No S3. No Celery. No deployment config of any kind.

---

## 2. One-time local setup (you do these)

### 2.1 Install Docker Desktop
If not already installed. Verify with `docker --version` and `docker compose version`.

### 2.2 Project layout
```
datamind/
├── frontend/          # existing repo
├── backend/           # new
│   ├── .env
│   ├── docker-compose.yml
│   ├── pyproject.toml (or requirements.txt)
│   ├── alembic.ini
│   ├── migrations/
│   ├── app/
│   └── sandbox/
│       └── Dockerfile          # the code-execution image
└── data/               # local filesystem storage, NOT inside backend/
    ├── datasets/{raw,processed}/
    ├── experiments/
    ├── generated_code/
    ├── outputs/{charts,reports,insights}/
    ├── evaluation/
    └── logs/
```

### 2.3 `backend/docker-compose.yml`
```yaml
services:
  postgres:
    image: postgres:18
    container_name: datamind-postgres
    environment:
      POSTGRES_USER: datamind
      POSTGRES_PASSWORD: datamind_local_dev   # local only, fine to keep simple — never exposed
      POSTGRES_DB: datamind
    ports:
      - "5432:5432"
    volumes:
      - datamind_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U datamind"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  datamind_postgres_data:
```
Run with `docker compose up -d` from `backend/`. The sandbox image is built separately and run on-demand by the backend itself (§6), not left running via compose.

### 2.4 `backend/.env`
```bash
# Database (Docker Postgres, local)
DATABASE_URL=postgresql+asyncpg://datamind:datamind_local_dev@localhost:5432/datamind
DATABASE_URL_DIRECT=postgresql://datamind:datamind_local_dev@localhost:5432/datamind

# Auth — single local user, self-signed JWT (no external auth provider)
LOCAL_USER_EMAIL=you@local
JWT_SECRET=<generate with: python -c "import secrets; print(secrets.token_hex(32))">
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=10080   # 7 days — it's your laptop, no need to re-login constantly

# Local storage roots
DATA_ROOT=../data
DATASETS_RAW_DIR=${DATA_ROOT}/datasets/raw
DATASETS_PROCESSED_DIR=${DATA_ROOT}/datasets/processed
GENERATED_CODE_DIR=${DATA_ROOT}/generated_code
OUTPUTS_DIR=${DATA_ROOT}/outputs
LOGS_DIR=${DATA_ROOT}/logs

# LLM
LLM_PROVIDER=openai                # or anthropic
OPENAI_API_KEY=<your key>
ANTHROPIC_API_KEY=<your key, if used>
LANGCHAIN_TRACING_V2=true          # optional but strongly recommended for debugging the graph
LANGCHAIN_API_KEY=<langsmith key, optional>
LANGCHAIN_PROJECT=datamind-local

# Sandbox
SANDBOX_IMAGE=datamind-sandbox:latest
SANDBOX_TIMEOUT_SECONDS=60
SANDBOX_MEMORY_LIMIT=1g
SANDBOX_CPU_LIMIT=1

# App
ENVIRONMENT=development
CORS_ORIGINS=http://localhost:3000
```

### 2.5 `frontend/.env.local`
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_WS_BASE_URL=ws://localhost:8000
```
No Supabase vars — auth is now just "call `/auth/login` on the local backend, get a JWT back."

### 2.6 `.gitignore` additions
```bash
# backend/.gitignore
.env
__pycache__/
*.pyc

# repo root .gitignore, or data/.gitignore
data/datasets/raw/*
data/datasets/processed/*
data/generated_code/*
data/outputs/*
data/logs/*
!data/**/.gitkeep
```
Datasets and generated artifacts are experiment output, not source — keep them out of git, but keep the directory structure with `.gitkeep` files.

---

## 3. Database Schema

Same entity shapes as before (still matches the frontend's TS interfaces byte-for-byte), but simplified for single-user local use and with the new experiment/metrics tables from your research requirements.

```sql
create extension if not exists "pgcrypto";

-- ========== SINGLE LOCAL USER ==========
-- No auth.users, no multi-user. One row, created by a seed migration.
create table public.local_user (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

-- ========== DATASETS ==========
create table public.datasets (
  id text primary key default ('ds_' || replace(gen_random_uuid()::text, '-', '')),
  user_id uuid not null references public.local_user(id) on delete cascade,
  filename text not null,
  format text not null check (format in ('csv','json')),
  raw_path text not null,              -- filesystem path under DATASETS_RAW_DIR
  processed_path text,                 -- filesystem path under DATASETS_PROCESSED_DIR, set after cleaning
  row_count integer not null default 0,
  column_count integer not null default 0,
  file_size_bytes bigint not null default 0,
  uploaded_at timestamptz not null default now(),
  status text not null default 'processing' check (status in ('ready','processing','failed')),
  description text,
  primary_domain text
);

-- ========== DATASET PROFILES ==========
create table public.dataset_profiles (
  id text primary key default ('dp_' || replace(gen_random_uuid()::text, '-', '')),
  dataset_id text not null references public.datasets(id) on delete cascade,
  schema_summary jsonb not null default '[]',
  stats_summary jsonb not null default '[]',
  correlation_summary jsonb not null default '[]',
  sample_rows jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique(dataset_id)
);

-- ========== RESEARCH QUESTIONS ==========
create table public.research_questions (
  id text primary key default ('rq_' || replace(gen_random_uuid()::text, '-', '')),
  dataset_id text not null references public.datasets(id) on delete cascade,
  category text not null check (category in ('pre-processing','eda')),
  question_text text not null,
  target_columns text[] not null default '{}',
  rationale text not null,
  expected_output_type text not null check (expected_output_type in ('table','chart','metric')),
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ========== ANALYSIS RUNS (one per RQ execution — this is your experiment unit) ==========
create table public.analysis_runs (
  id text primary key default ('run_' || replace(gen_random_uuid()::text, '-', '')),
  dataset_id text not null references public.datasets(id) on delete cascade,
  rq_id text not null references public.research_questions(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','retrying','completed','failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  error_traceback text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_runs_dataset_id on public.analysis_runs(dataset_id);
create index idx_runs_status on public.analysis_runs(status);

-- ========== GENERATED CODE (one row per code-gen attempt within a run) ==========
create table public.generated_code (
  id text primary key default ('gc_' || replace(gen_random_uuid()::text, '-', '')),
  run_id text not null references public.analysis_runs(id) on delete cascade,
  attempt_number integer not null,
  code_text text not null,
  file_path text not null,             -- generated_code/{run_id}/attempt_{n}.py
  created_at timestamptz not null default now()
);

-- ========== EXECUTION ATTEMPTS (sandbox run result per generated_code row) ==========
create table public.execution_attempts (
  id text primary key default ('ea_' || replace(gen_random_uuid()::text, '-', '')),
  generated_code_id text not null references public.generated_code(id) on delete cascade,
  exit_code integer,
  stdout text,
  stderr text,
  duration_ms integer,
  succeeded boolean not null default false,
  output_files jsonb not null default '[]',   -- paths under outputs/{run_id}/
  created_at timestamptz not null default now()
);

-- ========== INSIGHTS ==========
create table public.insights (
  id text primary key default ('ins_' || replace(gen_random_uuid()::text, '-', '')),
  run_id text not null references public.analysis_runs(id) on delete cascade,
  rq_id text not null references public.research_questions(id) on delete cascade,
  category text not null check (category in ('pre-processing','eda')),
  summary_text text not null,
  key_takeaways text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique(rq_id)
);

-- ========== VISUALIZATIONS ==========
create table public.visualizations (
  id text primary key default ('vis_' || replace(gen_random_uuid()::text, '-', '')),
  insight_id text not null references public.insights(id) on delete cascade,
  chart_type text not null check (chart_type in ('bar','scatter','line','pie','table')),
  chart_config jsonb not null default '{}',
  chart_file_path text,                -- if rendered to PNG/SVG, path under outputs/{run_id}/charts/
  created_at timestamptz not null default now(),
  unique(insight_id)
);

-- ========== REPORTS ==========
create table public.reports (
  id text primary key default ('rep_' || replace(gen_random_uuid()::text, '-', '')),
  dataset_id text not null references public.datasets(id) on delete cascade,
  overall_summary text not null,
  cleaning_actions jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique(dataset_id)
);

-- ========== EXPERIMENT METRICS (research-facing — token/cost/timing per run) ==========
create table public.run_metrics (
  id text primary key default ('rm_' || replace(gen_random_uuid()::text, '-', '')),
  run_id text not null references public.analysis_runs(id) on delete cascade,
  llm_model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  llm_call_count integer not null default 0,
  correction_attempts integer not null default 0,
  total_duration_ms integer,
  created_at timestamptz not null default now()
);

-- ========== updated_at trigger ==========
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_runs_updated_at
  before update on public.analysis_runs
  for each row execute procedure public.set_updated_at();
```

No RLS — single local user, no multi-tenant concern. This is a meaningful simplification versus the earlier Supabase plan.

**Seed migration:** insert one row into `local_user` on first `alembic upgrade head`, and hardcode its id (or read it) as the `user_id` for every dataset. The FastAPI auth dependency just checks the JWT signature/expiry and returns this one user — no lookup needed against multiple accounts.

---

## 4. Backend structure

```
backend/
├── .env
├── docker-compose.yml
├── pyproject.toml
├── alembic.ini
├── migrations/versions/
├── sandbox/
│   └── Dockerfile              # pandas/matplotlib/etc image for generated code execution
└── app/
    ├── main.py
    ├── config.py                # pydantic Settings from .env
    ├── deps.py                  # get_current_user (JWT check), get_db
    ├── db/
    │   ├── session.py
    │   └── models.py
    ├── schemas/                 # Pydantic, mirrors §3 + frontend TS interfaces
    ├── api/
    │   ├── auth.py               # POST /auth/login  (checks against LOCAL_USER_EMAIL + a local password, issues JWT)
    │   ├── datasets.py
    │   ├── research_questions.py
    │   ├── runs.py               # analysis_runs CRUD + trigger
    │   ├── insights.py
    │   ├── reports.py
    │   ├── experiments.py        # run_metrics read endpoints, for your eventual paper
    │   └── ws.py                 # WebSocket /ws/datasets/{id}/status
    ├── services/
    │   ├── storage.py            # local filesystem read/write helpers
    │   ├── profiling.py          # real pandas-based schema/stats/correlation
    │   ├── sandbox.py            # docker run wrapper (§6)
    │   └── job_bus.py            # in-process asyncio.Queue registry, keyed by dataset_id
    └── agents/
        ├── graph.py               # LangGraph StateGraph
        ├── state.py
        ├── nodes/
        │   ├── question_generator.py
        │   ├── code_generator.py
        │   ├── result_analyzer.py
        │   ├── code_corrector.py
        │   ├── insight_writer.py
        │   └── visualization_builder.py
        └── prompts/
            ├── question_generator_system_prompt.md
            ├── code_generator_system_prompt.md
            ├── code_corrector_system_prompt.md
            └── insight_writer_system_prompt.md
```

---

## 5. Phased plan

### Phase 1 — Foundations
- `docker compose up -d` → Postgres running.
- Alembic migration applying §3 schema + seed `local_user` row.
- `app/config.py`, `app/db/session.py`, `app/db/models.py`.
- `POST /auth/login` — accepts `{email, password}`, checks against `LOCAL_USER_EMAIL` + a password you set in `.env` (`LOCAL_USER_PASSWORD`), returns a self-signed JWT (`python-jose` or `pyjwt`, signed with `JWT_SECRET`).
- `app/deps.py::get_current_user` — verifies the JWT locally (no external call), returns the single `local_user` row.
- `GET /health`.

**Acceptance:** `uvicorn app.main:app --reload` boots; `/health` returns 200; logging in returns a JWT; a protected test route rejects requests without a valid token.

### Phase 2 — Frontend auth swap
- Replace `AuthContext.tsx`'s mock `login`/`logout` with real calls to `POST /auth/login` on the FastAPI backend. Keep the `AuthContextType` interface, the storage keys (`datamind_auth_token`, `datamind_auth_user`), and `AuthGuard.tsx` completely unchanged.
- No Supabase client needed anywhere in the frontend now.

**Acceptance:** login page authenticates against the real backend; session persists across reload; `AuthGuard` still redirects correctly.

### Phase 3 — Real dataset upload + profiling
- `POST /datasets` — multipart upload, save to `DATASETS_RAW_DIR/{dataset_id}/{filename}`, create `datasets` row (`status='processing'`), run **real** Pandas profiling in a `BackgroundTask` (not the fake random generator from the frontend mocks).
- `app/services/profiling.py`: `pd.read_csv`/`pd.read_json` → dtypes, null counts/%, unique counts, `.describe()` percentiles for numeric columns, mode for categorical, `df.corr()` top pairs, first 10 rows JSON-safe.
- On completion: update `row_count`, `column_count`, `status='ready'` (or `'failed'` + reason).
- `GET /datasets`, `GET /datasets/{id}`, `GET /datasets/{id}/profile`.
- Frontend: swap `src/lib/mock/datasets.ts` + `datasetProfiles.ts` imports for real API calls in `src/lib/api/`. Upload page's fake progress timer replaced with real upload + poll/WS for `status='ready'`.

**Acceptance:** uploading a real CSV produces a `dataset_profiles` row with numbers that actually come from that file — not `Math.random()`. Uploading a churn-like CSV with genuinely missing values shows real null_count/null_percentage matching the file.

### Phase 4 — LangGraph pipeline: questions → code → sandbox → correction
This is the actual research core.

**Graph (`app/agents/graph.py`):**
```
START
  → question_generator          (dataset_profile → ResearchQuestion[], written to DB)
  [per selected RQ, one graph run each:]
  → code_generator               (RQ + profile → Python code text)
  → sandbox_execute               (§6 — run in Docker, capture stdout/stderr/exit/output files)
  → branch: succeeded?
      ├── YES → result_analyzer → insight_writer → visualization_builder → persist → END
      └── NO  → code_corrector (sees stderr + prior code) → sandbox_execute (loop)
                    → attempts >= max_attempts? → persist as failed → END
```
- State (`app/agents/state.py`): `dataset_id`, `run_id`, `rq_id`, `question_text`, `target_columns`, `dataset_profile` (schema/stats/correlation only — never the full raw dataframe in LLM context), `code_history` (all attempts), `execution_history`, `final_insight`, `final_visualization`.
- Driven by: `POST /datasets/{id}/runs {rq_ids: [...]}` → for each RQ, create an `analysis_runs` row, launch `BackgroundTasks.add_task(run_graph, run_id)`.
- Progress push: each node writes its transition to `analysis_runs` (status/attempts) and pushes an event onto that dataset's `job_bus` queue; `WS /ws/datasets/{id}/status` drains the queue and forwards to the connected frontend client.
- On graph completion for all RQs of a dataset: aggregate a `Report` row from all `insights` + `generated_code`/cleaning-relevant findings.

**Acceptance:** running a real dataset through this produces real generated Python code (inspectable in `generated_code/{run_id}/`), a real execution result, and — critically — at least one observable self-correction: intentionally trigger a code error (e.g. ask about a nonexistent column) and confirm `code_corrector` fires and either fixes it or exhausts `max_attempts` and marks the run `failed` with a real traceback.

### Phase 5 — Experiment metrics + evaluation scaffolding
- Every LLM call in every node writes a `run_metrics` row (or accumulates into one row per run): model name, prompt/completion/total tokens (from the LLM client's usage response), call count, correction attempts, total wall-clock time.
- `GET /experiments/{run_id}/metrics`, `GET /experiments` (list, for building comparison tables later).
- `evaluation/` directory: leave structured but empty until you actually have baseline systems to compare against — don't build evaluation harness code before you know what you're evaluating against (per your own §11/§24 rules).

**Acceptance:** after running the pipeline on 2-3 test datasets, you can query `run_metrics` and get a real table of token usage/timing/attempt counts per run — this is the raw data your paper's evaluation section will draw from.

---

## 6. Docker sandbox — concrete implementation

**`backend/sandbox/Dockerfile`:**
```dockerfile
FROM python:3.12-slim
RUN pip install --no-cache-dir pandas numpy matplotlib scipy
WORKDIR /workspace
# No ENTRYPOINT — the backend passes the script path at `docker run` time
```
Build once: `docker build -t datamind-sandbox:latest ./sandbox`. Rebuild whenever you add a library the generated code might need.

**`app/services/sandbox.py`** (conceptual):
```python
import subprocess, uuid, shutil
from pathlib import Path

def run_in_sandbox(code_text: str, dataset_path: Path, run_id: str, attempt: int) -> dict:
    workdir = Path(settings.GENERATED_CODE_DIR) / run_id
    workdir.mkdir(parents=True, exist_ok=True)
    script_path = workdir / f"attempt_{attempt}.py"
    script_path.write_text(code_text)

    output_dir = Path(settings.OUTPUTS_DIR) / run_id
    output_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "docker", "run", "--rm",
        "--network", "none",
        f"--memory={settings.SANDBOX_MEMORY_LIMIT}",
        f"--cpus={settings.SANDBOX_CPU_LIMIT}",
        "-v", f"{script_path}:/workspace/script.py:ro",
        "-v", f"{dataset_path}:/workspace/data{dataset_path.suffix}:ro",
        "-v", f"{output_dir}:/workspace/output:rw",
        settings.SANDBOX_IMAGE,
        "python", "/workspace/script.py",
    ]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            timeout=settings.SANDBOX_TIMEOUT_SECONDS,
        )
        return {
            "exit_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "succeeded": result.returncode == 0,
        }
    except subprocess.TimeoutExpired:
        return {"exit_code": -1, "stdout": "", "stderr": "Execution timed out", "succeeded": False}
```
Notes:
- Generated code should read the dataset from `/workspace/data.csv` (or `.json`) and write any output files (charts, cleaned data) to `/workspace/output/` — this contract needs to be stated explicitly in the `code_generator` system prompt (§7).
- The host-side `timeout=` on `subprocess.run` is your real enforcement — don't rely on the container to self-terminate.
- `--network none` closes exfiltration risk; matplotlib needs no network to save a PNG to `/workspace/output/`, so this doesn't limit legitimate functionality.
- One container per attempt, always `--rm`. Never reuse.

---

## 7. LangGraph prompt configuration guide

Same principle as before, adapted to the new node set:

**Files:** `backend/app/agents/prompts/*.md`, loaded at runtime, never inline strings. Version them in git. Keep a `CHANGELOG.md` alongside noting why each change was made.

**Structure for each prompt:** Role → Input contract → Output contract (matched to a Pydantic model, use `.with_structured_output()`) → Domain constraints → Style constraints.

**`code_generator_system_prompt.md` — key constraints specific to the sandbox contract:**
```markdown
# Role
You generate a single, self-contained Python script that answers one specific
research question about a dataset, using only pandas/numpy/matplotlib/scipy.

# Environment contract (must be followed exactly)
- The dataset is available at: /workspace/data.csv (or .json — you will be told which)
- Any chart you produce must be saved as a PNG to: /workspace/output/chart.png
- Any cleaned/transformed dataset must be saved to: /workspace/output/processed.csv
- Print any scalar findings (a computed statistic, a correlation value) to stdout
  as plain text — do not use logging, do not use print() for debugging noise
- You have NO network access. Do not attempt any network call.
- You have a memory limit and a {timeout}s wall-clock limit — avoid unnecessarily
  expensive operations (no full-dataset nested loops when a vectorized pandas
  operation exists)

# Input you will receive
- question_text, target_columns
- dataset_profile: schema_summary, stats_summary, correlation_summary (NOT raw rows
  beyond a 10-row sample — do not assume statistics about rows you cannot see)

# Output contract
Return ONLY the Python code, no markdown fences, no explanation text.

# Constraints
- Only reference columns present in schema_summary.
- Do not fabricate column names.
- Prefer pandas vectorized operations over explicit Python loops.
```

**`code_corrector_system_prompt.md`** additionally receives the failed code + its exact `stderr`, and must be told explicitly: "Make the minimal change that fixes the reported error. Do not rewrite unrelated parts of the script."

**Iteration workflow:** `LANGCHAIN_TRACING_V2=true` + LangSmith → inspect exact node inputs/outputs per run → tighten the relevant prompt file's Constraints section → re-run against your 2-3 test datasets → compare against the frontend's original hand-authored mock insights (`insights.ts`) as a rough quality bar, since those were clearly written to the standard you're aiming for.

---

## 8. Frontend integration checklist

1. No new frontend dependencies needed (no `@supabase/supabase-js` — auth now hits your own FastAPI `/auth/login`).
2. `src/lib/api/client.ts` — thin fetch wrapper, `NEXT_PUBLIC_API_BASE_URL`, attaches `Authorization: Bearer <token>` from `useAuth()`.
3. One module per mock file, same function signatures, pointed at real endpoints: `datasets.ts`, `datasetProfiles.ts`, `researchQuestions.ts`, `insights.ts`, `visualizations.ts`, `reports.ts` → `src/lib/api/*.ts`.
4. `status/page.tsx`: replace the `setTimeout` simulation with `POST /datasets/{id}/runs` + WebSocket subscription to `/ws/datasets/{id}/status`, patching `jobs` state on `run_update` messages exactly as before.
5. Keep `src/lib/mock/*` in place until every consumer is migrated and Phase 4 acceptance criteria pass — delete only then.
6. Re-check `node_modules/next/dist/docs/` for Next 16-specific data-fetching guidance before writing fetch/caching code, per the existing `AGENTS.md` warning.

---

## 9. Guardrails

- Every LLM node call must go through `.with_structured_output()` against a Pydantic model — no manual JSON string parsing of LLM output.
- Never let a node see the full raw dataframe in its prompt — profile summary + sample rows only, consistent with your "metadata-only" research framing.
- Every sandbox execution must be `--rm`, `--network none`, timeout-enforced from the host side. No exceptions, no "just this once" always-on containers.
- No new service (Redis, cloud DB, deployment config) gets added without a new decision checkpoint — the whole point of this doc is that the current stack is deliberately minimal for a one-laptop research prototype.
- `run_metrics` gets written on every single LLM call, not "added later" — retrofitting token/cost tracking after the fact means losing data from your earliest experiment runs.

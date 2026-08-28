# DataMind — Implementation TODO List & Progress Tracker

> **Source Plan:** [`datamind-local-backend-plan.md`](file:///d:/SWAYAM/STUDIES/PROJECTS/data-mind/datamind-local-backend-plan.md)  
> **Last Updated:** 2026-08-28  
> **Summary:** Track completed and pending tasks mapped directly from the local-only backend implementation plan.

---

## 1. Project Setup & Infrastructure (§2)

- [ ] **2.1 Install & Verify Docker Desktop** *(Prerequisite)*
  - [ ] Verify `docker --version`
  - [ ] Verify `docker compose version`
- [x] **2.2 Directory Layout**
  - [x] Root backend directory structure (`backend/`)
  - [x] Local storage directory structure (`data/datasets/raw`, `processed`, `experiments`, `generated_code`, `outputs`, `evaluation`, `logs`)
  - [ ] `backend/sandbox/Dockerfile` (Code execution container image definition)
- [x] **2.3 Compose Configuration**
  - [x] `backend/docker-compose.yml` (Postgres 18 service with persistent data volume)
- [x] **2.4 Environment Files**
  - [x] `backend/.env` (Database URLs, JWT secrets, local storage paths, LLM keys, sandbox params)
  - [ ] `frontend/.env.local` (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WS_BASE_URL`)
- [x] **2.6 Version Control Control & Gitignore**
  - [x] `backend/.gitignore` created (.env, venv, pycache)
  - [x] Root `.gitignore` updated

---

## 2. Database Schema & Migrations (§3)

- [x] **Alembic Database Environment**
  - [x] `backend/alembic.ini`
  - [x] `backend/migrations/env.py` & script location setup
  - [x] Initial Migration Script (`migrations/versions/cc1e1fea29c3_initial_schema.py`)
- [x] **SQLAlchemy ORM Models (`backend/app/db/models.py`)**
  - [x] `LocalUser` (`local_user`)
  - [x] `Dataset` (`datasets`)
  - [x] `DatasetProfile` (`dataset_profiles`)
  - [x] `ResearchQuestion` (`research_questions`)
  - [x] `AnalysisRun` (`analysis_runs`)
  - [x] `GeneratedCode` (`generated_code`)
  - [x] `ExecutionAttempt` (`execution_attempts`)
  - [x] `Insight` (`insights`)
  - [x] `Visualization` (`visualizations`)
  - [x] `Report` (`reports`)
  - [x] `RunMetrics` (`run_metrics`)
- [x] **Database Seeding**
  - [x] Single local user seed script (`backend/app/seed.py`)

---

## 3. Core Backend Infrastructure (§4)

- [x] **Application Core**
  - [x] Settings management via Pydantic (`app/config.py`)
  - [x] Async SQLAlchemy engine & session maker (`app/db/session.py`)
  - [x] FastAPI application initialization (`app/main.py`)
- [x] **Auth & Dependencies**
  - [x] JWT token creation and verification (`app/deps.py`)
  - [x] Auth API router (`app/api/auth.py` -> `POST /auth/login`)
  - [x] Auth schemas (`app/schemas/auth.py`)
  - [x] Health check endpoint (`app/main.py` -> `GET /health`)
- [ ] **Services Scaffolding**
  - [x] Base LLM client wrapper (`app/services/llm.py`)
  - [x] Local filesystem storage service (`app/services/storage.py`)
  - [x] Real Pandas dataset profiling service (`app/services/profiling.py`)
  - [ ] Docker container sandbox executor (`app/services/sandbox.py`)
  - [ ] In-process asyncio Queue job bus (`app/services/job_bus.py`)

---

## 4. Phased Implementation Roadmap (§5)

### Phase 1 — Foundations
- [x] Postgres container defined & run via Docker Compose
- [x] Database migration applied (`cc1e1fea29c3_initial_schema.py`)
- [x] `local_user` seed script created
- [x] Config (`app/config.py`), session (`app/db/session.py`), and models (`app/db/models.py`) implemented
- [x] `POST /auth/login` endpoint implemented
- [x] `app/deps.py::get_current_user` JWT validation dependency implemented
- [x] `GET /health` route returning 200 OK

### Phase 2 — Frontend Auth Swap
- [ ] Create `frontend/.env.local`
- [ ] Connect `AuthContext.tsx` `login`/`logout` functions to backend `POST /auth/login`
- [ ] Verify local JWT storage & `AuthGuard.tsx` redirect flow

### Phase 3 — Real Dataset Upload + Profiling
- [x] Implement `app/services/storage.py` for file saving
- [x] Implement `app/services/profiling.py` (dtypes, null counts, describe stats, corr matrix, sample rows)
- [x] Implement `POST /datasets` multipart upload + background profiling task in `app/api/datasets.py`
- [x] Implement `GET /datasets`, `GET /datasets/{id}`, `GET /datasets/{id}/profile`
- [x] Implement `app/schemas/datasets.py` response models
- [ ] Frontend API integration (`src/lib/api/client.ts`, `src/lib/api/datasets.ts`)
- [ ] Swap mock upload timer in frontend with real backend polling/WebSocket

### Phase 4 — LangGraph Pipeline (Questions → Code → Sandbox → Correction)
- [ ] Build Docker Sandbox image `datamind-sandbox:latest` from `backend/sandbox/Dockerfile`
- [ ] Implement Docker sandbox runner service (`app/services/sandbox.py`)
- [ ] Implement system prompt files in `app/agents/prompts/`:
  - [ ] `question_generator_system_prompt.md`
  - [ ] `code_generator_system_prompt.md`
  - [ ] `code_corrector_system_prompt.md`
  - [ ] `insight_writer_system_prompt.md`
- [ ] Implement LangGraph state (`app/agents/state.py`)
- [ ] Implement LangGraph nodes (`app/agents/nodes/`):
  - [ ] `question_generator.py`
  - [ ] `code_generator.py`
  - [ ] `result_analyzer.py`
  - [ ] `code_corrector.py`
  - [ ] `insight_writer.py`
  - [ ] `visualization_builder.py`
- [ ] Assemble LangGraph StateGraph (`app/agents/graph.py`)
- [ ] Implement job event queue & WebSocket endpoint (`app/api/ws.py`)
- [ ] Implement analysis run API endpoints (`app/api/runs.py`, `insights.py`, `reports.py`)
- [ ] Connect frontend status page to WebSocket status updates

### Phase 5 — Experiment Metrics & Evaluation Scaffolding
- [ ] Implement token/cost/timing recording into `run_metrics` on LLM calls
- [ ] Implement metrics endpoints (`GET /experiments/{run_id}/metrics`, `GET /experiments`)
- [ ] Set up evaluation directory harness (`data/evaluation/`)

---

## 5. System Contracts & Guardrails (§6, §7, §9)

- [ ] All LLM calls use structured output models (`.with_structured_output()`)
- [ ] LLMs receive metadata/profile summaries only (no raw dataset data in prompt context)
- [ ] Sandbox runs strictly configured with `--rm`, `--network none`, and host-side process execution timeout
- [ ] Every LLM interaction records metrics in `run_metrics` table
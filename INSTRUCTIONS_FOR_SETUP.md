# DataMind — Local Setup Guide

This guide covers how to set up the DataMind project entirely locally on your machine.
The project uses **Google Gemini** for language models, **SQLite** (`aiosqlite`) for
the database, and **Chroma** (local persistent client) for RAG.

---

## 1. Prerequisites

Before starting, ensure you have the following installed:
- **Python 3.10+**
- **Git**
- **Docker Desktop** (Required for the `datamind-sandbox` to safely execute AI-generated code)
- **Google Gemini API Key** — get one free at [https://aistudio.google.com](https://aistudio.google.com)
  (the `gemini-3.1-flash-lite` model used by default is on the free tier)

---

## 2. Kaggle Credentials (Required for seeding data)

The backend can fetch datasets directly from Kaggle.
1. Go to [kaggle.com/settings](https://www.kaggle.com/settings) and log in.
2. Scroll down to the **API** section and click **Create New Token**.
3. Create a `.kaggle` folder in your user directory (e.g., `C:\Users\YourName\.kaggle` on Windows, or `~/.kaggle` on Mac/Linux).
4. Save the generated token. Depending on the token format you get:
   - If it downloaded a `kaggle.json` file, place it in the `.kaggle` folder.
   - If it gave you an `access_token` string, create a file named `access_token` inside the `.kaggle` folder and paste the string inside it.

---

## 3. Backend Setup

Open a terminal and navigate to the project root directory.

### A. Create the Virtual Environment
```bash
cd backend
python -m venv venv
```

### B. Activate the Virtual Environment
- **Windows:** `.\venv\Scripts\activate`
- **Mac/Linux:** `source venv/bin/activate`

### C. Install Dependencies
```bash
pip install -r requirements.txt
```
*(This installs FastAPI, LangGraph, SQLAlchemy, `aiosqlite`, `chromadb`,
`sentence-transformers` for RAG, `langchain-google-genai` for the LLM, and the Kaggle API.)*

### D. Configure Environment Variables
In the `backend` folder, copy `.env.example` to `.env`:
```bash
cp .env.example .env   # Windows: copy .env.example .env
```
Then open `.env` and fill in:

```env
DATABASE_URL=sqlite+aiosqlite:///../data/datamind.db
DATABASE_URL_DIRECT=sqlite:///../data/datamind.db

LOCAL_USER_EMAIL=you@local
LOCAL_USER_PASSWORD=changeme_local
JWT_SECRET=replace_with_a_long_random_string_at_least_32_chars

DATA_ROOT=../data
DATASETS_RAW_DIR=${DATA_ROOT}/datasets/raw
DATASETS_PROCESSED_DIR=${DATA_ROOT}/datasets/processed
GENERATED_CODE_DIR=${DATA_ROOT}/generated_code
OUTPUTS_DIR=${DATA_ROOT}/outputs
LOGS_DIR=${DATA_ROOT}/logs

# --- LLM Provider: Google Gemini (the supported provider) ---
GOOGLE_API_KEY=your_key_here   # from https://aistudio.google.com

QUESTION_GENERATOR_MODEL=google:gemini-3.1-flash-lite
CODE_GENERATOR_MODEL=google:gemini-3.1-flash-lite
CODE_CORRECTOR_MODEL=google:gemini-3.1-flash-lite
INSIGHT_WRITER_MODEL=google:gemini-3.1-flash-lite
LLM_TEMPERATURE=0.2

LANGCHAIN_TRACING_V2=false
LANGCHAIN_PROJECT=datamind-local

SANDBOX_IMAGE=datamind-sandbox:latest
SANDBOX_TIMEOUT_SECONDS=60
SANDBOX_MEMORY_LIMIT=1g
SANDBOX_CPU_LIMIT=1

# Set to true for real Docker isolation (required for paper experiments).
# Keep false for fast local subprocess execution during development.
USE_DOCKER_SANDBOX=false

ENVIRONMENT=development
CORS_ORIGINS=http://localhost:3000
```

> **No database server needed.** SQLite creates the `data/datamind.db` file automatically
> when Alembic runs. There is no Postgres or pgvector dependency.

### E. Initialize the Database
Run Alembic to create the SQLite database file and apply the schema:
```bash
alembic upgrade head
```

### F. Create the Local User
Run the seed script to create the initial user:
```bash
python -m app.seed
```
This creates the `you@local` user from the `LOCAL_USER_EMAIL` / `LOCAL_USER_PASSWORD`
settings in `.env`.

---

## 4. Build the Sandbox Docker Image

The system isolates generated code execution inside a Docker container.
Open a new terminal at the project root and run:
```bash
docker build -t datamind-sandbox:latest -f backend/sandbox/Dockerfile backend/sandbox/
```
*(Ensure Docker Desktop is running before executing this.)*

> **Development shortcut:** Set `USE_DOCKER_SANDBOX=false` in `.env` to skip Docker
> and run generated code in a subprocess instead. This is faster but provides no
> network isolation. Always use Docker (`USE_DOCKER_SANDBOX=true`) for paper experiments.

---

## 5. Run the Application

You need two terminals for the backend and frontend.

**Terminal 1: Backend**
```bash
cd backend
# Ensure venv is activated
uvicorn app.main:app --reload --port 8000
```
> **Note:** The very first time the RAG system is triggered (when generating questions),
> it will automatically download the `all-MiniLM-L6-v2` embedding model (~80 MB) from
> HuggingFace. This only happens once and is cached locally.

**Terminal 2: Frontend**
```bash
cd frontend
npm install
npm run dev
```

---

## 6. Seeding Datasets (Testing the Pipeline)

To run high-volume testing of datasets without clicking the UI, use the `seed_datasets.py`
script located in the root of the project.

While the backend is running, open a third terminal (with the backend `venv` activated)
at the project root and run:

```bash
# Seed 1 dataset and wait for it to process completely to test the flow
python seed_datasets.py --email you@local --password changeme_local --limit 1 --wait

# Seed all 130+ datasets in the background
python seed_datasets.py --email you@local --password changeme_local
```

This hits your local backend API, which will authenticate, download from Kaggle,
profile the data, and populate your SQLite DB.

---

## 7. Running Paper Experiments

The experiment harness in `backend/experiment/` runs paired RAG-vs-baseline trials.

```bash
cd backend
# Dry run — shows plan without making any LLM/DB calls
python -m experiment.run_experiment --dataset-ids ds_a ds_b --n-reps 2 --rq-only --dry-run

# Real run (requires Docker sandbox for reproducibility)
USE_DOCKER_SANDBOX=true python -m experiment.run_experiment \
  --dataset-ids ds_a ds_b --n-reps 5 --max-rqs 8

# Offline batch judging (after data collection)
python -m experiment.judge_trials \
  --rq-judge-model google:gemini-1.5-pro \
  --code-judge-model google:gemini-1.5-pro \
  --insight-judge-model google:gemini-1.5-pro
```

See `DATAMIND_FIX_INSTRUCTIONS.md` §T10–T12 for the full experiment protocol.

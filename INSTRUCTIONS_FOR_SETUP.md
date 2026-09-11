# DataMind — Local Setup Guide

This guide covers how to set up the DataMind project entirely locally on your machine. This setup is optimized to run completely offline (zero API cost) using **Ollama** for language models, **SQLite** for the database, and **Chroma** (local) for RAG.

---

## 1. Prerequisites

Before starting, ensure you have the following installed:
- **Python 3.10+**
- **Git**
- **Docker Desktop** (Required for the `datamind-sandbox` to safely execute AI-generated code)
- **Ollama** (Download and install from [ollama.com](https://ollama.com))

---

## 2. Pull Ollama Models

The pipeline uses a split-model architecture optimized for speed and accuracy. Open a terminal and run the following commands to download the models into Ollama:

```bash
# Used for code generation and correction (excellent JSON and code compliance)
ollama run gemma3:4b

# Used for question generation and insight writing (fast and articulate NL)
ollama run qwen2.5:3b
```
*(Once they finish downloading and give you a prompt, you can just type `/bye` to exit. The models are now cached.)*

---

## 3. Kaggle Credentials (Required for seeding data)

The backend needs to fetch datasets directly from Kaggle.
1. Go to [kaggle.com/settings](https://www.kaggle.com/settings) and log in.
2. Scroll down to the **API** section and click **Create New Token**.
3. Create a `.kaggle` folder in your user directory (e.g., `C:\Users\YourName\.kaggle` on Windows, or `~/.kaggle` on Mac/Linux).
4. Save the generated token. Depending on the token format you get:
   - If it downloaded a `kaggle.json` file, place it in the `.kaggle` folder.
   - If it gave you an `access_token` string, create a file named `access_token` inside the `.kaggle` folder and paste the string inside it.

---

## 4. Backend Setup

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
*(This will install FastAPI, LangGraph, SQLAlchemy, as well as `chromadb` and `sentence-transformers` for the RAG implementation, and the Kaggle API).*

### D. Configure Environment Variables
In the `backend` folder, duplicate `.env.example` (if it exists) to `.env`, or just create a `.env` file with the following contents:

```env
DATABASE_URL=sqlite+aiosqlite:///../data/datamind.db
DATABASE_URL_DIRECT=sqlite:///../data/datamind.db

LOCAL_USER_EMAIL=you@local
LOCAL_USER_PASSWORD=changeme_local
JWT_SECRET=42c88bd4d4acc9dd19436a5dcc4e1b9f6c18d74824c68e1976453012e5e6e4e4
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=10080

DATA_ROOT=../data
DATASETS_RAW_DIR=${DATA_ROOT}/datasets/raw
DATASETS_PROCESSED_DIR=${DATA_ROOT}/datasets/processed
GENERATED_CODE_DIR=${DATA_ROOT}/generated_code
OUTPUTS_DIR=${DATA_ROOT}/outputs
LOGS_DIR=${DATA_ROOT}/logs

# --- LLM PROVIDER (Ollama) ---
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434

QUESTION_GENERATOR_MODEL=qwen2.5:3b
CODE_GENERATOR_MODEL=gemma3:4b
CODE_CORRECTOR_MODEL=gemma3:4b
INSIGHT_WRITER_MODEL=qwen2.5:3b
LLM_TEMPERATURE=0.2

LANGCHAIN_TRACING_V2=false
LANGCHAIN_PROJECT=datamind-local

SANDBOX_IMAGE=datamind-sandbox:latest
SANDBOX_TIMEOUT_SECONDS=60
SANDBOX_MEMORY_LIMIT=1g
SANDBOX_CPU_LIMIT=1

ENVIRONMENT=development
CORS_ORIGINS=http://localhost:3000
```

### E. Initialize the Database
Run Alembic to create the SQLite database file (`data/datamind.db`) and apply the schemas:
```bash
alembic upgrade head
```

### F. Create the Local User
Since the app requires authentication, you must manually seed the test user (`you@local`) into the SQLite database. Run this quick python script:
```bash
python -c "
import asyncio, uuid
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text
async def seed():
    engine = create_async_engine('sqlite+aiosqlite:///../data/datamind.db')
    async with async_sessionmaker(engine)() as db:
        await db.execute(text('INSERT INTO local_user (id, email) VALUES (:id, :email)'), {'id': str(uuid.uuid4()), 'email': 'you@local'})
        await db.commit()
asyncio.run(seed())
"
```

---

## 5. Build the Sandbox Docker Image

The system isolates generated code execution inside a Docker container.
Open a new terminal at the project root and run:
```bash
cd sandbox
docker build -t datamind-sandbox:latest .
```
*(Ensure Docker Desktop is running before executing this).*

---

## 6. Run the Application

You need two terminals for the backend and frontend.

**Terminal 1: Backend**
```bash
cd backend
# Ensure venv is activated
uvicorn app.main:app --reload --port 8000
```
> **Note:** The very first time the RAG system is triggered (when generating questions), it will automatically download a ~80MB embedding model (`all-MiniLM-L6-v2`) from HuggingFace. This only happens once.

**Terminal 2: Frontend**
```bash
cd frontend
npm install
npm run dev
```

---

## 7. Seeding Datasets (Testing the Pipeline)

To run high-volume testing of datasets without clicking the UI, you can use the `seed_datasets.py` script located in the root of the project.

While the backend is running, open a third terminal (with the backend `venv` activated) at the project root and run:

```bash
# Seed 1 dataset and wait for it to process completely to test the flow
python seed_datasets.py --email you@local --password changeme_local --limit 1 --wait

# Seed all 130+ datasets in the background
python seed_datasets.py --email you@local --password changeme_local
```

This will automatically hit your local backend API, which will authenticate, download from Kaggle, profile the data in the Docker sandbox, and populate your SQLite DB.

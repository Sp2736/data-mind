# DataMind — Database Decision & Test Dataset Seeding

## PostgreSQL vs MongoDB: keep PostgreSQL

**Recommendation: keep Postgres.** Run it as the single lightweight Docker
container you already have in `backend/docker-compose.yml` — that one
container is infrastructure, not the "extra stuff" (sandbox containers,
multi-service orchestration) you're trying to cut. Reasons:

1. **Your schema is already fully built and relational.** 10 SQLAlchemy
   models (`datasets` → `dataset_profiles`, `research_questions` →
   `analysis_runs` → `generated_code` → `execution_attempts`,
   `insights` → `visualizations`, `reports`, `run_metrics`) with real
   foreign keys and an applied Alembic migration. Moving to Mongo means
   either denormalizing all of this into nested documents (losing the
   ability to cheaply query "all failed runs across all datasets" or join
   `run_metrics` for your eventual paper's evaluation tables) or
   re-implementing joins in application code — pure lost work for no
   local-only benefit.
2. **You're already using Postgres-specific features.** `JSONB` columns
   (`schema_summary`, `stats_summary`, `correlation_summary`, `chart_config`)
   and `ARRAY(String)` columns (`target_columns`, `key_takeaways`) don't
   translate 1:1 to Mongo — you'd rewrite, not port.
3. **A single `postgres:18` container via `docker-compose.yml` is not
   meaningfully different from "installing a database locally"** — it's one
   `docker compose up -d`, no Dockerfile of your own to maintain, no
   sandbox image to rebuild, no multi-service networking. This is the
   normal way to run a local dev database even in fully local projects.

**If you genuinely want zero Docker, including for the DB:** swap to
**SQLite** rather than Mongo. It's a one-line change in `backend/.env`
(`DATABASE_URL=sqlite+aiosqlite:///../data/datamind.db`) and Alembic/
SQLAlchemy handle the rest with minor changes (drop `JSONB` → use plain
`JSON`, drop `ARRAY` → use `JSON` for list columns, both already supported
generically by SQLAlchemy 2.0). This keeps every relational join and your
existing schema intact, just removes the server process entirely — genuinely
zero infrastructure. I did not make this swap for you since it touches
`db/models.py` directly; say the word if you want it done.

**Do not go to Mongo** for this project — there's no requirement here
(schema-flexible documents, massive horizontal scale) that Mongo solves and
Postgres/SQLite don't; it would be a pure rewrite for a worse fit to your
actual data shape.

## Dataset ingestion is now URL-based (per your latest change)

`POST /datasets` now takes `{"url": "..."}` instead of a file upload. It
accepts:
- A Kaggle dataset page: `https://www.kaggle.com/datasets/<owner>/<slug>`
- A Kaggle competition page: `https://www.kaggle.com/competitions/<slug>`
- A bare Kaggle ref: `<owner>/<slug>`
- A GitHub file: `https://github.com/<owner>/<repo>/blob/<branch>/<path>.csv`
  or the equivalent `raw.githubusercontent.com` URL

The backend downloads it server-side (`app/services/dataset_fetch.py`),
picks the largest supported tabular file if Kaggle hands back a zip of
several files, then profiles it exactly as before. See
`ORCHESTRATOR_COMPLETION.md` for the remaining migration step
(`source_url` column) this required.

### Kaggle API credentials (required for any `kaggle.com` URL)
1. Go to kaggle.com → your account → **Create New API Token** → downloads
   `kaggle.json`.
2. Place it at `~/.kaggle/kaggle.json` (Linux/Mac) or
   `C:\Users\<you>\.kaggle\kaggle.json` (Windows), permissions `600`.
3. Or skip the file and set env vars instead: `KAGGLE_USERNAME`,
   `KAGGLE_KEY` (add these to `backend/.env` — `python-dotenv` already
   loads that file, and the `kaggle` package reads them from the process
   environment).
4. For **competition** downloads specifically, you must have accepted that
   competition's rules on kaggle.com first, or the API call will 403.

## Test dataset list + seeding script

Two files are provided:
- `kaggle_github_datasets.json` — 134 curated datasets across 20+ domains
  (finance, healthcare, e-commerce, HR, marketing, sports, real estate,
  energy, transportation, social media, education, agriculture, climate,
  cybersecurity, retail, telecom, gaming, entertainment, food, crypto,
  census, manufacturing, IoT, automotive, government, and a handful of
  small GitHub CSVs for quick smoke tests).
- `seed_datasets.py` — bulk-submits entries from that list to your running
  backend via the same `/datasets` endpoint the frontend uses.

**Important caveat on the list:** these are compiled from well-known,
long-standing Kaggle datasets, but Kaggle slugs do occasionally get
renamed, made private, or removed, and I have not live-verified all 134
against the current Kaggle API in this pass. Treat this as a strong
starting list, not a guarantee — run a small batch first:

```bash
cd backend
uvicorn app.main:app --reload &

# Dry run first — see what would be submitted, no network calls
python seed_datasets.py --dry-run --limit 10

# Smoke test with a handful of real submissions, waiting for each to finish
python seed_datasets.py --email you@local --password changeme_local \
    --limit 5 --wait

# Once confident, run a domain slice or the full list
python seed_datasets.py --email you@local --password changeme_local \
    --domain finance,healthcare,e-commerce --sleep 3

python seed_datasets.py --email you@local --password changeme_local --sleep 3
```

`--sleep` defaults to 2s between submissions — raise it if you hit Kaggle
rate limits (their API is fairly generous for individual dataset downloads,
but not for 130 back-to-back). Failed entries (renamed/removed/private
datasets, or competitions whose rules you haven't accepted) are reported in
the summary at the end and simply marked `status='failed'` on that Dataset
row — safe to ignore or retry individually.

## Stretching your API credits across all this testing

You mentioned needing more headroom to test against ~130 datasets × several
research questions each × a correction loop that can call the LLM 1-3 times
per question. A few concrete ways to cut real API spend, from cheapest to
most involved:

1. **Groq's free tier** is already wired into `services/llm.py`
   (`LLM_PROVIDER=groq`) — fast, generous free-tier limits, good for the
   `code_corrector` node specifically (low-latency, high-volume, doesn't
   need your strongest model).
2. **Gemini's free tier** (`gemini-2.5-flash`, already your default) has a
   genuinely usable free daily quota for a single-user local project —
   check current limits at ai.google.dev before assuming you need to pay.
3. **OpenRouter** gives you one API key across many providers including
   several free-tier models (look for `:free` suffixed model IDs on
   openrouter.ai/models). To wire it in, add an OpenRouter branch to
   `get_llm()` in `services/llm.py` using `ChatOpenAI` with
   `base_url="https://openrouter.ai/api/v1"` and your OpenRouter key — it's
   OpenAI-API-compatible, so no new LangChain integration package needed.
4. **Mix models per node deliberately** — your `.env` already has separate
   `QUESTION_GENERATOR_MODEL` / `CODE_GENERATOR_MODEL` /
   `CODE_CORRECTOR_MODEL` / `INSIGHT_WRITER_MODEL` settings. Put your best
   (or only paid) model on `code_generator` (correctness matters most
   there) and a free/cheap model on `code_corrector` and
   `insight_writer` (simpler, more forgiving tasks).
5. **Cache question generation.** Once you've generated `ResearchQuestion`s
   for a dataset, `GET /datasets/{id}/questions` re-reads them from
   Postgres — re-running `POST .../questions` isn't idempotent and will
   burn tokens generating a fresh batch, so only call it once per dataset
   unless you're deliberately iterating on that prompt.
6. **Seed a small batch first.** Don't run all 134 datasets through the
   full pipeline in one sweep — pick 5-10 across different domains
   (`--domain` flag above), validate the pipeline and tune prompts against
   those, then scale up once you're not still finding correction-loop bugs
   that waste retries.

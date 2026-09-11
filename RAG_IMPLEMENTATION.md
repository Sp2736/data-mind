# DataMind — RAG Implementation

## Important caveat first
I don't have a record of a previously "finalized" RAG design for this
project — it isn't in the zip (no RAG code, no mention in
`datamind-local-backend-plan.md`, no RAG references anywhere in the repo),
and I don't have access to whatever earlier conversation settled on a
design. **What follows is a fresh design I built to fit the rest of your
architecture**, not a recovery of something you'd already decided. If your
earlier "finalized" version specified something different (a different
store, a different retrieval target, a different trigger point), tell me
and I'll adjust — this is a reasonable default, not the only correct shape.

## What it does
Retrieval-augmented generation over your **own accumulated insights**, not
external documents. As you run more datasets through the pipeline, every
successful `Insight` gets indexed; future `question_generator` and
`insight_writer` calls retrieve the most similar past insights (by schema
shape) as extra context, so:
- **Question generation** gets inspiration from what kinds of questions
  paid off on similarly-shaped datasets before, without copying specific
  numbers or column names into the new dataset's questions (the prompt
  explicitly forbids that — see `agents/prompts/question_generator_system_prompt.md`).
- **Insight writing** stays consistent in tone/phrasing across your growing
  set of analyses.

This directly targets your stated goal of running ~130+ datasets through
the pipeline: the value of RAG here compounds specifically *because* you're
about to do high-volume testing — dataset #50 benefits from what datasets
#1-49 turned up.

## Why this design (decisions made and why)

**Store: Chroma, local persistent client.** No server process, no Docker —
`chromadb.PersistentClient(path=...)` just writes to a folder on disk
(`../data/rag_store` by default). This matches "completely local now."
Alternatives considered: FAISS (no built-in persistence/metadata filtering
story as clean as Chroma's), a pgvector extension on your existing Postgres
(genuinely reasonable alternative — see below), a hosted vector DB
(rejected outright, contradicts "local").

**Embeddings: local `sentence-transformers` model
(`all-MiniLM-L6-v2`), not an API embedding call.** This was the important
constraint given your credits problem: RAG retrieval fires on every
question-generation and every run, so if embeddings cost API tokens, RAG
itself becomes a meaningful chunk of your budget on top of the actual LLM
calls it's supposed to make cheaper (fewer wasted correction-loop retries,
in theory, once the prompts are tuned with RAG context). A 384-dim,
~80MB, CPU-friendly model run locally costs nothing per call after the
one-time model download.

**Similarity signal: schema shape, not question text.** Documents are
indexed as `"Schema: {columns+dtypes}\nQuestion: {q}\nFinding: {summary}"`
and queried with just `"Schema: {columns+dtypes}"` of the *new* dataset.
This is a deliberately simple MVP signal — it works because "column names +
dtypes" is a decent proxy for "same kind of dataset" (e.g. a dataset with
`customer_id, purchase_date, amount, category` columns will text-embed
close to other retail/transaction datasets). It is not a rigorous schema
matching algorithm. If retrieval quality turns out too loose once you have
real data to look at, the two concrete upgrades are: (a) embed only column
*names* (drop dtypes, which add noise for cross-dataset matching), or (b)
switch to a proper metadata filter (Chroma's `where=`) on a coarse
`primary_domain` tag instead of/alongside pure embedding similarity.

## Files (already in the corrected zip)

```
backend/app/rag/
├── store.py       # Chroma client + embedding fn + collection, all cached singletons
├── indexer.py      # index_insight() — called after every successful AnalysisRun
└── retriever.py    # retrieve_similar_insights() — called before question_generator and insight_writer
```

Integration points (already wired in, not just documented):
- `api/research_questions.py::generate_questions` — retrieves before calling
  `generate_research_questions()`, passes results as `similar_past_insights`.
- `api/runs.py::_execute_run` — retrieves before building the graph's
  `initial_state`, and calls `index_insight()` after a run succeeds and its
  `Insight` row is committed.
- Both retrieval and indexing calls are wrapped in `try/except` at the call
  site — a RAG failure (e.g. Chroma directory permissions, model download
  blocked) degrades to "no RAG context this time," it never fails the
  actual pipeline run. This matters a lot for a 130-dataset batch run: you
  don't want dataset #73's RAG hiccup to kill that run.

## Setup

Already in `requirements.txt`: `chromadb`, `sentence-transformers`. Install:
```bash
cd backend
pip install -r requirements.txt
```

Add to `backend/.env` (defaults already set in `config.py`, override only
if you want a different path/model):
```
RAG_PERSIST_DIR=../data/rag_store
RAG_EMBEDDING_MODEL=all-MiniLM-L6-v2
```

First run downloads the embedding model from Hugging Face
(~80MB, one-time, cached under `~/.cache/huggingface`) — make sure that's
reachable before you're fully offline. `data/rag_store/` should be added to
`.gitignore` (it's a binary local index, not something to commit) — check
that now, it wasn't relevant before this feature existed.

## Testing it end to end
1. Run 2-3 datasets from the same domain (e.g. `--domain finance` from
   `seed_datasets.py`) through the full pipeline: submit → generate
   questions → trigger runs.
2. Submit a 4th finance dataset and call `POST /datasets/{id}/questions`
   again — check the LLM call's logged prompt (`LANGCHAIN_TRACING_V2=true`)
   to confirm `similar_past_insights` in the payload is non-empty and
   actually relevant (not insights from an unrelated domain).
3. If it's empty: check `data/rag_store/` exists and isn't empty, check
   backend logs for a swallowed exception from the `try/except` around the
   retrieval/index calls (they log via `logger.exception`, so they won't be
   silent — just non-fatal).

## Alternative you might prefer later: pgvector instead of Chroma
Since you're already running Postgres, `pgvector` (a Postgres extension)
would let you store embeddings in the same database as everything else —
one less moving part, one backup story, and you could join insight
similarity directly against your relational tables in SQL. I did not build
this because it requires the `pgvector` extension to be present in your
Postgres image/install (not automatic) and a schema migration, whereas
Chroma works with zero database changes. If you want this swapped in
instead, say so and I'll rewrite `rag/store.py` against `pgvector` — the
`index_insight()` / `retrieve_similar_insights()` function signatures in
`indexer.py`/`retriever.py` would stay the same, so nothing else in the
codebase would need to change.

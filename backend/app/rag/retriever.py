"""Retrieves past insights whose source dataset had a similar schema shape.

Similarity is computed on a synthetic "schema text" (column names + dtypes)
embedded with a local sentence-transformer — this approximates "datasets
shaped like this one" without needing a dedicated schema-embedding model.
It is intentionally simple; see RAG_IMPLEMENTATION.md for the exact
rationale and how to swap in a stronger schema-similarity signal later
(e.g. embedding column names only, or a learned schema encoder).
"""
import asyncio

from app.rag.store import get_collection


def _schema_text(schema_summary: list[dict]) -> str:
    # Keys written by profiling.py: column_name, data_type
    return ", ".join(f"{c['column_name']} ({c['data_type']})" for c in schema_summary)


def _retrieve_sync(schema_summary: list[dict], k: int, exclude_dataset_id: str | None) -> list[dict]:
    collection = get_collection()
    if collection.count() == 0:
        return []

    query_text = f"Schema: {_schema_text(schema_summary)}"
    # over-fetch slightly so we can filter out the same dataset client-side
    # (Chroma's `where` filtering works too, but keeping this simple/portable)
    n_results = min(k + 5, collection.count())
    result = collection.query(query_texts=[query_text], n_results=n_results)

    hits = []
    metadatas = result.get("metadatas", [[]])[0]
    for meta in metadatas:
        if exclude_dataset_id and meta.get("dataset_id") == exclude_dataset_id:
            continue
        hits.append(
            {
                "question_text": meta.get("question_text"),
                "summary_text": meta.get("summary_text"),
                "category": meta.get("category"),
            }
        )
        if len(hits) >= k:
            break
    return hits


async def retrieve_similar_insights(
    schema_summary: list[dict], k: int = 5, exclude_dataset_id: str | None = None
) -> list[dict]:
    return await asyncio.to_thread(_retrieve_sync, schema_summary, k, exclude_dataset_id)

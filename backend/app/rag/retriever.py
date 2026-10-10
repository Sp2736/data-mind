"""Retrieves past insights whose source dataset had a similar schema shape.

Similarity is computed on a synthetic "schema text" (column names + dtypes)
embedded with a local sentence-transformer — this approximates "datasets
shaped like this one" without needing a dedicated schema-embedding model.

T06 additions:
- ``exclude_dataset_id``: prevents retrieving the same dataset's own insights
  (was already in the code; documented here for clarity).
- ``min_similarity``: optional cosine-similarity floor (1 - chroma_distance).
  Defaults to None (no filtering), preserving existing behaviour.
- Each hit now includes a ``similarity`` field for logging/experimentation.
"""
import asyncio

from app.rag.store import get_collection


def _schema_text(schema_summary: list[dict]) -> str:
    # Keys written by profiling.py: column_name, data_type
    return ", ".join(
        f"{c.get('column_name', c.get('column', ''))} ({c.get('data_type', c.get('dtype', ''))})"
        for c in schema_summary
    )


def _retrieve_sync(
    schema_summary: list[dict],
    k: int,
    exclude_dataset_id: str | None,
    min_similarity: float | None,
) -> list[dict]:
    collection = get_collection()
    if collection.count() == 0:
        return []

    query_text = f"Schema: {_schema_text(schema_summary)}"
    # Over-fetch slightly so we can filter out the same dataset and apply
    # min_similarity client-side (Chroma's where filtering works too, but this
    # keeps the code portable and avoids metadata-filter edge cases).
    n_results = min(k + 10, collection.count())
    result = collection.query(
        query_texts=[query_text],
        n_results=n_results,
        include=["metadatas", "distances"],
    )

    hits = []
    metadatas = result.get("metadatas", [[]])[0]
    distances = result.get("distances", [[]])[0]

    for meta, dist in zip(metadatas, distances):
        if exclude_dataset_id and meta.get("dataset_id") == exclude_dataset_id:
            continue
        # Chroma returns cosine distance (0 = identical, 2 = opposite).
        # Convert to similarity: similarity = 1 - distance (for cosine).
        similarity = max(0.0, 1.0 - float(dist))
        if min_similarity is not None and similarity < min_similarity:
            continue
        hits.append(
            {
                "question_text": meta.get("question_text"),
                "summary_text": meta.get("summary_text"),
                "category": meta.get("category"),
                "similarity": round(similarity, 4),
            }
        )
        if len(hits) >= k:
            break
    return hits


async def retrieve_similar_insights(
    schema_summary: list[dict],
    k: int = 5,
    exclude_dataset_id: str | None = None,
    min_similarity: float | None = None,
) -> list[dict]:
    """Return up to ``k`` similar past insights, excluding the same dataset.

    ``min_similarity`` (0–1) filters out low-quality matches.  Default ``None``
    keeps existing behaviour (no filter).  Each returned dict includes a
    ``similarity`` field.
    """
    return await asyncio.to_thread(
        _retrieve_sync, schema_summary, k, exclude_dataset_id, min_similarity
    )

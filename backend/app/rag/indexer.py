"""Writes completed insights into the local RAG store.

Called from api/runs.py right after an AnalysisRun succeeds and its Insight
row is committed. Best-effort: a failure here must never fail the run
itself (see the try/except around the call site).

Skips system_profile insights — they describe the dataset itself, not a
transferable analytical finding, so indexing them would pollute retrieval.
"""
import asyncio
from datetime import datetime, timezone

from app.rag.store import get_collection
from app.agents.vocab import SYSTEM_CATEGORY


def _schema_text(schema_summary: list[dict]) -> str:
    # Keys written by profiling.py: column_name, data_type
    return ", ".join(
        f"{c.get('column_name', c.get('column', ''))} ({c.get('data_type', c.get('dtype', ''))})"
        for c in schema_summary
    )


def _index_insight_sync(
    insight_id: str,
    dataset_id: str,
    question_text: str,
    category: str,
    summary_text: str,
    schema_summary: list[dict],
    model: str = "",
) -> None:
    if category == SYSTEM_CATEGORY:
        # Skip system_profile insights — not transferable analytical findings (T06).
        return

    collection = get_collection()
    document = f"Schema: {_schema_text(schema_summary)}\nQuestion: {question_text}\nFinding: {summary_text}"
    collection.upsert(
        ids=[insight_id],
        documents=[document],
        metadatas=[
            {
                "dataset_id": dataset_id,
                "category": category,
                "question_text": question_text,
                "summary_text": summary_text,
                "model": model,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ],
    )


async def index_insight(
    insight_id: str,
    dataset_id: str,
    question_text: str,
    category: str,
    summary_text: str,
    schema_summary: list[dict],
    model: str = "",
) -> None:
    """Index a succeeded insight into the RAG store (async wrapper).

    Skips ``system_profile`` category defensively.
    chromadb's client is sync; run it off the event loop thread so a slow
    local embedding pass doesn't block other requests.
    """
    await asyncio.to_thread(
        _index_insight_sync,
        insight_id,
        dataset_id,
        question_text,
        category,
        summary_text,
        schema_summary,
        model,
    )

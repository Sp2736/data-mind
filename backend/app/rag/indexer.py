"""Writes completed insights into the local RAG store.

Called from api/runs.py right after an AnalysisRun succeeds and its Insight
row is committed. Best-effort: a failure here must never fail the run
itself (see the try/except around the call site).
"""
import asyncio

from app.rag.store import get_collection


def _schema_text(schema_summary: list[dict]) -> str:
    return ", ".join(f"{c['column']} ({c['dtype']})" for c in schema_summary)


def _index_insight_sync(
    insight_id: str,
    dataset_id: str,
    question_text: str,
    category: str,
    summary_text: str,
    schema_summary: list[dict],
) -> None:
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
) -> None:
    # chromadb's client is sync; run it off the event loop thread so a slow
    # local embedding pass doesn't block other requests.
    await asyncio.to_thread(
        _index_insight_sync,
        insight_id,
        dataset_id,
        question_text,
        category,
        summary_text,
        schema_summary,
    )

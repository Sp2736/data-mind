"""Local, Docker-free vector store for the RAG layer.

Uses Chroma's local persistent client (data written to a folder on disk —
no server process, no Docker) and a local sentence-transformers embedding
model, so indexing/retrieval costs zero API tokens/credits. This matters
given the project's API-budget constraints: RAG runs on every question-
generation and insight-writing call, so it must not consume paid tokens.
"""
from __future__ import annotations

import functools

import chromadb
from chromadb.utils import embedding_functions

from app.config import settings

_COLLECTION_NAME = "datamind_insights"


@functools.lru_cache(maxsize=1)
def _get_client() -> chromadb.ClientAPI:
    return chromadb.PersistentClient(path=settings.rag_persist_dir)


@functools.lru_cache(maxsize=1)
def _get_embedding_fn():
    # all-MiniLM-L6-v2: ~80MB, CPU-friendly, no API key, no network at
    # query time (downloaded once on first run and cached locally).
    return embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=settings.rag_embedding_model
    )


@functools.lru_cache(maxsize=1)
def _get_collection():
    client = _get_client()
    return client.get_or_create_collection(
        name=_COLLECTION_NAME,
        embedding_function=_get_embedding_fn(),
        metadata={"hnsw:space": "cosine"},
    )


def get_collection():
    """Public accessor — kept as a function (not a module-level constant) so
    tests can monkeypatch settings.rag_persist_dir before first use."""
    return _get_collection()

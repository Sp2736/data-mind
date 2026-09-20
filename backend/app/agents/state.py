"""LangGraph state for a single analysis run (one research question).

One graph execution = one AnalysisRun = one ResearchQuestion answered.
The question_generator node is NOT part of this graph — it runs once per
dataset (not per run) and is invoked directly from the API layer. See
graph.py for why.
"""
from __future__ import annotations

from typing import Any, TypedDict


class CodeAttempt(TypedDict):
    attempt_number: int
    code_text: str
    file_path: str


class ExecutionResult(TypedDict):
    attempt_number: int
    exit_code: int | None
    stdout: str
    stderr: str
    duration_ms: int
    succeeded: bool
    output_files: list[str]


class AnalysisState(TypedDict, total=False):
    # --- identifiers ---
    dataset_id: str
    run_id: str
    rq_id: str

    # --- research question context (loaded once at graph entry) ---
    question_text: str
    category: str
    target_columns: list[str]
    expected_output_type: str
    rationale: str

    # --- dataset context (metadata only — never raw rows beyond the sample) ---
    dataset_format: str
    raw_path: str
    schema_summary: list[dict]
    stats_summary: list[dict]
    correlation_summary: list[dict]
    sample_rows: list[dict]

    # --- RAG context (optional; populated by rag/retriever if enabled) ---
    similar_past_insights: list[dict]

    # --- iteration state ---
    max_attempts: int
    attempts: int
    code_history: list[CodeAttempt]
    execution_history: list[ExecutionResult]

    # --- outcome ---
    status: str  # "running" | "succeeded" | "failed"
    final_code_id: str | None
    final_execution: ExecutionResult | None
    final_insight: dict[str, Any] | None
    final_visualization: dict[str, Any] | None
    error_traceback: str | None

    # --- metrics accumulated across every LLM call in this run ---
    llm_call_count: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

    # --- per-node LLM usage breakdown (§4.3.4) ---
    # Keys: "question_generator" | "code_generator" | "code_corrector" | "insight_writer"
    node_llm_calls: dict          # {node_name: call_count}
    node_prompt_tokens: dict      # {node_name: prompt_token_count}
    node_completion_tokens: dict  # {node_name: completion_token_count}
    node_total_tokens: dict       # {node_name: total_token_count}

    # --- rate-limit resilience (§4.3.4) ---
    # Counts how many tenacity retries were triggered by 429 / rate-limit errors
    # across all LLM calls in this run.
    rate_limit_retry_count: int

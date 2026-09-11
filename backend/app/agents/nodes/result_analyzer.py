"""Deterministic pre-processing between a successful sandbox run and the
insight_writer LLM call. No LLM call here — this node exists so that
truncation/sanitization logic has one clear home and isn't duplicated
between insight_writer and visualization_builder.
"""
from app.agents.state import AnalysisState

_MAX_STDOUT_CHARS = 4000


async def result_analyzer(state: AnalysisState) -> AnalysisState:
    execution = state["final_execution"] or state["execution_history"][-1]
    stdout = execution["stdout"]
    if len(stdout) > _MAX_STDOUT_CHARS:
        stdout = stdout[:_MAX_STDOUT_CHARS] + "\n... [truncated]"

    return {
        **state,
        "final_execution": {**execution, "stdout": stdout},
    }

from pathlib import Path

from app.agents.state import AnalysisState, ExecutionResult
from app.services.sandbox import run_in_sandbox


async def sandbox_execute(state: AnalysisState) -> AnalysisState:
    latest_code = state["code_history"][-1]
    result = run_in_sandbox(
        code_text=latest_code["code_text"],
        dataset_path=Path(state["raw_path"]),
        run_id=state["run_id"],
        attempt=latest_code["attempt_number"],
    )

    execution = ExecutionResult(
        attempt_number=latest_code["attempt_number"],
        exit_code=result["exit_code"],
        stdout=result["stdout"],
        stderr=result["stderr"],
        duration_ms=result["duration_ms"],
        succeeded=result["succeeded"],
        output_files=result["output_files"],
    )

    execution_history = list(state.get("execution_history", []))
    execution_history.append(execution)

    return {
        **state,
        "execution_history": execution_history,
        "status": "succeeded" if result["succeeded"] else "running",
        "final_execution": execution if result["succeeded"] else state.get("final_execution"),
    }


def route_after_execution(state: AnalysisState) -> str:
    """Conditional edge: succeeded -> result_analyzer, else retry or give up."""
    last = state["execution_history"][-1]
    if last["succeeded"]:
        return "result_analyzer"
    if state["attempts"] >= state.get("max_attempts", 3):
        return "give_up"
    return "code_corrector"

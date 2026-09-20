import logging
from pathlib import Path

from app.agents.schemas import VisualizationSpec
from app.agents.state import AnalysisState
from app.services.llm import get_llm, with_llm_retry
from app.config import settings

logger = logging.getLogger(__name__)


async def visualization_builder(state: AnalysisState) -> AnalysisState:
    execution = state.get("final_execution", {})
    stdout = execution.get("stdout", "")

    # For system_profile, we might not have a successful execution if we just want to build it from stats.
    # But usually system_profile still runs a dummy script to pass through the pipeline.
    
    llm = get_llm(settings.insight_writer_model).with_structured_output(
        VisualizationSpec, include_raw=True
    )

    user_payload = {
        "question_text": state["question_text"],
        "category": state["category"],
        "stdout": stdout,
        "dataset_stats_summary": state["stats_summary"],
    }
    
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert data visualization designer. Based on the research question, the dataset statistics, "
                "and the printed analysis output, design up to 3 interactive charts that best summarize the findings.\n"
                "You must provide the ACTUAL DATA POINTS to plot. Extract these from the dataset statistics or stdout.\n"
                "For system_profile, focus on the overall distribution of key numeric columns, class balances, or missing values.\n"
                "For example, a bar chart data might look like: [{'category': 'A', 'count': 10}, {'category': 'B', 'count': 20}]."
            ),
        },
        {"role": "user", "content": str(user_payload)},
    ]

    @with_llm_retry
    async def _invoke():
        return await llm.ainvoke(messages)

    result = await _invoke()
    parsed: VisualizationSpec | None = result.get("parsed")
    usage = getattr(result.get("raw"), "usage_metadata", None) or {}

    # Attempt to find a PNG file from the sandbox execution output_files
    chart_file_path = None
    output_files = execution.get("output_files") or []
    for file_path in output_files:
        if str(file_path).endswith(".png"):
            chart_file_path = str(file_path)
            break

    visualization = None
    if parsed is not None:
        visualization = {
            "chart_type": "interactive",
            "chart_config": parsed.model_dump(),
            "chart_file_path": chart_file_path,
        }
    else:
        logger.warning("visualization_builder: structured parse failed")
        visualization = {
            "chart_type": "none",
            "chart_config": {"charts": []},
            "chart_file_path": None,
        }

    return {
        **state,
        "final_visualization": visualization,
        "llm_call_count": state.get("llm_call_count", 0) + (1 if parsed else 0),
        "prompt_tokens": state.get("prompt_tokens", 0) + usage.get("input_tokens", 0),
        "completion_tokens": state.get("completion_tokens", 0) + usage.get("output_tokens", 0),
        "total_tokens": state.get("total_tokens", 0) + usage.get("total_tokens", 0),
    }


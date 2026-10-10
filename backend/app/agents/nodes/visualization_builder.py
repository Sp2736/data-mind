import logging
import time
from pathlib import Path

from app.agents.schemas import VisualizationSpec
from app.agents.state import AnalysisState
from app.services.llm import get_llm, with_llm_retry
from app.services.usage import extract_usage, apply_usage
from app.config import settings

logger = logging.getLogger(__name__)

_NODE = "visualization_builder"


async def visualization_builder(state: AnalysisState) -> AnalysisState:
    execution = state.get("final_execution", {})
    stdout = execution.get("stdout", "")

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

    t0 = time.monotonic()

    @with_llm_retry
    async def _invoke():
        return await llm.ainvoke(messages)

    result = await _invoke()
    latency_ms = int((time.monotonic() - t0) * 1000)

    parsed: VisualizationSpec | None = result.get("parsed")
    raw = result.get("raw")
    usage = extract_usage(raw)

    # Attempt to find a PNG file from the sandbox execution output_files
    chart_file_path = None
    output_files = execution.get("output_files") or []
    for file_path in output_files:
        if str(file_path).endswith(".png"):
            chart_file_path = str(file_path)
            break

    if parsed is not None:
        visualization = {
            "chart_type": "interactive",
            "chart_config": parsed.model_dump(),
            "chart_file_path": chart_file_path,
        }
        llm_calls = 1
    else:
        logger.warning("visualization_builder: structured parse failed")
        visualization = {
            "chart_type": "none",
            "chart_config": {"charts": []},
            "chart_file_path": None,
        }
        llm_calls = 0

    usage_update = apply_usage(state, _NODE, usage, latency_ms=latency_ms, calls=llm_calls)

    return {
        **state,
        "final_visualization": visualization,
        **usage_update,
    }

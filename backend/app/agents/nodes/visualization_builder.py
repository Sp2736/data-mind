"""Decides chart metadata (type/title/labels) for the run.

The actual PNG is rendered by the sandboxed script itself (per the
code_generator prompt's contract: `./output/chart.png`). This node just
asks the LLM for a short, structured description of that chart for the
`visualizations` table and the frontend — and skips the LLM call entirely
if no chart was produced.
"""
import logging
from pathlib import Path

from app.agents.schemas import VisualizationSpec
from app.agents.state import AnalysisState
from app.services.llm import get_llm
from app.config import settings

logger = logging.getLogger(__name__)


async def visualization_builder(state: AnalysisState) -> AnalysisState:
    execution = state["final_execution"]
    chart_files = [f for f in execution["output_files"] if f.endswith((".png", ".jpg", ".jpeg"))]

    if not chart_files:
        return {**state, "final_visualization": None}

    llm = get_llm(settings.insight_writer_model).with_structured_output(
        VisualizationSpec, include_raw=True
    )

    user_payload = {
        "question_text": state["question_text"],
        "category": state["category"],
        "stdout": execution["stdout"],
    }
    messages = [
        {
            "role": "system",
            "content": (
                "Given a research question and the printed output of the analysis that "
                "produced an accompanying chart, describe that chart: type, title, axis "
                "labels, and why that chart type fits."
            ),
        },
        {"role": "user", "content": str(user_payload)},
    ]

    result = await llm.ainvoke(messages)
    parsed: VisualizationSpec | None = result["parsed"]
    usage = getattr(result["raw"], "usage_metadata", None) or {}

    visualization = None
    if parsed is not None:
        visualization = {
            "chart_type": parsed.chart_type,
            "chart_config": {
                "title": parsed.title,
                "x_label": parsed.x_label,
                "y_label": parsed.y_label,
                "rationale": parsed.rationale,
            },
            "chart_file_path": chart_files[0],
        }
    else:
        logger.warning("visualization_builder: structured parse failed, keeping raw file only")
        visualization = {
            "chart_type": "unknown",
            "chart_config": {},
            "chart_file_path": chart_files[0],
        }

    return {
        **state,
        "final_visualization": visualization,
        "llm_call_count": state.get("llm_call_count", 0) + (1 if parsed else 0),
        "prompt_tokens": state.get("prompt_tokens", 0) + usage.get("input_tokens", 0),
        "completion_tokens": state.get("completion_tokens", 0) + usage.get("output_tokens", 0),
        "total_tokens": state.get("total_tokens", 0) + usage.get("total_tokens", 0),
    }

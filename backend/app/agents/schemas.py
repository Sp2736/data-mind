"""Structured-output contracts for every LLM node.

Every node MUST call `llm.with_structured_output(SomeModel)` — never parse
raw text/JSON by hand. This is a hard guardrail from the project plan (§9).
"""
from pydantic import BaseModel, Field


class ResearchQuestionItem(BaseModel):
    category: str = Field(description="e.g. 'trend', 'correlation', 'anomaly', 'segmentation'")
    question_text: str
    target_columns: list[str]
    rationale: str
    expected_output_type: str = Field(description="'statistic' | 'chart' | 'table' | 'model_summary'")


class ResearchQuestionBatch(BaseModel):
    questions: list[ResearchQuestionItem] = Field(
        description="5 to 10 diverse, non-redundant research questions grounded only in "
        "columns present in the provided schema."
    )


class GeneratedCodeOutput(BaseModel):
    code: str = Field(description="A single self-contained Python script. No markdown fences.")
    approach_summary: str = Field(description="One sentence describing the approach, for logging.")


class CodeCorrectionOutput(BaseModel):
    code: str = Field(description="The corrected, complete Python script.")
    diagnosis: str = Field(description="One sentence: what was wrong with the previous attempt.")


class InsightOutput(BaseModel):
    summary_text: str = Field(description="2-4 sentence plain-language summary of the finding.")
    key_takeaways: list[str] = Field(description="2-5 short bullet-point takeaways.")
    confidence: str = Field(description="'high' | 'medium' | 'low', based on sample size / data quality caveats.")


class VisualizationSpec(BaseModel):
    chart_type: str = Field(description="'bar' | 'line' | 'scatter' | 'histogram' | 'heatmap' | 'box' | 'none'")
    title: str
    x_label: str | None = None
    y_label: str | None = None
    rationale: str = Field(description="Why this chart type fits the finding.")

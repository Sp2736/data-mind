"""Structured-output contracts for every LLM node.

Every node MUST call `llm.with_structured_output(SomeModel)` — never parse
raw text/JSON by hand. This is a hard guardrail from the project plan (§9).
"""
from pydantic import BaseModel, Field, field_validator

from app.agents.vocab import normalize_category, normalize_output_type


class ResearchQuestionItem(BaseModel):
    category: str = Field(
        description=(
            "Exactly one of: 'data_cleaning' | 'distribution' | 'correlation' | "
            "'trend' | 'anomaly' | 'segmentation'. "
            "Use 'data_cleaning' whenever the dataset has missing values or outliers "
            "that should be addressed before analysis."
        )
    )
    question_text: str
    target_columns: list[str]
    rationale: str
    expected_output_type: str = Field(description="'statistic' | 'chart' | 'table' | 'model_summary'")

    @field_validator("category", mode="before")
    @classmethod
    def _norm_category(cls, v: str) -> str:
        # Never raise — an exception here fails the whole structured-output batch.
        return normalize_category(v) if isinstance(v, str) else v

    @field_validator("expected_output_type", mode="before")
    @classmethod
    def _norm_output_type(cls, v: str) -> str:
        return normalize_output_type(v) if isinstance(v, str) else v



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


class InteractiveChart(BaseModel):
    chart_type: str = Field(description="'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'histogram'")
    title: str
    description: str = Field(description="Brief description of what this chart shows")
    x_axis_key: str = Field(description="The key in the data objects to use for the X axis")
    y_axis_keys: list[str] = Field(description="The keys in the data objects to use for the Y axis series")
    data: list[dict] = Field(description="The actual data points to plot, e.g. [{'name': 'A', 'value': 10}, ...]")

class VisualizationSpec(BaseModel):
    charts: list[InteractiveChart] = Field(default=[], description="Up to 3 interactive charts with data points")
    rationale: str = Field(description="Why these charts were chosen")

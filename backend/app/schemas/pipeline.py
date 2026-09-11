from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ResearchQuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    dataset_id: str
    category: str
    question_text: str
    target_columns: list[str]
    rationale: str
    expected_output_type: str
    status: str
    sort_order: int
    created_at: datetime


class GenerateQuestionsRequest(BaseModel):
    use_rag: bool = True


class TriggerRunsRequest(BaseModel):
    rq_ids: list[str]


class AnalysisRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    dataset_id: str
    rq_id: str
    status: str
    attempts: int
    max_attempts: int
    error_traceback: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime


class InsightOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    run_id: str
    rq_id: str
    category: str
    summary_text: str
    key_takeaways: list[str]
    created_at: datetime


class VisualizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    insight_id: str
    chart_type: str
    chart_config: dict
    chart_file_path: str | None
    created_at: datetime


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    dataset_id: str
    overall_summary: str
    cleaning_actions: list
    created_at: datetime


class RunMetricsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    run_id: str
    llm_model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    llm_call_count: int
    correction_attempts: int
    total_duration_ms: int | None
    created_at: datetime

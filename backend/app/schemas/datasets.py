from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SubmitDatasetUrlRequest(BaseModel):
    url: str  # kaggle.com dataset/competition URL, "owner/slug" kaggle ref, or a GitHub file URL


class DatasetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    format: str
    row_count: int
    column_count: int
    file_size_bytes: int
    status: str
    description: str | None = None
    primary_domain: str | None = None
    source_url: str | None = None
    uploaded_at: datetime


class DatasetProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    dataset_id: str
    system_run_id: str | None = None
    schema_summary: list
    stats_summary: list
    correlation_summary: list
    sample_rows: list
    created_at: datetime


from app.schemas.pipeline import InsightOut, VisualizationOut

class SystemProfileDashboardOut(BaseModel):
    run_status: str | None = None
    insight: InsightOut | None = None
    visualization: VisualizationOut | None = None

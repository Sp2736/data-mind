from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
    uploaded_at: datetime


class DatasetProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    dataset_id: str
    schema_summary: list
    stats_summary: list
    correlation_summary: list
    sample_rows: list
    created_at: datetime
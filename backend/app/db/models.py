import uuid
from datetime import datetime
from sqlalchemy import String, Integer, BigInteger, Boolean, Text, ForeignKey, ARRAY, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def short_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


class LocalUser(Base):
    __tablename__ = "local_user"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Dataset(Base):
    __tablename__ = "datasets"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: short_id("ds"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("local_user.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String, nullable=False)
    format: Mapped[str] = mapped_column(String, nullable=False)
    raw_path: Mapped[str] = mapped_column(String, nullable=False)
    processed_path: Mapped[str | None] = mapped_column(String, nullable=True)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    column_count: Mapped[int] = mapped_column(Integer, default=0)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[str] = mapped_column(String, default="processing")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    primary_domain: Mapped[str | None] = mapped_column(String, nullable=True)


class DatasetProfile(Base):
    __tablename__ = "dataset_profiles"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: short_id("dp"))
    dataset_id: Mapped[str] = mapped_column(String, ForeignKey("datasets.id", ondelete="CASCADE"), unique=True)
    schema_summary: Mapped[list] = mapped_column(JSONB, default=list)
    stats_summary: Mapped[list] = mapped_column(JSONB, default=list)
    correlation_summary: Mapped[list] = mapped_column(JSONB, default=list)
    sample_rows: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ResearchQuestion(Base):
    __tablename__ = "research_questions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: short_id("rq"))
    dataset_id: Mapped[str] = mapped_column(String, ForeignKey("datasets.id", ondelete="CASCADE"))
    category: Mapped[str] = mapped_column(String, nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    target_columns: Mapped[list] = mapped_column(ARRAY(String), default=list)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    expected_output_type: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="pending")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: short_id("run"))
    dataset_id: Mapped[str] = mapped_column(String, ForeignKey("datasets.id", ondelete="CASCADE"))
    rq_id: Mapped[str] = mapped_column(String, ForeignKey("research_questions.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String, default="queued")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    error_traceback: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class GeneratedCode(Base):
    __tablename__ = "generated_code"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: short_id("gc"))
    run_id: Mapped[str] = mapped_column(String, ForeignKey("analysis_runs.id", ondelete="CASCADE"))
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    code_text: Mapped[str] = mapped_column(Text, nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ExecutionAttempt(Base):
    __tablename__ = "execution_attempts"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: short_id("ea"))
    generated_code_id: Mapped[str] = mapped_column(String, ForeignKey("generated_code.id", ondelete="CASCADE"))
    exit_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stdout: Mapped[str | None] = mapped_column(Text, nullable=True)
    stderr: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    succeeded: Mapped[bool] = mapped_column(Boolean, default=False)
    output_files: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Insight(Base):
    __tablename__ = "insights"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: short_id("ins"))
    run_id: Mapped[str] = mapped_column(String, ForeignKey("analysis_runs.id", ondelete="CASCADE"))
    rq_id: Mapped[str] = mapped_column(String, ForeignKey("research_questions.id", ondelete="CASCADE"), unique=True)
    category: Mapped[str] = mapped_column(String, nullable=False)
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    key_takeaways: Mapped[list] = mapped_column(ARRAY(String), default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Visualization(Base):
    __tablename__ = "visualizations"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: short_id("vis"))
    insight_id: Mapped[str] = mapped_column(String, ForeignKey("insights.id", ondelete="CASCADE"), unique=True)
    chart_type: Mapped[str] = mapped_column(String, nullable=False)
    chart_config: Mapped[dict] = mapped_column(JSONB, default=dict)
    chart_file_path: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: short_id("rep"))
    dataset_id: Mapped[str] = mapped_column(String, ForeignKey("datasets.id", ondelete="CASCADE"), unique=True)
    overall_summary: Mapped[str] = mapped_column(Text, nullable=False)
    cleaning_actions: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RunMetrics(Base):
    __tablename__ = "run_metrics"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: short_id("rm"))
    run_id: Mapped[str] = mapped_column(String, ForeignKey("analysis_runs.id", ondelete="CASCADE"))
    llm_model: Mapped[str] = mapped_column(String, nullable=False)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    llm_call_count: Mapped[int] = mapped_column(Integer, default=0)
    correction_attempts: Mapped[int] = mapped_column(Integer, default=0)
    total_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
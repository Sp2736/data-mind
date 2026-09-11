import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db, AsyncSessionLocal
from app.db.models import (
    AnalysisRun,
    Dataset,
    DatasetProfile,
    GeneratedCode,
    ExecutionAttempt,
    Insight,
    Visualization,
    LocalUser,
    ResearchQuestion,
    RunMetrics,
)
from app.deps import get_current_user
from app.schemas.pipeline import TriggerRunsRequest, AnalysisRunOut
from app.agents.graph import run_analysis
from app.agents.state import AnalysisState
from app.services import job_bus
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/datasets", tags=["runs"])


@router.post("/{dataset_id}/runs", response_model=list[AnalysisRunOut], status_code=status.HTTP_201_CREATED)
async def trigger_runs(
    dataset_id: str,
    body: TriggerRunsRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    ds_result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user.id)
    )
    dataset = ds_result.scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    rq_result = await db.execute(
        select(ResearchQuestion).where(
            ResearchQuestion.id.in_(body.rq_ids), ResearchQuestion.dataset_id == dataset_id
        )
    )
    rqs = rq_result.scalars().all()
    if len(rqs) != len(body.rq_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more research questions not found")

    runs = []
    for rq in rqs:
        run = AnalysisRun(dataset_id=dataset_id, rq_id=rq.id, status="queued")
        db.add(run)
        runs.append(run)

    await db.commit()
    for run in runs:
        await db.refresh(run)

    for run in runs:
        background_tasks.add_task(_execute_run, run.id)

    return runs


@router.get("/{dataset_id}/runs", response_model=list[AnalysisRunOut])
async def list_runs(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    result = await db.execute(select(AnalysisRun).where(AnalysisRun.dataset_id == dataset_id))
    return result.scalars().all()


async def _execute_run(run_id: str) -> None:
    """Background task: builds initial state, drives the LangGraph pipeline,
    and persists every table the pipeline touches. Uses its own DB session.
    """
    async with AsyncSessionLocal() as db:
        run_result = await db.execute(select(AnalysisRun).where(AnalysisRun.id == run_id))
        run = run_result.scalar_one_or_none()
        if run is None:
            logger.warning("Run %s disappeared before execution", run_id)
            return

        rq_result = await db.execute(select(ResearchQuestion).where(ResearchQuestion.id == run.rq_id))
        rq = rq_result.scalar_one()

        dataset_result = await db.execute(select(Dataset).where(Dataset.id == run.dataset_id))
        dataset = dataset_result.scalar_one()

        profile_result = await db.execute(
            select(DatasetProfile).where(DatasetProfile.dataset_id == run.dataset_id)
        )
        profile = profile_result.scalar_one()

        similar_past_insights = []
        try:
            from app.rag.retriever import retrieve_similar_insights

            similar_past_insights = await retrieve_similar_insights(
                schema_summary=profile.schema_summary, k=5
            )
        except Exception:
            logger.exception("RAG retrieval failed for run %s, continuing without it", run_id)

        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        await db.commit()
        await job_bus.publish(dataset.id, {"type": "run_update", "run_id": run_id, "status": "running"})

        initial_state: AnalysisState = {
            "dataset_id": dataset.id,
            "run_id": run_id,
            "rq_id": rq.id,
            "question_text": rq.question_text,
            "category": rq.category,
            "target_columns": rq.target_columns,
            "expected_output_type": rq.expected_output_type,
            "rationale": rq.rationale,
            "dataset_format": dataset.format,
            "raw_path": dataset.raw_path,
            "schema_summary": profile.schema_summary,
            "stats_summary": profile.stats_summary,
            "correlation_summary": profile.correlation_summary,
            "sample_rows": profile.sample_rows,
            "similar_past_insights": similar_past_insights,
            "max_attempts": run.max_attempts,
            "attempts": 0,
            "code_history": [],
            "execution_history": [],
            "status": "running",
            "llm_call_count": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        }

        started = time.monotonic()
        try:
            final_state = await run_analysis(initial_state)
        except Exception as exc:
            logger.exception("Run %s crashed", run_id)
            run.status = "failed"
            run.error_traceback = str(exc)
            run.finished_at = datetime.now(timezone.utc)
            await db.commit()
            await job_bus.publish(dataset.id, {"type": "run_update", "run_id": run_id, "status": "failed"})
            return
        total_duration_ms = int((time.monotonic() - started) * 1000)

        # Persist every code attempt + execution attempt.
        code_row_by_attempt: dict[int, GeneratedCode] = {}
        for code_attempt in final_state["code_history"]:
            gc = GeneratedCode(
                run_id=run_id,
                attempt_number=code_attempt["attempt_number"],
                code_text=code_attempt["code_text"],
                file_path=code_attempt.get("file_path") or "",
            )
            db.add(gc)
            await db.flush()
            code_row_by_attempt[code_attempt["attempt_number"]] = gc

        for execution in final_state["execution_history"]:
            gc = code_row_by_attempt.get(execution["attempt_number"])
            if gc is None:
                continue
            db.add(
                ExecutionAttempt(
                    generated_code_id=gc.id,
                    exit_code=execution["exit_code"],
                    stdout=execution["stdout"],
                    stderr=execution["stderr"],
                    duration_ms=execution["duration_ms"],
                    succeeded=execution["succeeded"],
                    output_files=execution["output_files"],
                )
            )

        run.attempts = final_state["attempts"]
        run.status = final_state["status"]
        run.finished_at = datetime.now(timezone.utc)
        if final_state["status"] == "failed":
            run.error_traceback = final_state.get("error_traceback")

        insight_row = None
        if final_state.get("final_insight"):
            insight_row = Insight(
                run_id=run_id,
                rq_id=rq.id,
                category=final_state["final_insight"]["category"],
                summary_text=final_state["final_insight"]["summary_text"],
                key_takeaways=final_state["final_insight"]["key_takeaways"],
            )
            db.add(insight_row)
            await db.flush()

            if final_state.get("final_visualization"):
                viz = final_state["final_visualization"]
                db.add(
                    Visualization(
                        insight_id=insight_row.id,
                        chart_type=viz["chart_type"],
                        chart_config=viz["chart_config"],
                        chart_file_path=viz.get("chart_file_path"),
                    )
                )

        db.add(
            RunMetrics(
                run_id=run_id,
                llm_model=settings.code_generator_model,
                prompt_tokens=final_state["prompt_tokens"],
                completion_tokens=final_state["completion_tokens"],
                total_tokens=final_state["total_tokens"],
                llm_call_count=final_state["llm_call_count"],
                correction_attempts=max(final_state["attempts"] - 1, 0),
                total_duration_ms=total_duration_ms,
            )
        )

        rq.status = "answered" if final_state["status"] == "succeeded" else "failed"

        await db.commit()

        # Feed the new insight into the RAG index for future runs (best-effort).
        if insight_row is not None:
            try:
                from app.rag.indexer import index_insight

                await index_insight(
                    insight_id=insight_row.id,
                    dataset_id=dataset.id,
                    question_text=rq.question_text,
                    category=insight_row.category,
                    summary_text=insight_row.summary_text,
                    schema_summary=profile.schema_summary,
                )
            except Exception:
                logger.exception("Failed to index insight %s into RAG store", insight_row.id)

        await job_bus.publish(
            dataset.id, {"type": "run_update", "run_id": run_id, "status": run.status}
        )

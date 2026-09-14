import logging
import shutil
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db, AsyncSessionLocal
from app.db.models import AnalysisRun, Dataset, DatasetProfile, ExecutionAttempt, GeneratedCode, LocalUser, ResearchQuestion, Insight, Visualization
from app.deps import get_current_user
from app.schemas.datasets import DatasetOut, DatasetProfileOut, SubmitDatasetUrlRequest
from app.services import dataset_fetch, profiling
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/datasets", tags=["datasets"])


async def _run_profiling(dataset_id: str) -> None:
    """Background task: profile a dataset and persist results.

    Uses its own DB session since the request-scoped session from the
    submission endpoint will already be closed by the time this runs.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
        dataset = result.scalar_one_or_none()
        if dataset is None:
            logger.warning("Dataset %s disappeared before profiling could run", dataset_id)
            return

        try:
            profile = profiling.profile_dataset(dataset.raw_path, dataset.format)
        except profiling.ProfilingError as exc:
            logger.exception("Profiling failed for dataset %s", dataset_id)
            dataset.status = "failed"
            dataset.description = f"Profiling failed: {exc}"
            await db.commit()
            return

        dataset.row_count = profile["row_count"]
        dataset.column_count = profile["column_count"]
        dataset.status = "ready"

        existing = await db.execute(
            select(DatasetProfile).where(DatasetProfile.dataset_id == dataset_id)
        )
        dp = existing.scalar_one_or_none()
        if dp is None:
            dp = DatasetProfile(dataset_id=dataset_id)
            db.add(dp)

        dp.schema_summary = profile["schema_summary"]
        dp.stats_summary = profile["stats_summary"]
        dp.correlation_summary = profile["correlation_summary"]
        dp.sample_rows = profile["sample_rows"]

        from app.db.models import ResearchQuestion
        # Generate the system profile research question
        system_rq = ResearchQuestion(
            dataset_id=dataset_id,
            category="system_profile",
            question_text="Generate a comprehensive multi-panel visualization summarizing the dataset's overall distributions, key correlations, and missing values. Print a brief text overview of the most critical statistical findings.",
            rationale="Automated system profile dashboard generation.",
            expected_output_type="chart",
            target_columns=[],
            quality_score=5,
            quality_label="excellent"
        )
        db.add(system_rq)
        await db.flush()

        system_run = AnalysisRun(
            dataset_id=dataset_id,
            rq_id=system_rq.id,
            status="queued"
        )
        db.add(system_run)
        await db.flush()

        dp.system_run_id = system_run.id

        await db.commit()

        # Fire and forget the system run, keeping a strong reference to prevent GC
        import asyncio
        from app.api.runs import _execute_run
        
        task = asyncio.create_task(_execute_run(system_run.id))
        
        # Keep a strong reference globally
        if not hasattr(asyncio, "_datamind_background_tasks"):
            asyncio._datamind_background_tasks = set()
        
        asyncio._datamind_background_tasks.add(task)
        task.add_done_callback(asyncio._datamind_background_tasks.discard)


async def _run_fetch_and_profile(dataset_id: str, url: str) -> None:
    """Background task: download from the submitted URL, then profile.

    Runs entirely in the background so the API responds immediately with
    status='processing' — Kaggle downloads in particular can take a while.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
        dataset = result.scalar_one_or_none()
        if dataset is None:
            logger.warning("Dataset %s disappeared before fetch could run", dataset_id)
            return

        try:
            raw_path, size, fmt, resolved_ref = dataset_fetch.fetch_dataset(url, dataset_id)
        except dataset_fetch.DatasetFetchError as exc:
            logger.exception("Fetch failed for dataset %s (%s)", dataset_id, url)
            dataset.status = "failed"
            dataset.description = f"Download failed: {exc}"
            await db.commit()
            return

        dataset.raw_path = raw_path
        dataset.format = fmt
        dataset.file_size_bytes = size
        dataset.filename = raw_path.rsplit("/", 1)[-1]
        dataset.source_url = resolved_ref
        await db.commit()

    await _run_profiling(dataset_id)


@router.post("", response_model=DatasetOut, status_code=status.HTTP_201_CREATED)
async def submit_dataset_url(
    body: SubmitDatasetUrlRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    """Registers a dataset from a Kaggle or GitHub URL — no file upload.

    Validates the URL shape synchronously (fast, no network call) so a
    malformed URL fails immediately with a 422; the actual download and
    profiling happen in the background.
    """
    try:
        dataset_fetch.classify_url(body.url)
    except dataset_fetch.DatasetFetchError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    dataset = Dataset(
        user_id=user.id,
        filename=body.url.rsplit("/", 1)[-1] or body.url,
        format="",
        raw_path="",
        status="processing",
        source_url=body.url,
    )
    db.add(dataset)
    await db.commit()
    await db.refresh(dataset)

    background_tasks.add_task(_run_fetch_and_profile, dataset.id, body.url)

    return dataset


@router.get("", response_model=list[DatasetOut])
async def list_datasets(
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    result = await db.execute(
        select(Dataset).where(Dataset.user_id == user.id).order_by(Dataset.uploaded_at.desc())
    )
    return result.scalars().all()


@router.get("/{dataset_id}", response_model=DatasetOut)
async def get_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user.id)
    )
    dataset = result.scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return dataset


@router.get("/{dataset_id}/profile", response_model=DatasetProfileOut)
async def get_dataset_profile(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    ds_result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user.id)
    )
    dataset = ds_result.scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    result = await db.execute(select(DatasetProfile).where(DatasetProfile.dataset_id == dataset_id))
    dp = result.scalar_one_or_none()
    if dp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not yet available — dataset may still be processing",
        )
    return dp


from app.db.models import AnalysisRun, Insight, Visualization
from app.schemas.datasets import SystemProfileDashboardOut

@router.get("/{dataset_id}/system-profile", response_model=SystemProfileDashboardOut)
async def get_dataset_system_profile(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    ds_result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user.id)
    )
    dataset = ds_result.scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    # Find the system_profile research question for this dataset
    rq_result = await db.execute(
        select(ResearchQuestion).where(
            ResearchQuestion.dataset_id == dataset_id,
            ResearchQuestion.category == "system_profile"
        )
    )
    rq = rq_result.scalar_one_or_none()
    if rq is None:
        return SystemProfileDashboardOut(run_status=None, insight=None, visualization=None)

    # Get the latest run for this RQ
    run_result = await db.execute(
        select(AnalysisRun).where(AnalysisRun.rq_id == rq.id).order_by(AnalysisRun.created_at.desc())
    )
    run = run_result.scalars().first()
    
    if run is None:
        return SystemProfileDashboardOut(run_status=None, insight=None, visualization=None)

    insight_result = await db.execute(select(Insight).where(Insight.run_id == run.id))
    insight = insight_result.scalar_one_or_none()

    vis = None
    if insight:
        vis_result = await db.execute(select(Visualization).where(Visualization.insight_id == insight.id))
        vis = vis_result.scalar_one_or_none()

    return SystemProfileDashboardOut(
        run_status=run.status,
        insight=insight,
        visualization=vis
    )


def _find_cleaned_csv(dataset_id: str) -> Path | None:
    """Walk the generated_code directory for this dataset and return the most
    recent cleaned_dataset.csv from a successful run's output directory."""
    base = Path(settings.generated_code_dir) / dataset_id
    if not base.exists():
        return None
    candidates = sorted(base.glob("*/output/cleaned_dataset.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


@router.get("/{dataset_id}/cleaned")
async def download_cleaned_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    """Serve the most recent cleaned_dataset.csv produced by the pipeline."""
    ds_result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user.id)
    )
    dataset = ds_result.scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    cleaned = _find_cleaned_csv(dataset_id)
    if cleaned is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No cleaned dataset found — run pre-processing questions first",
        )

    original_name = Path(dataset.raw_path).stem if dataset.raw_path else "dataset"
    return FileResponse(
        path=str(cleaned),
        media_type="text/csv",
        filename=f"{original_name}_cleaned.csv",
    )


@router.get("/{dataset_id}/comparison")
async def get_dataset_comparison(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    """Return before/after cleaning statistics for the dataset.

    Compares the original profiled stats (from DatasetProfile) with the
    most recent cleaned_dataset.csv produced by the pipeline.
    """
    ds_result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user.id)
    )
    dataset = ds_result.scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    profile_result = await db.execute(
        select(DatasetProfile).where(DatasetProfile.dataset_id == dataset_id)
    )
    profile = profile_result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    cleaned = _find_cleaned_csv(dataset_id)
    if cleaned is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No cleaned dataset found — run pre-processing questions first",
        )

    try:
        cleaned_df = pd.read_csv(cleaned)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read cleaned dataset: {exc}",
        )

    original_rows = dataset.row_count
    cleaned_rows = len(cleaned_df)
    original_cols = dataset.column_count

    # Per-column null comparison
    column_comparison = []
    for col_info in profile.schema_summary:
        col = col_info.get("column", "")          # profiler uses 'column'
        original_nulls = col_info.get("null_count", 0)
        if col in cleaned_df.columns:
            cleaned_nulls = int(cleaned_df[col].isna().sum())
            cleaned_null_pct = round(cleaned_nulls / len(cleaned_df) * 100, 2) if len(cleaned_df) > 0 else 0
        else:
            cleaned_nulls = None
            cleaned_null_pct = None

        column_comparison.append({
            "column": col,
            "data_type": col_info.get("dtype", ""),   # profiler uses 'dtype'
            "original_null_count": original_nulls,
            "original_null_pct": col_info.get("null_pct", 0),  # profiler uses 'null_pct'
            "cleaned_null_count": cleaned_nulls,
            "cleaned_null_pct": cleaned_null_pct,
            "improved": cleaned_nulls is not None and cleaned_nulls < original_nulls,
        })

    return {
        "dataset_id": dataset_id,
        "original": {
            "row_count": original_rows,
            "column_count": original_cols,
        },
        "cleaned": {
            "row_count": cleaned_rows,
            "column_count": len(cleaned_df.columns),
        },
        "rows_added": max(cleaned_rows - original_rows, 0),
        "column_comparison": column_comparison,
    }


import shutil

@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    """Delete a dataset and all associated records/files."""
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user.id)
    )
    dataset = result.scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    # Delete physical raw file
    raw_file = Path(settings.datasets_raw_dir) / dataset.filename
    if raw_file.exists():
        raw_file.unlink()

    # Delete pipeline generated files (code, charts, cleaned datasets)
    run_dir = Path(settings.generated_code_dir) / dataset_id
    if run_dir.exists() and run_dir.is_dir():
        shutil.rmtree(run_dir)

    # Delete from database. Since PRAGMA foreign_keys=ON is enabled in aiosqlite,
    # this will cascade delete DatasetProfile, ResearchQuestion, AnalysisRun, Insight, etc.
    await db.delete(dataset)
    await db.commit()
    return None

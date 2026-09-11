import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db, AsyncSessionLocal
from app.db.models import Dataset, DatasetProfile, LocalUser
from app.deps import get_current_user
from app.schemas.datasets import DatasetOut, DatasetProfileOut
from app.services import storage, profiling

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/datasets", tags=["datasets"])


async def _run_profiling(dataset_id: str) -> None:
    """Background task: profile a dataset and persist results.

    Uses its own DB session since the request-scoped session from the
    upload endpoint will already be closed by the time this runs.
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

        await db.commit()


@router.post("", response_model=DatasetOut, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    dataset = Dataset(
        user_id=user.id,
        filename=file.filename or "dataset",
        format="",
        raw_path="",
        status="processing",
    )
    db.add(dataset)
    await db.flush()  # assigns dataset.id via default

    try:
        raw_path, size, fmt = await storage.save_upload(dataset.id, file)
    except storage.UnsupportedFileTypeError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(exc))
    except storage.FileTooLargeError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc))

    dataset.raw_path = raw_path
    dataset.format = fmt
    dataset.file_size_bytes = size
    await db.commit()
    await db.refresh(dataset)

    background_tasks.add_task(_run_profiling, dataset.id)

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

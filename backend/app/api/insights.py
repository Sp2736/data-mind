from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import AnalysisRun, Insight, LocalUser, Visualization
from app.deps import get_current_user
from app.schemas.pipeline import InsightOut, VisualizationOut

router = APIRouter(prefix="/datasets", tags=["insights"])

# NOTE: db/models.py currently declares ForeignKey columns only (no
# SQLAlchemy `relationship()` attributes), so cross-table reads here use an
# explicit join on the raw columns rather than `Insight.run`. If you later
# add `relationship()` declarations to models.py, this can be simplified.


@router.get("/{dataset_id}/insights", response_model=list[InsightOut])
async def list_insights(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    result = await db.execute(
        select(Insight)
        .join(AnalysisRun, AnalysisRun.id == Insight.run_id)
        .where(AnalysisRun.dataset_id == dataset_id)
    )
    return result.scalars().all()


@router.get("/{dataset_id}/insights/{insight_id}/visualization", response_model=VisualizationOut | None)
async def get_visualization(
    dataset_id: str,
    insight_id: str,
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    result = await db.execute(select(Visualization).where(Visualization.insight_id == insight_id))
    return result.scalar_one_or_none()

from fastapi.responses import FileResponse
import os

@router.get("/{dataset_id}/insights/{insight_id}/visualization/image")
async def get_visualization_image(
    dataset_id: str,
    insight_id: str,
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    result = await db.execute(select(Visualization).where(Visualization.insight_id == insight_id))
    vis = result.scalar_one_or_none()
    if not vis or not vis.chart_file_path:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Image not found")
    
    # chart_file_path is an absolute path or relative to generated_code_dir
    from app.config import settings
    path = vis.chart_file_path
    if not os.path.isabs(path):
        path = os.path.join(settings.generated_code_dir, path)
        
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Image file not found on disk")
        
    return FileResponse(path, media_type="image/png")

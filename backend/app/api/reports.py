import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import AnalysisRun, Dataset, Insight, LocalUser, Report
from app.deps import get_current_user
from app.schemas.pipeline import ReportOut
from app.services.llm import get_llm
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/datasets", tags=["reports"])


@router.post("/{dataset_id}/report", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
async def build_report(
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

    insights_result = await db.execute(
        select(Insight)
        .join(AnalysisRun, AnalysisRun.id == Insight.run_id)
        .where(AnalysisRun.dataset_id == dataset_id)
    )
    insights = insights_result.scalars().all()
    if not insights:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No completed insights yet — run the pipeline on some research questions first",
        )

    llm = get_llm(settings.insight_writer_model)
    bullet_points = "\n".join(f"- ({i.category}) {i.summary_text}" for i in insights)
    prompt = (
        "You are writing the executive summary section of a data analysis report. "
        "Given the following individual findings, write a single cohesive overview "
        "paragraph (4-6 sentences) that synthesizes them — do not just restate the list.\n\n"
        f"{bullet_points}"
    )
    response = await llm.ainvoke(prompt)
    overall_summary = response.content if hasattr(response, "content") else str(response)

    existing = await db.execute(select(Report).where(Report.dataset_id == dataset_id))
    report = existing.scalar_one_or_none()
    if report is None:
        report = Report(dataset_id=dataset_id, overall_summary=overall_summary, cleaning_actions=[])
        db.add(report)
    else:
        report.overall_summary = overall_summary

    await db.commit()
    await db.refresh(report)
    return report


@router.get("/{dataset_id}/report", response_model=ReportOut)
async def get_report(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    result = await db.execute(select(Report).where(Report.dataset_id == dataset_id))
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not built yet")
    return report

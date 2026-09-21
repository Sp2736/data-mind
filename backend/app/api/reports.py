import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import AnalysisRun, Dataset, Insight, LocalUser, Report, ResearchQuestion
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
        select(Insight, ResearchQuestion.question_text)
        .join(AnalysisRun, AnalysisRun.id == Insight.run_id)
        .join(ResearchQuestion, ResearchQuestion.id == Insight.rq_id)
        .where(AnalysisRun.dataset_id == dataset_id)
    )
    insight_rows = insights_result.all()  # list of (Insight, question_text)
    insights = [row[0] for row in insight_rows]
    question_texts = {row[0].id: row[1] for row in insight_rows}
    if not insights:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No completed insights yet — run the pipeline on some research questions first",
        )

    llm = get_llm(settings.insight_writer_model)

    # Group insights by category for structured Markdown sections
    from collections import defaultdict
    by_category: dict[str, list] = defaultdict(list)
    for i in insights:
        by_category[i.category].append(i)

    # Build a structured context block for the LLM
    sections_ctx = []
    for cat, cat_insights in by_category.items():
        items_text = "\n".join(
            f"  [{idx+1}] question: {question_texts.get(ins.id, ins.rq_id)}\n"
            f"      summary: {ins.summary_text}\n"
            f"      takeaways: {'; '.join(ins.key_takeaways)}"
            for idx, ins in enumerate(cat_insights)
        )
        sections_ctx.append(f"category={cat}:\n{items_text}")

    context = "\n\n".join(sections_ctx)
    categories_list = ", ".join(by_category.keys())

    prompt = (
        "You are a senior data analyst writing a structured analytical report in Markdown. "
        "Use the findings below to produce a complete, well-formatted report with these sections:\n\n"
        "1. An `## Executive Summary` (3-5 sentences synthesising the most important cross-cutting findings — do not just restate the list)\n"
        f"2. One `## <Category Name>` section per category ({categories_list}). "
        "Under each, list each finding as a numbered item with:\n"
        "   - **Question:** (the research question answered)\n"
        "   - **Finding:** (the core result in 1-2 sentences)\n"
        "   - **Key Takeaways:** (bullet list from the takeaways)\n"
        "3. A `## Recommended Visualizations` section listing the chart types that would best support "
        "the most important findings (e.g. bar chart comparing X vs Y, scatter plot for correlation between A and B).\n\n"
        "Use proper Markdown. Be concise and precise — no filler text.\n\n"
        f"FINDINGS:\n{context}"
    )

    response = await llm.ainvoke(prompt)
    raw_content = response.content if hasattr(response, "content") else str(response)
    if isinstance(raw_content, list):
        overall_summary = "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in raw_content
        ).strip()
    elif isinstance(raw_content, str):
        overall_summary = raw_content.strip()
    else:
        overall_summary = str(raw_content).strip()

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

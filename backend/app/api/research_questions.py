import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import Dataset, DatasetProfile, ResearchQuestion, LocalUser
from app.deps import get_current_user
from app.schemas.pipeline import ResearchQuestionOut, GenerateQuestionsRequest
from app.agents.nodes.question_generator import generate_research_questions

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/datasets", tags=["research-questions"])


async def _get_ready_dataset(dataset_id: str, db: AsyncSession, user: LocalUser) -> Dataset:
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == user.id)
    )
    dataset = result.scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    if dataset.status != "ready":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Dataset is not ready yet (status={dataset.status})",
        )
    return dataset


@router.post("/{dataset_id}/questions", response_model=list[ResearchQuestionOut])
async def generate_questions(
    dataset_id: str,
    body: GenerateQuestionsRequest,
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    dataset = await _get_ready_dataset(dataset_id, db, user)

    profile_result = await db.execute(
        select(DatasetProfile).where(DatasetProfile.dataset_id == dataset_id)
    )
    profile = profile_result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset profile not found")

    similar_past_insights = []
    if body.use_rag:
        try:
            from app.rag.retriever import retrieve_similar_insights

            similar_past_insights = await retrieve_similar_insights(
                schema_summary=profile.schema_summary, k=5
            )
        except Exception:
            logger.exception("RAG retrieval failed, continuing without it")

    batch, _metrics = await generate_research_questions(
        schema_summary=profile.schema_summary,
        stats_summary=profile.stats_summary,
        correlation_summary=profile.correlation_summary,
        sample_rows=profile.sample_rows,
        similar_past_insights=similar_past_insights,
    )

    rows = []
    for i, item in enumerate(batch.questions):
        rq = ResearchQuestion(
            dataset_id=dataset_id,
            category=item.category,
            question_text=item.question_text,
            target_columns=item.target_columns,
            rationale=item.rationale,
            expected_output_type=item.expected_output_type,
            sort_order=i,
        )
        db.add(rq)
        rows.append(rq)

    await db.commit()
    for rq in rows:
        await db.refresh(rq)

    return rows


@router.get("/{dataset_id}/questions", response_model=list[ResearchQuestionOut])
async def list_questions(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    user: LocalUser = Depends(get_current_user),
):
    await _get_ready_dataset(dataset_id, db, user)
    result = await db.execute(
        select(ResearchQuestion)
        .where(ResearchQuestion.dataset_id == dataset_id)
        .order_by(ResearchQuestion.sort_order)
    )
    return result.scalars().all()

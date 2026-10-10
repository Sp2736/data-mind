import pytest
from app.evaluation.rq_quality import compute_automatic_metrics, judge_rq_batch
from app.agents.schemas import ResearchQuestionItem

@pytest.mark.asyncio
async def test_compute_automatic_metrics():
    qs = [
        ResearchQuestionItem(
            category="distribution",
            question_text="What is the distribution of X?",
            target_columns=["X"],
            rationale="Test",
            expected_output_type="statistic"
        )
    ]
    schema = [{"column_name": "X", "data_type": "int64"}]
    metrics = compute_automatic_metrics(qs, schema)
    assert metrics.grounded_questions == 1
    assert metrics.column_grounding_rate == 1.0

@pytest.mark.asyncio
async def test_judge_rq_batch(mock_llm_factory):
    from app.evaluation.rq_quality import RQJudgeBatch, RQJudgeScore
    
    mock_score = RQJudgeScore(index=0, relevance=4, specificity=4, actionability=4, justification="Good")
    mock_batch = RQJudgeBatch(scores=[mock_score])
    mock_llm_factory([mock_batch])
    
    qs = [
        ResearchQuestionItem(
            category="distribution",
            question_text="What is the distribution of X?",
            target_columns=["X"],
            rationale="Test",
            expected_output_type="statistic"
        )
    ]
    scores = await judge_rq_batch(qs, [{"column_name": "X"}], [], [])
    assert len(scores) == 1
    assert scores[0].relevance == 4

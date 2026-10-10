import pytest
from app.evaluation.insight_quality import compute_automatic_insight_metrics, judge_insight_batch

def test_compute_automatic_insight_metrics():
    summary = "The max is 42 and min is 10."
    takeaways = []
    stdout = "max: 42, min: 10"
    metrics = compute_automatic_insight_metrics(summary, takeaways, stdout)
    assert metrics.faithfulness_rate == 1.0
    assert metrics.total_numbers_cited == 2

@pytest.mark.asyncio
async def test_judge_insight_batch(mock_llm_factory):
    from app.evaluation.insight_quality import _InsightJudgeBatch, TakeawayGroundednessScore
    
    score = TakeawayGroundednessScore(bullet_index=0, bullet_text="Test", supported=True, reason="Yes")
    mock_batch = _InsightJudgeBatch(takeaway_scores=[score], caveat_mentioned=True, justification="Good")
    mock_llm_factory([mock_batch])
    
    trials = [{
        "run_id": "r1",
        "insight": {"summary_text": "Sum", "key_takeaways": ["Takeaway"]},
        "attempts": [{"succeeded": True, "stdout": "Test"}]
    }]
    
    scores = await judge_insight_batch(trials)
    assert len(scores) == 1
    assert scores[0].caveat_mentioned is True

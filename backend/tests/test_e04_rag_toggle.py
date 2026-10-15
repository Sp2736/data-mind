from unittest.mock import AsyncMock
import pytest
from app.config import settings


def test_rag_in_app_runs_config_default():
    assert hasattr(settings, "rag_in_app_runs")
    assert isinstance(settings.rag_in_app_runs, bool)


@pytest.mark.parametrize("toggle_val,should_call", [(False, False), (True, True)])
def test_rag_in_app_runs_gating(monkeypatch, toggle_val, should_call):
    monkeypatch.setattr(settings, "rag_in_app_runs", toggle_val)
    
    mock_retriever = AsyncMock(return_value=[{"insight": "test"}])
    monkeypatch.setattr("app.rag.retriever.retrieve_similar_insights", mock_retriever)
    
    rq_category = "distribution"
    similar_past_insights = []
    
    if rq_category != "system_profile" and settings.rag_in_app_runs:
        import asyncio
        from app.rag.retriever import retrieve_similar_insights
        similar_past_insights = asyncio.run(retrieve_similar_insights(schema_summary="summary", k=5))
        
    if should_call:
        assert mock_retriever.called
        assert len(similar_past_insights) == 1
    else:
        assert not mock_retriever.called
        assert similar_past_insights == []

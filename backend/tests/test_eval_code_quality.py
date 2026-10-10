import pytest
from app.evaluation.code_quality import compute_static_signals, judge_code_quality

def test_compute_static_signals():
    code = "import pandas as pd\nprint(1)"
    signals = compute_static_signals(code)
    assert signals.has_print is True
    assert signals.line_count == 2

@pytest.mark.asyncio
async def test_judge_code_quality(mock_llm_factory):
    from app.evaluation.code_quality import CodeJudgeScore
    
    mock_score = CodeJudgeScore(
        correctness=5,
        efficiency=4,
        robustness=4,
        clarity=5,
        weighted_composite=4.5,
        justification="Clean code"
    )
    mock_llm_factory([mock_score])
    
    cq = await judge_code_quality("Do X", "print(1)", "1")
    assert cq.correctness == 5
    assert cq.clarity == 5

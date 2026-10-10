import pytest
from typing import Any

class MockLLMResult:
    def __init__(self, parsed=None, raw=None):
        self._parsed = parsed
        self._raw = raw

    def get(self, key, default=None):
        if key == "parsed": return self._parsed
        if key == "raw": return self._raw
        return default

class MockLLM:
    def __init__(self, responses):
        self.responses = responses
        self.call_count = 0

    def with_structured_output(self, schema, include_raw=False):
        return self

    async def ainvoke(self, messages: Any) -> Any:
        res = self.responses[self.call_count % len(self.responses)]
        self.call_count += 1
        return {"parsed": res, "raw": None}

@pytest.fixture
def mock_llm_factory(monkeypatch):
    def _factory(responses):
        mock = MockLLM(responses)
        monkeypatch.setattr("app.services.llm.get_llm", lambda *args, **kwargs: mock)
        return mock
    return _factory

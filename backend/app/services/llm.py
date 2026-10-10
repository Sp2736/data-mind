"""LLM provider factory.

Gemini API is the supported provider. Each node's model setting is a
"provider:model" string, e.g. "google:gemini-3.1-flash-lite".
This lets different nodes hit different providers/quotas in the same run.

OpenRouter is kept as a silent optional secondary provider but is not
documented or supported — Gemini is the only documented/supported path.
"""
import asyncio
from contextvars import ContextVar
from dataclasses import dataclass

from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential_jitter

from app.config import settings


# ─────────────────────────────────────────────────────────────────────────────
# Structured retry stats (§4.3.4)
#
# A ContextVar so each asyncio Task (= each graph run) has its own counter.
# Nodes call flush_retry_stats() after their LLM call and accumulate the
# totals into AnalysisState fields.
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class RetryStats:
    rate_limit_retries: int = 0
    other_retries: int = 0
    wait_seconds: float = 0.0


_retry_stats: ContextVar[RetryStats] = ContextVar("_llm_retry_stats")


def _stats() -> RetryStats:
    try:
        return _retry_stats.get()
    except LookupError:
        s = RetryStats()
        _retry_stats.set(s)
        return s


def flush_retry_stats() -> RetryStats:
    """Return the stats accumulated since the last flush and start a fresh bucket."""
    s = _stats()
    _retry_stats.set(RetryStats())
    return s


def flush_retry_count() -> int:
    """Backward-compatible alias — returns rate-limit retries only."""
    return flush_retry_stats().rate_limit_retries


# Keep thin wrappers for any remaining callers.
def reset_retry_count() -> None:
    """Reset the per-task retry stats to zero (backward-compatible)."""
    _retry_stats.set(RetryStats())


def get_retry_count() -> int:
    """Return current rate-limit retry count without resetting (backward-compatible)."""
    return _stats().rate_limit_retries


# ─────────────────────────────────────────────────────────────────────────────
# Error classification helpers
# ─────────────────────────────────────────────────────────────────────────────

def _status_code(exc: BaseException) -> int | None:
    for attr in ("code", "status_code", "http_status"):
        v = getattr(exc, attr, None)
        if isinstance(v, int):
            return v
    resp = getattr(exc, "response", None)
    v = getattr(resp, "status_code", None)
    return v if isinstance(v, int) else None


def is_rate_limit_error(exc: BaseException) -> bool:
    if _status_code(exc) == 429:
        return True
    msg = str(exc).lower()
    return any(t in msg for t in ("429", "resource_exhausted", "resource exhausted", "rate limit", "quota"))


def is_transient_error(exc: BaseException) -> bool:
    if _status_code(exc) in (500, 502, 503, 504):
        return True
    if isinstance(exc, (TimeoutError, ConnectionError, asyncio.TimeoutError)):
        return True
    msg = str(exc).lower()
    return any(t in msg for t in ("unavailable", "deadline exceeded", "timed out", "connection reset", "overloaded"))


def _should_retry(exc: BaseException) -> bool:
    return is_rate_limit_error(exc) or is_transient_error(exc)


def _before_sleep(rs) -> None:  # noqa: ANN001
    exc = rs.outcome.exception() if rs.outcome else None
    st = _stats()
    if exc is not None and is_rate_limit_error(exc):
        st.rate_limit_retries += 1
    else:
        st.other_retries += 1
    if rs.next_action is not None:
        st.wait_seconds += float(rs.next_action.sleep)


def with_llm_retry(fn):
    return retry(
        retry=retry_if_exception(_should_retry),
        stop=stop_after_attempt(5),
        wait=wait_exponential_jitter(initial=2, max=60),
        before_sleep=_before_sleep,
        reraise=True,
    )(fn)


# ─────────────────────────────────────────────────────────────────────────────
# LLM factory
# ─────────────────────────────────────────────────────────────────────────────

def get_llm(model_spec: str):
    provider, _, model_name = model_spec.partition(":")

    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=model_name,
            temperature=settings.llm_temperature,
            google_api_key=settings.google_api_key,
        )

    if provider == "openrouter":
        # model_name may itself contain a ':' (e.g. "meta-llama/llama-3.3-70b-instruct:free")
        # so re-join anything partition split off past the first colon.
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=model_spec.split(":", 1)[1],
            temperature=settings.llm_temperature,
            api_key=settings.openrouter_api_key,
            base_url="https://openrouter.ai/api/v1",
        )

    raise ValueError(
        f"Unknown provider {provider!r} in model spec {model_spec!r}. "
        "Expected 'google:<model>' (supported) or 'openrouter:<model>' (undocumented fallback)."
    )
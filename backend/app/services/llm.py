"""LLM provider factory.

Each node's model setting is a "provider:model" string, e.g.
"google:gemini-3-flash" or "openrouter:meta-llama/llama-3.3-70b-instruct:free".
This lets different nodes hit different providers/quotas in the same run.
"""
from contextvars import ContextVar

from app.config import settings
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential_jitter


# ─────────────────────────────────────────────────────────────────────────────
# Rate-limit retry counter (§4.3.4)
#
# A ContextVar so each asyncio Task (= each graph run) has its own counter.
# Nodes call reset_retry_count() before their LLM call and read
# flush_retry_count() (which resets to 0) after, accumulating the total into
# AnalysisState.rate_limit_retry_count.
# ─────────────────────────────────────────────────────────────────────────────
_retry_counter: ContextVar[int] = ContextVar("_llm_retry_counter", default=0)


def reset_retry_count() -> None:
    """Reset the per-task retry counter to 0 (call at start of each node)."""
    _retry_counter.set(0)


def get_retry_count() -> int:
    """Return the current retry count without resetting."""
    return _retry_counter.get(0)


def flush_retry_count() -> int:
    """Return the current retry count and reset to 0."""
    count = _retry_counter.get(0)
    _retry_counter.set(0)
    return count


def _on_retry(retry_state) -> None:  # noqa: ANN001
    """Tenacity before_sleep callback — increments the task-local counter."""
    _retry_counter.set(_retry_counter.get(0) + 1)


def with_llm_retry(fn):
    return retry(
        retry=retry_if_exception_type(Exception),
        stop=stop_after_attempt(5),
        wait=wait_exponential_jitter(initial=2, max=60),
        before_sleep=_on_retry,
        reraise=True,
    )(fn)

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

    # ─────────────────────────────────────────────────────────────────────────
    # [OFFLINE FALLBACK - kept, not deleted] Ollama — fully local.
    # Only reachable if a model_spec is literally "ollama:<model>",
    # which nothing sets by default anymore. Manual opt-in only,
    # for when both cloud quotas are exhausted mid-testing-session.
    # Requires Ollama running on localhost:11434 (`ollama serve`).
    # ─────────────────────────────────────────────────────────────────────────
    if provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(
            model=model_name,
            base_url=settings.ollama_base_url,
            temperature=settings.llm_temperature,
            format="json",
        )

    raise ValueError(
        f"Unknown provider {provider!r} in model spec {model_spec!r}. "
        "Expected 'google:<model>', 'openrouter:<model>', or 'ollama:<model>'."
    )
"""LLM provider factory.

Active provider: Ollama (fully local, zero API keys needed).

To switch to a cloud provider for production/evaluation:
  1. Set LLM_PROVIDER in backend/.env to the desired provider.
  2. Uncomment the corresponding block below.
  3. Add your API key to backend/.env.
"""
from app.config import settings


def get_llm(model_name: str):
    # ─────────────────────────────────────────────────────────────────────────
    # ACTIVE: Ollama — fully local, no API keys required.
    # Requires Ollama running on localhost:11434 (`ollama serve`).
    # Models available: gemma3:4b, phi4-mini, qwen2.5:3b, gemma3:1b
    # ─────────────────────────────────────────────────────────────────────────
    if settings.llm_provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(
            model=model_name,
            base_url=settings.ollama_base_url,
            temperature=settings.llm_temperature,
            # format="json" enables JSON-mode so .with_structured_output()
            # works reliably with Ollama models (gemma3, qwen2.5, phi4-mini).
            format="json",
        )

    # ─────────────────────────────────────────────────────────────────────────
    # [CLOUD - UNCOMMENT TO USE API] Google Gemini
    # Requires: GOOGLE_API_KEY in backend/.env
    # Free tier: https://ai.google.dev (gemini-2.5-flash has generous limits)
    # Set: LLM_PROVIDER=google
    # ─────────────────────────────────────────────────────────────────────────
    # elif settings.llm_provider == "google":
    #     from langchain_google_genai import ChatGoogleGenerativeAI
    #     return ChatGoogleGenerativeAI(
    #         model=model_name,
    #         temperature=settings.llm_temperature,
    #         google_api_key=settings.google_api_key,
    #     )

    # ─────────────────────────────────────────────────────────────────────────
    # [CLOUD - UNCOMMENT TO USE API] Groq (fast free-tier, great for corrections)
    # Requires: GROQ_API_KEY in backend/.env
    # Free tier: https://console.groq.com
    # Set: LLM_PROVIDER=groq
    # ─────────────────────────────────────────────────────────────────────────
    # elif settings.llm_provider == "groq":
    #     from langchain_groq import ChatGroq
    #     return ChatGroq(
    #         model=model_name,
    #         temperature=settings.llm_temperature,
    #         groq_api_key=settings.groq_api_key,
    #     )

    # ─────────────────────────────────────────────────────────────────────────
    # [CLOUD - UNCOMMENT TO USE API] OpenAI
    # Requires: OPENAI_API_KEY in backend/.env
    # Set: LLM_PROVIDER=openai
    # ─────────────────────────────────────────────────────────────────────────
    # elif settings.llm_provider == "openai":
    #     from langchain_openai import ChatOpenAI
    #     return ChatOpenAI(
    #         model=model_name,
    #         temperature=settings.llm_temperature,
    #         openai_api_key=settings.openai_api_key,
    #     )

    # ─────────────────────────────────────────────────────────────────────────
    # [CLOUD - UNCOMMENT TO USE API] OpenRouter
    # OpenAI-API-compatible gateway to many providers, including free ":free"
    # models — see https://openrouter.ai/models
    # Requires: OPENROUTER_API_KEY in backend/.env
    # Set: LLM_PROVIDER=openrouter
    # ─────────────────────────────────────────────────────────────────────────
    # elif settings.llm_provider == "openrouter":
    #     from langchain_openai import ChatOpenAI
    #     return ChatOpenAI(
    #         model=model_name,
    #         temperature=settings.llm_temperature,
    #         openai_api_key=settings.openrouter_api_key,
    #         base_url="https://openrouter.ai/api/v1",
    #     )

    else:
        raise ValueError(
            f"Unknown LLM provider: {settings.llm_provider!r}. "
            "Valid options: 'ollama' (active), or uncomment 'google'/'groq'/'openai'/'openrouter'."
        )
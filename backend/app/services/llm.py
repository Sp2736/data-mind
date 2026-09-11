from app.config import settings


def get_llm(model_name: str):
    if settings.llm_provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=model_name,
            temperature=settings.llm_temperature,
            google_api_key=settings.google_api_key,
        )
    elif settings.llm_provider == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(
            model=model_name,
            temperature=settings.llm_temperature,
            groq_api_key=settings.groq_api_key,
        )
    elif settings.llm_provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=model_name,
            temperature=settings.llm_temperature,
            openai_api_key=settings.openai_api_key,
        )
    elif settings.llm_provider == "openrouter":
        # OpenRouter is OpenAI-API-compatible, so ChatOpenAI works unmodified
        # with a different base_url. Gives access to many providers'
        # free-tier (":free" suffixed) models under one API key — see
        # https://openrouter.ai/models for current free options.
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=model_name,
            temperature=settings.llm_temperature,
            openai_api_key=settings.openrouter_api_key,
            base_url="https://openrouter.ai/api/v1",
        )
    else:
        raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")
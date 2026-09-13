from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str
    database_url_direct: str

    # Auth
    local_user_email: str
    local_user_password: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080

    # Storage
    data_root: str = "../data"
    datasets_raw_dir: str = "../data/datasets/raw"
    datasets_processed_dir: str = "../data/datasets/processed"
    generated_code_dir: str = "../data/generated_code"
    outputs_dir: str = "../data/outputs"
    logs_dir: str = "../data/logs"

    # LLM
    llm_provider: str = "ollama"  # switch to 'google'/'groq'/'openai'/'openrouter' when using API keys
    ollama_base_url: str = "http://localhost:11434"
    google_api_key: str | None = None
    groq_api_key: str | None = None
    openai_api_key: str | None = None
    openrouter_api_key: str | None = None
    question_generator_model: str = "qwen2.5:3b"
    code_generator_model: str = "gemma3:4b"
    code_corrector_model: str = "gemma3:4b"
    insight_writer_model: str = "qwen2.5:3b"
    llm_temperature: float = 0.2

    langchain_tracing_v2: bool = False
    langchain_project: str = "datamind-local"

    # Sandbox
    sandbox_image: str = "datamind-sandbox:latest"
    sandbox_timeout_seconds: int = 60
    sandbox_memory_limit: str = "1g"
    sandbox_cpu_limit: str = "1"
    # Set USE_DOCKER_SANDBOX=true to run generated code inside datamind-sandbox:latest
    # (docker run --rm --network none, memory/CPU capped). Keep false for fast local
    # subprocess execution during development.
    use_docker_sandbox: bool = False

    # RAG (local, Docker-free — Chroma persistent client + local embeddings)
    rag_persist_dir: str = "../data/rag_store"
    rag_embedding_model: str = "all-MiniLM-L6-v2"

    # App
    environment: str = "development"
    cors_origins: str = "http://localhost:3000"


settings = Settings()
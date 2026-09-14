# DataMind — Ollama → Gemini + OpenRouter Split Architecture Migration Plan

**Status:** Supersedes the "ACTIVE: Ollama" block in `backend/app/services/llm.py` and the `qwen2.5:3b` / `gemma3:4b` model defaults in `backend/app/config.py`. This project no longer runs local inference. All LLM calls move to two free-tier cloud APIs, split by node so neither provider's rate limit becomes the pipeline's single bottleneck.

**Confirmed decisions (do not revisit without a new reason):**
- Two providers, not one: **Google Gemini (AI Studio)** for the two reasoning-heavy nodes, **OpenRouter** (free-tagged models) for the four lighter/templated nodes.
- Provider selection is **per-node, not global** — no more single `LLM_PROVIDER` switch. `get_llm()` now parses a `"provider:model"` string per setting.
- No new orchestration framework. Same LangGraph graph, same `.with_structured_output()` calls in every node — only the factory changes.
- Ollama code path stays in `llm.py`, commented out, not deleted (kept as an offline fallback if both cloud quotas are exhausted mid-testing).
- Add retry-with-backoff around every LLM call (`tenacity`, already in requirements.txt) — free tiers return 429 routinely, that is not a bug to work around by switching providers again.
- Do not add Groq or a third provider in this pass. Two is enough to split load; more adds config surface for no real benefit right now.

---

## 0. How to use this file

Feed this to Antigravity phase by phase. Do not let it skip ahead. Each phase lists scope, files, acceptance criteria, and explicit "do NOT"s. Commit after each phase passes its acceptance criteria.

---

## 1. Architecture

```
LangGraph pipeline (6 LLM-calling nodes)
│
├── code_generator          ──▶ Google Gemini   (gemini-3-flash)
├── code_corrector           ──▶ Google Gemini   (gemini-3-flash)
│     (heavy: full dataset profile + schema/stats/sample rows in prompt,
│      must reason correctly to produce working pandas code)
│
├── question_generator       ──▶ OpenRouter free model
├── rq_quality_scorer         ──▶ OpenRouter free model   (shares question_generator_model)
├── insight_writer            ──▶ OpenRouter free model
└── visualization_builder     ──▶ OpenRouter free model   (shares insight_writer_model)
      (lighter: templated JSON scoring/summarization, doesn't need
       Gemini's reasoning depth — and keeping it off Gemini frees up
       Gemini's RPM/RPD headroom entirely for code gen/correction)
```

This means one full pipeline run costs Gemini exactly 2 calls (code_generator + however many code_corrector retries) and OpenRouter 4 calls, against two *separate* quota pools — so the effective daily run capacity is roughly `min(gemini_RPD / 2, openrouter_RPD / 4)` instead of `total_RPD / 6` against one pool.

---

## 2. Phase 1 — Config & secrets

**Scope:** `backend/app/config.py`, `backend/.env`

- Remove `ollama_base_url` from required-at-runtime use (keep the field, just unused by default).
- Remove `groq_api_key` / `openai_api_key` fields — out of scope for this pass (Ollama block stays commented in `llm.py` for offline fallback, doesn't need its own settings).
- Add/confirm:
  ```python
  google_api_key: str | None = None
  openrouter_api_key: str | None = None
  ```
- Change the four model settings to `"provider:model"` strings:
  ```python
  question_generator_model: str = "openrouter:meta-llama/llama-3.3-70b-instruct:free"
  code_generator_model: str = "google:gemini-3-flash"
  code_corrector_model: str = "google:gemini-3-flash"
  insight_writer_model: str = "openrouter:meta-llama/llama-3.3-70b-instruct:free"
  ```
  (Check https://openrouter.ai/models?max_price=0 before wiring this up — free-tagged models rotate/deprecate. `deepseek/deepseek-chat:free` and `qwen/qwen-2.5-72b-instruct:free` are reasonable alternates if the above is gone. Pick one that has been stable for a few weeks, not the newest addition.)
- `backend/.env`:
  ```
  GOOGLE_API_KEY=your_aistudio_key
  OPENROUTER_API_KEY=your_openrouter_key
  ```

**Acceptance criteria:** `Settings()` loads with both keys present; no `llm_provider` field is referenced anywhere in `app/` anymore (search for it — it should only remain, commented, in `llm.py`'s Ollama block).

**Do NOT** hardcode either key anywhere outside `.env`. Do NOT leave `llm_provider` as a dead field in `config.py` — delete it, since routing is now per-model-string.

---

## 3. Phase 2 — Rewrite `get_llm()` for provider-per-string routing

**Scope:** `backend/app/services/llm.py`

Replace the current `if settings.llm_provider == ...` factory with one that parses the `"provider:model"` string passed in from each node's setting:

```python
"""LLM provider factory.

Each node's model setting is a "provider:model" string, e.g.
"google:gemini-3-flash" or "openrouter:meta-llama/llama-3.3-70b-instruct:free".
This lets different nodes hit different providers/quotas in the same run.
"""
from app.config import settings


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

    # ─────────────────────────────────────────────────────────────────────
    # [OFFLINE FALLBACK - kept, not deleted] Ollama — fully local.
    # Only reachable if a model_spec is literally "ollama:<model>",
    # which nothing sets by default anymore. Manual opt-in only,
    # for when both cloud quotas are exhausted mid-testing-session.
    # Requires Ollama running on localhost:11434 (`ollama serve`).
    # ─────────────────────────────────────────────────────────────────────
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
```

Note the `model_spec.split(":", 1)[1]` on the OpenRouter branch — `.partition(":")` on the full spec would otherwise truncate an OpenRouter model id at its own `:free` suffix. Test this specifically with the actual model string you pick in Phase 1.

**Acceptance criteria:** `get_llm("google:gemini-3-flash")` and `get_llm("openrouter:meta-llama/llama-3.3-70b-instruct:free")` both return usable LangChain chat models with no other code changes. No node file (`code_generator.py`, etc.) needs editing in this phase — they already just pass `settings.<x>_model` straight into `get_llm()`.

**Do NOT** change any node's call site (`get_llm(settings.code_generator_model)` etc.) — the whole point is the routing lives in one place.

---

## 4. Phase 3 — Retry/backoff for free-tier 429s

**Scope:** `backend/app/services/llm.py` or a small new `backend/app/services/llm_retry.py`

Free-tier Gemini (~10–15 RPM) and OpenRouter free models (~20 RPM, low RPD) will 429 during normal testing, especially if you queue multiple dataset runs back to back. Wrap invocation, not just construction:

```python
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential_jitter

def with_llm_retry(fn):
    return retry(
        retry=retry_if_exception_type(Exception),  # narrow to the provider's 429/RateLimitError class once picked
        stop=stop_after_attempt(5),
        wait=wait_exponential_jitter(initial=2, max=60),
        reraise=True,
    )(fn)
```

Apply this around the `await llm.ainvoke(messages)` call in each node (or wrap `.ainvoke` itself once, centrally, if you'd rather not touch six files — your call, but be consistent).

**Acceptance criteria:** A forced rate-limit condition (e.g. temporarily drop your RPM by hammering the API in a loop) results in retried calls with backoff, not an immediate pipeline failure.

**Do NOT** retry on structured-output parse failures (`parsed is None` in the node code) — that's a prompt/schema problem, not a rate limit, and retrying it blindly just burns quota on the same bad response pattern.

---

## 5. Phase 4 — Update the six node files' model settings only (no logic changes)

**Scope:** confirm, don't rewrite:
- `code_generator.py`, `code_corrector.py` → already read `settings.code_generator_model` / `settings.code_corrector_model` → now resolve to `google:gemini-3-flash`
- `question_generator.py`, `rq_quality_scorer.py` → already read `settings.question_generator_model` → now resolve to `openrouter:...`
- `insight_writer.py`, `visualization_builder.py` → already read `settings.insight_writer_model` → now resolve to `openrouter:...`

**Acceptance criteria:** grep confirms zero remaining references to `gemma3`, `qwen2.5`, `phi4-mini`, or `ollama_base_url` outside the commented fallback block.

---

## 6. Phase 5 — End-to-end test

- Run one full dataset through the pipeline. Confirm in logs/state (`llm_call_count`, `prompt_tokens`, `total_tokens`) that exactly 2 calls hit Gemini and the rest hit OpenRouter.
- Run 3–4 datasets back to back to deliberately approach the free-tier ceiling and confirm the Phase 3 retry logic engages instead of hard-failing.
- Check both providers' live dashboards (Google AI Studio project usage page; openrouter.ai/activity) for the actual RPM/RPD your accounts are getting — these vary by account/region and are not worth hardcoding assumptions about.

**Acceptance criteria:** a batch of test runs completes with zero unhandled 429s, and you have a real number (not a blog estimate) for how many pipeline runs/day this split gives you.

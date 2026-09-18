"""Code-quality evaluation module.

Implements Part B.2 of todo-priority.md: rates generated-and-executed code
for real-world/professional relevance ("would a data analyst actually write
it this way") using the documented rubric (B.2.1) plus concrete automated
static-analysis signals, instead of one subjective score.

Two independent signal sources, both returned so the paper can report them
separately and corroborate one against the other:

  1. `compute_static_signals`  -> deterministic, no LLM call, no cost.
  2. `judge_code_quality`      -> LLM-as-judge against the 5-dimension rubric.

Meant to be called offline/batched (see telemetry.py) — not inline in the
live request path, to keep pipeline latency/cost unaffected.
"""
from __future__ import annotations

import ast
import logging
import re

from pydantic import BaseModel, Field

from app.services.llm import get_llm, with_llm_retry
from app.config import settings

logger = logging.getLogger(__name__)

_ITERROWS_RE = re.compile(r"\.iterrows\s*\(")
_AGG_BACKEND_RE = re.compile(r"matplotlib\.use\(\s*['\"]Agg['\"]\s*\)")


# ─────────────────────────────────────────────────────────────────────────
# B.2 static / automated code health signals — no LLM needed
# ─────────────────────────────────────────────────────────────────────────

class StaticCodeSignals(BaseModel):
    line_count: int
    cyclomatic_complexity: int = Field(description="Approximate McCabe complexity (branch count + 1)")
    uses_iterrows: bool = Field(description="True if pandas .iterrows() manual loop is used (anti-pattern)")
    has_guard_clauses: bool = Field(description="True if any try/except wraps risky operations")
    sets_matplotlib_agg_backend: bool = Field(description="True if matplotlib.use('Agg') is present")
    syntax_valid: bool


def _cyclomatic_complexity(tree: ast.AST) -> int:
    """Approximate McCabe complexity: 1 + number of branching nodes."""
    complexity = 1
    branch_nodes = (
        ast.If, ast.For, ast.While, ast.Try, ast.With,
        ast.BoolOp, ast.ExceptHandler,
    )
    for node in ast.walk(tree):
        if isinstance(node, branch_nodes):
            complexity += 1
        # Python 3.10+ match statements
        if hasattr(ast, "Match") and isinstance(node, getattr(ast, "Match")):
            complexity += len(getattr(node, "cases", []))
    return complexity


def compute_static_signals(code_text: str) -> StaticCodeSignals:
    """Deterministic, zero-cost static-analysis signals for a generated script."""
    line_count = len([ln for ln in code_text.splitlines() if ln.strip()])
    uses_iterrows = bool(_ITERROWS_RE.search(code_text))
    sets_agg = bool(_AGG_BACKEND_RE.search(code_text))

    try:
        tree = ast.parse(code_text)
        syntax_valid = True
        complexity = _cyclomatic_complexity(tree)
        has_guard = any(isinstance(n, ast.Try) for n in ast.walk(tree))
    except SyntaxError:
        syntax_valid = False
        complexity = 0
        has_guard = False

    return StaticCodeSignals(
        line_count=line_count,
        cyclomatic_complexity=complexity,
        uses_iterrows=uses_iterrows,
        has_guard_clauses=has_guard,
        sets_matplotlib_agg_backend=sets_agg,
        syntax_valid=syntax_valid,
    )


# ─────────────────────────────────────────────────────────────────────────
# B.2.1 rubric LLM-as-judge — Correctness, Idiomatic usage, Robustness,
# Output clarity, Professional style. Each 1-5, plus a weighted composite.
# ─────────────────────────────────────────────────────────────────────────

_RUBRIC_WEIGHTS = {
    "correctness": 0.30,
    "idiomatic_usage": 0.20,
    "robustness": 0.20,
    "output_clarity": 0.15,
    "professional_style": 0.15,
}

_JUDGE_SYSTEM_PROMPT = """\
You are a senior data analyst code reviewer. Score the given Python script
1-5 on each dimension below. Be strict and consistent — this feeds a
research paper's evaluation numbers, not a compliment.

1. Correctness: does the code actually answer the stated research question
   with the right computation, given the stdout it produced?
2. Idiomatic pandas/numpy usage: vectorized ops over manual loops, sensible
   groupby/agg/merge usage. Penalize .iterrows() and other anti-patterns.
3. Robustness: handles missing values, type coercion, empty groups,
   division-by-zero without crashing or silently producing wrong numbers.
4. Output clarity: stdout is human-readable with concrete numbers; any
   charts are labeled, legible, saved correctly.
5. Professional style: minimal but sufficient comments, no redundant
   computation, meaningful variable names — "would a working analyst
   plausibly write this?"

Score every dimension even if you must infer from limited context.
"""


class CodeQualityRubricScore(BaseModel):
    correctness: int = Field(ge=1, le=5)
    idiomatic_usage: int = Field(ge=1, le=5)
    robustness: int = Field(ge=1, le=5)
    output_clarity: int = Field(ge=1, le=5)
    professional_style: int = Field(ge=1, le=5)
    justification: str = Field(description="2-3 sentences covering the weakest dimension(s).")

    @property
    def weighted_composite(self) -> float:
        return sum(getattr(self, dim) * weight for dim, weight in _RUBRIC_WEIGHTS.items())


async def judge_code_quality(
    question_text: str,
    code_text: str,
    stdout: str,
    judge_model: str | None = None,
) -> CodeQualityRubricScore | None:
    """Held-out LLM-judge rubric score for one (question, code, stdout) trial.

    Returns None if the judge call fails — caller should treat this as
    "unscored" for that trial rather than defaulting to a fake score, since
    silently inventing a code-quality number would corrupt the paper's data.
    """
    model_spec = judge_model or getattr(settings, "code_judge_model", settings.code_corrector_model)
    llm = get_llm(model_spec).with_structured_output(CodeQualityRubricScore, include_raw=True)

    payload = {
        "question_text": question_text,
        "code": code_text,
        "stdout": stdout[:4000],
    }
    messages = [
        {"role": "system", "content": _JUDGE_SYSTEM_PROMPT},
        {"role": "user", "content": str(payload)},
    ]

    try:
        @with_llm_retry
        async def _invoke():
            return await llm.ainvoke(messages)

        result = await _invoke()
        parsed: CodeQualityRubricScore | None = result.get("parsed")
        if parsed is None:
            logger.warning("code_quality: judge structured parse failed")
        return parsed
    except Exception:
        logger.exception("code_quality: judge LLM call failed")
        return None

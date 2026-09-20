"""Evaluation framework for the RAG-vs-baseline research paper.

Sub-modules:
  rq_quality.py      -> ResearchQuestion quality metrics (automatic + LLM-judge)
  code_quality.py    -> Generated/executed code quality metrics (automatic + LLM-judge)
  insight_quality.py -> Insight output quality metrics (automatic + LLM-judge, §4.3.3)

Nothing in this package is imported by the live pipeline by default except
the two calls wired into app/agents/graph.py (see PROJECT_CHANGES.md at the
repo root for exactly where). All heavy/LLM-judge scoring is designed to be
run offline/batched against telemetry.py's JSONL output, not inline in the
request path, so it never adds latency or cost to a normal user-facing run.
"""

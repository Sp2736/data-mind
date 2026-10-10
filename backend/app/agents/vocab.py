"""Canonical vocabulary constants and normalizers.

Single source of truth for category names, output types, and run statuses
used across the backend.  Frontend mirror: ``frontend/src/lib/categories.ts``.
"""
from __future__ import annotations

CATEGORIES = (
    "data_cleaning",
    "distribution",
    "correlation",
    "trend",
    "anomaly",
    "segmentation",
)
SYSTEM_CATEGORY = "system_profile"
OUTPUT_TYPES = ("statistic", "chart", "table", "model_summary")
RUN_STATUSES = ("queued", "running", "succeeded", "failed")

_CATEGORY_ALIASES: dict[str, str] = {
    "pre-processing": "data_cleaning",
    "preprocessing": "data_cleaning",
    "cleaning": "data_cleaning",
    "data_quality": "data_cleaning",
    "relationship": "correlation",
    "outlier": "anomaly",
    "outliers": "anomaly",
    "comparison": "segmentation",
    "group_comparison": "segmentation",
    "eda": "distribution",
    "statistical": "distribution",
    "summary": "distribution",
}

_OUTPUT_ALIASES: dict[str, str] = {
    "metric": "statistic",
    "number": "statistic",
    "plot": "chart",
    "graph": "chart",
}


def normalize_category(raw: str) -> str:
    """Return canonical category name, applying alias map.  Unknown values pass through."""
    k = (raw or "").strip().lower().replace(" ", "_")
    return _CATEGORY_ALIASES.get(k, k)


def normalize_output_type(raw: str) -> str:
    """Return canonical output type, applying alias map.  Unknown values pass through."""
    k = (raw or "").strip().lower()
    return _OUTPUT_ALIASES.get(k, k)

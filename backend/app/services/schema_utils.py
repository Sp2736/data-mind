"""Schema-key access helpers.

The profiler writes schema entries with key ``column_name``; some older code
reads ``column``.  These helpers hide that inconsistency from call-sites.
"""
from __future__ import annotations


def col_name(entry: dict) -> str | None:
    """Return the column name from a schema-summary entry, regardless of key."""
    return entry.get("column_name") or entry.get("column")


def schema_columns(schema_summary: list[dict]) -> list[str]:
    """Return a list of column names from a schema_summary list."""
    return [n for n in (col_name(c) for c in schema_summary) if n]


def null_stats(schema_summary: list[dict]) -> list[dict]:
    """Return a list of {column, null_count, null_percentage} dicts."""
    return [
        {
            "column": col_name(c),
            "null_count": c.get("null_count", 0),
            "null_percentage": c.get("null_percentage", c.get("null_pct", 0)),
        }
        for c in schema_summary
    ]

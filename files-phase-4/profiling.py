"""Real Pandas dataset profiling service.

Reads a raw dataset file from disk and computes:
- schema summary (column name, dtype, null count/pct, unique count)
- stats summary (describe() for numeric columns)
- correlation summary (pearson correlation matrix for numeric columns)
- sample rows (head, JSON-safe)

All outputs are plain Python (list/dict) so they serialize directly into
the JSONB columns on `DatasetProfile`.
"""
import math
from typing import Any

import pandas as pd

SAMPLE_ROW_COUNT = 10
MAX_CORRELATION_COLUMNS = 30  # guard against pathological wide datasets


class ProfilingError(ValueError):
    pass


def load_dataframe(path: str, fmt: str) -> pd.DataFrame:
    fmt = fmt.lower().lstrip(".")
    try:
        if fmt == "csv":
            return pd.read_csv(path)
        if fmt == "tsv":
            return pd.read_csv(path, sep="\t")
        if fmt == "json":
            return pd.read_json(path)
        if fmt == "xlsx":
            return pd.read_excel(path)
        if fmt == "parquet":
            return pd.read_parquet(path)
    except Exception as exc:  # pandas raises many different error types
        raise ProfilingError(f"Failed to parse {fmt} file: {exc}") from exc
    raise ProfilingError(f"Unsupported format for profiling: {fmt}")


def _json_safe(value: Any) -> Any:
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    if pd.isna(value) if not isinstance(value, (list, dict)) else False:
        return None
    return value


def _schema_summary(df: pd.DataFrame) -> list[dict]:
    n = len(df)
    summary = []
    for col in df.columns:
        series = df[col]
        null_count = int(series.isna().sum())
        summary.append(
            {
                "column": str(col),
                "dtype": str(series.dtype),
                "null_count": null_count,
                "null_pct": round((null_count / n) * 100, 2) if n else 0.0,
                "unique_count": int(series.nunique(dropna=True)),
            }
        )
    return summary


def _stats_summary(df: pd.DataFrame) -> list[dict]:
    numeric_df = df.select_dtypes(include="number")
    if numeric_df.empty:
        return []
    desc = numeric_df.describe().transpose()
    stats = []
    for col, row in desc.iterrows():
        entry = {"column": str(col)}
        for stat_name, val in row.items():
            entry[str(stat_name)] = _json_safe(float(val)) if pd.notna(val) else None
        stats.append(entry)
    return stats


def _correlation_summary(df: pd.DataFrame) -> list[dict]:
    numeric_df = df.select_dtypes(include="number")
    if numeric_df.shape[1] < 2:
        return []
    if numeric_df.shape[1] > MAX_CORRELATION_COLUMNS:
        numeric_df = numeric_df.iloc[:, :MAX_CORRELATION_COLUMNS]
    corr = numeric_df.corr(numeric_only=True)
    result = []
    for col in corr.columns:
        row = {}
        for other in corr.columns:
            v = corr.loc[col, other]
            row[str(other)] = _json_safe(round(float(v), 4)) if pd.notna(v) else None
        result.append({"column": str(col), "correlations": row})
    return result


def _sample_rows(df: pd.DataFrame) -> list[dict]:
    head = df.head(SAMPLE_ROW_COUNT)
    records = []
    for _, row in head.iterrows():
        record = {str(k): _json_safe(v) for k, v in row.items()}
        records.append(record)
    return records


def profile_dataset(path: str, fmt: str) -> dict:
    """Load a dataset file and compute its full profile.

    Returns a dict with keys: row_count, column_count, schema_summary,
    stats_summary, correlation_summary, sample_rows — ready to persist
    onto Dataset + DatasetProfile rows.
    """
    df = load_dataframe(path, fmt)
    return {
        "row_count": int(len(df)),
        "column_count": int(len(df.columns)),
        "schema_summary": _schema_summary(df),
        "stats_summary": _stats_summary(df),
        "correlation_summary": _correlation_summary(df),
        "sample_rows": _sample_rows(df),
    }

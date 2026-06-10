"""LLM-suggested chart specs executed safely on dataset CSV snapshots."""

from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any

import pandas as pd

from sqlalchemy.orm import Session

import models
from services.enterprise_service import dataset_has_loaded_data

logger = logging.getLogger(__name__)

MAX_ROWS = 10_000
MAX_CHARTS = 4
MAX_POINTS = 24
CACHE_TTL_SECONDS = 300

ALLOWED_CHART_TYPES = frozenset(
    {
        "bar",
        "line",
        "area",
        "pie",
        "donut",
        "histogram",
        "treemap",
        "scatter",
        "radar",
        "radial_bar",
        "composed",
    }
)

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}

_SYSTEM_PROMPT = """You suggest modern data visualizations for business users exploring a dataset table.
Return ONLY valid JSON (no markdown) with this shape:
{
  "charts": [
    {
      "title": "short chart title",
      "chart_type": "area|treemap|scatter|radar|radial_bar|composed|donut|histogram|bar|line|pie",
      "group_by": "column_name",
      "aggregation": "count|sum|avg",
      "value_column": null or column name for sum/avg/scatter y-axis,
      "x_column": null or numeric column for scatter x-axis (defaults to group_by),
      "time_grain": null or "day|month|year" when group_by is a date column,
      "insight": "one sentence explaining the chart"
    }
  ]
}
Chart type guide (pick the best fit — use different types across charts):
- area: time trends (date group_by + count/sum) — modern filled trend
- treemap: categorical composition with relative size
- donut: share breakdown for low-cardinality categories
- radial_bar: ranked categories (top values)
- scatter: relationship between two numeric columns (group_by/x_column + value_column)
- radar: compare up to 6 category buckets on one metric
- composed: category bars for count plus line for avg of a numeric value_column
- histogram: distribution of one numeric column
- bar: general categorical comparison
- line: simple time series when area is not ideal
- pie: only when 3–8 categories
Rules:
- Use only column names from the schema.
- Suggest 3-4 charts with varied chart_type values (avoid repeating the same type).
- aggregation count needs no value_column; sum/avg/scatter/composed need a numeric value_column."""


def _cache_key(dataset_id: int, cache_token: str | None) -> str:
    mtime = 0.0
    if cache_token and not str(cache_token).startswith("db:"):
        if os.path.isfile(cache_token):
            try:
                mtime = os.path.getmtime(cache_token)
            except OSError:
                pass
    elif cache_token and str(cache_token).startswith("db:"):
        mtime = hash(cache_token) % 10_000_000
    return f"{dataset_id}:{cache_token}:{mtime}"


def _looks_like_date(series: pd.Series) -> bool:
    if pd.api.types.is_datetime64_any_dtype(series):
        return True
    sample = series.dropna().astype(str).head(20)
    if sample.empty:
        return False
    parsed = pd.to_datetime(sample, errors="coerce")
    return parsed.notna().mean() >= 0.8


def _column_stats(df: pd.DataFrame) -> list[dict[str, Any]]:
    stats: list[dict[str, Any]] = []
    for col in df.columns:
        s = df[col]
        entry: dict[str, Any] = {
            "name": str(col),
            "dtype": str(s.dtype),
            "null_pct": round(float(s.isna().mean() * 100), 1),
        }
        if pd.api.types.is_numeric_dtype(s):
            entry["kind"] = "numeric"
            if s.notna().any():
                entry["min"] = float(s.min())
                entry["max"] = float(s.max())
        elif _looks_like_date(s):
            entry["kind"] = "date"
        else:
            entry["kind"] = "categorical"
            entry["unique"] = int(s.nunique(dropna=True))
        stats.append(entry)
    return stats


def _parse_llm_json(raw: str) -> list[dict[str, Any]]:
    text = (raw or "").strip()
    if not text:
        return []
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return []
        try:
            payload = json.loads(match.group(0))
        except json.JSONDecodeError:
            return []
    charts = payload.get("charts") if isinstance(payload, dict) else None
    if not isinstance(charts, list):
        return []
    out: list[dict[str, Any]] = []
    for item in charts[:MAX_CHARTS]:
        if not isinstance(item, dict):
            continue
        chart_type = str(item.get("chart_type") or "bar").lower().replace("-", "_")
        if chart_type not in ALLOWED_CHART_TYPES:
            chart_type = "bar"
        out.append(
            {
                "title": str(item.get("title") or "Chart").strip()[:80],
                "chart_type": chart_type,
                "group_by": item.get("group_by"),
                "x_column": item.get("x_column"),
                "aggregation": str(item.get("aggregation") or "count").lower(),
                "value_column": item.get("value_column"),
                "time_grain": item.get("time_grain"),
                "insight": str(item.get("insight") or "").strip()[:200],
            }
        )
    return out


def _call_groq_chart_specs(table_name: str, col_stats: list[dict[str, Any]], row_count: int) -> list[dict[str, Any]]:
    api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("GROQ_API_KEY is not configured")

    from groq import Groq

    from services.groq_description_service import GROQ_DEFAULT_MODEL, GROQ_TIMEOUT_SECONDS

    model = (os.environ.get("GROQ_MODEL") or GROQ_DEFAULT_MODEL).strip()
    client = Groq(api_key=api_key, timeout=GROQ_TIMEOUT_SECONDS + 10, max_retries=0)

    user_lines = [
        f"Table: {table_name}",
        f"Row count (sample up to {MAX_ROWS}): {row_count}",
        "Columns:",
    ]
    for c in col_stats:
        extra = ""
        if c.get("kind") == "categorical":
            extra = f", unique={c.get('unique')}"
        elif c.get("kind") == "numeric":
            extra = f", min={c.get('min')}, max={c.get('max')}"
        user_lines.append(f"- {c['name']} ({c['kind']}{extra})")

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": "\n".join(user_lines)},
        ],
        temperature=0.2,
        max_tokens=900,
        response_format={"type": "json_object"},
    )

    raw = ""
    if response.choices:
        raw = (response.choices[0].message.content or "").strip()
    specs = _parse_llm_json(raw)
    if not specs:
        raise ValueError("Empty chart specs from Groq")
    return specs


def _heuristic_specs(col_stats: list[dict[str, Any]]) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []
    cats = [
        c
        for c in col_stats
        if c.get("kind") == "categorical" and int(c.get("unique") or 0) <= 50 and int(c.get("unique") or 0) > 0
    ]
    dates = [c for c in col_stats if c.get("kind") == "date"]
    nums = [c for c in col_stats if c.get("kind") == "numeric"]

    if dates:
        col = dates[0]["name"]
        specs.append(
            {
                "title": f"Trend over time ({col})",
                "chart_type": "area",
                "group_by": col,
                "aggregation": "count",
                "value_column": None,
                "x_column": None,
                "time_grain": "month",
                "insight": f"Volume trend by {col}.",
            }
        )
    if cats:
        col = cats[0]["name"]
        specs.append(
            {
                "title": f"Composition by {col}",
                "chart_type": "treemap",
                "group_by": col,
                "aggregation": "count",
                "value_column": None,
                "x_column": None,
                "time_grain": None,
                "insight": f"Relative size of each {col} bucket.",
            }
        )
    if len(nums) >= 2 and len(specs) < MAX_CHARTS:
        specs.append(
            {
                "title": f"{nums[0]['name']} vs {nums[1]['name']}",
                "chart_type": "scatter",
                "group_by": nums[0]["name"],
                "x_column": nums[0]["name"],
                "aggregation": "count",
                "value_column": nums[1]["name"],
                "time_grain": None,
                "insight": f"Correlation between {nums[0]['name']} and {nums[1]['name']}.",
            }
        )
    elif nums and len(specs) < MAX_CHARTS:
        col = nums[0]["name"]
        specs.append(
            {
                "title": f"Distribution of {col}",
                "chart_type": "histogram",
                "group_by": col,
                "aggregation": "count",
                "value_column": col,
                "x_column": None,
                "time_grain": None,
                "insight": f"Spread of values in {col}.",
            }
        )
    if cats and nums and len(specs) < MAX_CHARTS:
        specs.append(
            {
                "title": f"Count & avg {nums[0]['name']} by {cats[0]['name']}",
                "chart_type": "composed",
                "group_by": cats[0]["name"],
                "aggregation": "count",
                "value_column": nums[0]["name"],
                "x_column": None,
                "time_grain": None,
                "insight": f"Volume and average {nums[0]['name']} per {cats[0]['name']}.",
            }
        )
    elif cats and len(cats) > 1 and len(specs) < MAX_CHARTS:
        col = cats[1]["name"]
        specs.append(
            {
                "title": f"Top categories ({col})",
                "chart_type": "radial_bar",
                "group_by": col,
                "aggregation": "count",
                "value_column": None,
                "x_column": None,
                "time_grain": None,
                "insight": f"Ranked breakdown by {col}.",
            }
        )
    return specs[:MAX_CHARTS]


def _group_series(df: pd.DataFrame, group_by: str, time_grain: str | None) -> pd.Series:
    col = df[group_by]
    if time_grain and _looks_like_date(col):
        dt = pd.to_datetime(col, errors="coerce")
        grain = (time_grain or "month").lower()
        if grain == "year":
            return dt.dt.to_period("Y").astype(str)
        if grain == "day":
            return dt.dt.date.astype(str)
        return dt.dt.to_period("M").astype(str)
    return col.fillna("(blank)").astype(str)


def _aggregate_grouped(
    work: pd.DataFrame,
    agg: str,
    val_col: str | None,
) -> pd.Series:
    if agg == "count":
        return work.groupby("_group_key", dropna=False).size()
    if agg in ("sum", "avg"):
        if not val_col:
            return work.groupby("_group_key", dropna=False).size()
        work["_metric"] = pd.to_numeric(work[val_col], errors="coerce")
        return work.groupby("_group_key", dropna=False)["_metric"].agg(agg)
    return work.groupby("_group_key", dropna=False).size()


def _points_from_grouped(
    grouped: pd.Series,
    agg: str,
    *,
    chart_type: str,
    sort_by_value: bool = True,
) -> list[dict[str, Any]]:
    if chart_type in ("pie", "donut", "treemap", "radar", "radial_bar"):
        grouped = grouped.nlargest(min(8 if chart_type != "radar" else 6, len(grouped)))
    elif sort_by_value and chart_type not in ("line", "area"):
        grouped = grouped.sort_values(ascending=False)
    else:
        grouped = grouped.sort_index()

    points: list[dict[str, Any]] = []
    for key, val in grouped.items():
        if pd.isna(val):
            continue
        num = float(val)
        points.append({"label": str(key), "value": round(num, 2) if agg in ("avg", "sum") else int(num)})
    return points[:MAX_POINTS]


def _execute_spec(df: pd.DataFrame, spec: dict[str, Any], colnames: set[str]) -> list[dict[str, Any]] | None:
    chart_type = spec.get("chart_type") or "bar"
    agg = str(spec.get("aggregation") or "count").lower()

    if chart_type == "scatter":
        x_col = spec.get("x_column") or spec.get("group_by")
        y_col = spec.get("value_column")
        if not x_col or not y_col or x_col not in colnames or y_col not in colnames:
            return None
        xs = pd.to_numeric(df[x_col], errors="coerce")
        ys = pd.to_numeric(df[y_col], errors="coerce")
        mask = xs.notna() & ys.notna()
        sample = df.loc[mask].head(MAX_POINTS)
        if sample.empty:
            return None
        points: list[dict[str, Any]] = []
        for i, row in sample.iterrows():
            x = float(pd.to_numeric(row[x_col], errors="coerce"))
            y = float(pd.to_numeric(row[y_col], errors="coerce"))
            points.append({"label": str(i), "x": round(x, 4), "y": round(y, 4)})
        return points

    if chart_type == "composed":
        group_by = spec.get("group_by")
        val_col = spec.get("value_column")
        if not group_by or group_by not in colnames or not val_col or val_col not in colnames:
            return None
        work = df.copy()
        work["_group_key"] = _group_series(df, group_by, spec.get("time_grain"))
        counts = work.groupby("_group_key", dropna=False).size()
        work["_metric"] = pd.to_numeric(work[val_col], errors="coerce")
        avgs = work.groupby("_group_key", dropna=False)["_metric"].mean()
        merged = counts.to_frame("value").join(avgs.rename("secondary"), how="inner")
        merged = merged.sort_values("value", ascending=False).head(MAX_POINTS)
        points = []
        for key, row in merged.iterrows():
            points.append(
                {
                    "label": str(key),
                    "value": int(row["value"]),
                    "secondary": round(float(row["secondary"]), 2) if pd.notna(row["secondary"]) else 0,
                }
            )
        return points or None

    if chart_type == "histogram":
        col = spec.get("value_column") or spec.get("group_by")
        if not col or col not in colnames:
            return None
        numeric = pd.to_numeric(df[col], errors="coerce").dropna()
        if numeric.empty:
            return None
        bins = min(12, max(5, len(numeric) // 8))
        intervals = pd.cut(numeric, bins=bins)
        grouped = intervals.value_counts().sort_index()
        points: list[dict[str, Any]] = []
        for interval, count in grouped.items():
            left = interval.left
            right = interval.right
            label = f"{left:.2g}–{right:.2g}" if pd.notna(left) and pd.notna(right) else str(interval)
            points.append({"label": label, "value": int(count)})
        return points[:MAX_POINTS]

    group_by = spec.get("group_by")
    if not group_by or group_by not in colnames:
        return None

    keys = _group_series(df, group_by, spec.get("time_grain"))
    work = df.copy()
    work["_group_key"] = keys

    val_col = spec.get("value_column")
    if agg in ("sum", "avg") and (not val_col or val_col not in colnames):
        return None

    grouped = _aggregate_grouped(work, agg, val_col if isinstance(val_col, str) else None)
    time_series = chart_type in ("line", "area") or bool(spec.get("time_grain"))
    points = _points_from_grouped(grouped, agg, chart_type=chart_type, sort_by_value=not time_series)
    return points or None


def build_dataset_chart_insights(
    db: Session,
    dataset_id: int,
    *,
    refresh: bool = False,
) -> dict[str, Any]:
    row = db.query(models.EnterpriseDataset).filter(models.EnterpriseDataset.id == dataset_id).first()
    if not row:
        return {"ok": False, "error": "Dataset not found"}

    from services import business_user_service as busvc

    job_id = row.job_id or busvc._resolve_job_id(db, row)
    if not job_id or not dataset_has_loaded_data(db, job_id):
        return {
            "ok": True,
            "dataset_id": dataset_id,
            "charts": [],
            "source": "none",
            "message": "Load data first (run import or refresh) to generate charts.",
        }

    table = (
        db.query(models.TableMetadata)
        .filter(models.TableMetadata.job_id == job_id)
        .order_by(models.TableMetadata.table_id.asc())
        .first()
    )
    if not table:
        return {"ok": True, "dataset_id": dataset_id, "charts": [], "source": "none", "message": "No tables on linked job."}

    from services.dataset_row_storage_service import load_snapshot_with_csv_fallback

    cache_path = f"db:{job_id}:{table.table_id}:{table.data_updated_at}"
    key = _cache_key(dataset_id, cache_path)
    if not refresh:
        cached = _CACHE.get(key)
        if cached and (time.time() - cached[0]) < CACHE_TTL_SECONDS:
            return cached[1]

    try:
        df = load_snapshot_with_csv_fallback(
            db, job_id, table.table_name, table_id=table.table_id, nrows=MAX_ROWS
        )
        if df is None:
            return {
                "ok": True,
                "dataset_id": dataset_id,
                "charts": [],
                "source": "none",
                "message": "Dataset snapshot not found.",
            }
    except Exception as exc:
        logger.warning("chart insights csv read failed dataset=%s: %s", dataset_id, exc)
        return {"ok": False, "dataset_id": dataset_id, "charts": [], "error": "Failed to read dataset file."}

    if df.empty:
        return {"ok": True, "dataset_id": dataset_id, "charts": [], "source": "none", "message": "Dataset file is empty."}

    col_stats = _column_stats(df)
    colnames = {str(c) for c in df.columns}
    source = "heuristic"
    llm_error: str | None = None

    try:
        specs = _call_groq_chart_specs(table.table_name, col_stats, len(df))
        source = "llm"
    except Exception as exc:
        llm_error = str(exc)
        logger.info("LLM chart specs fallback dataset=%s: %s", dataset_id, exc)
        specs = _heuristic_specs(col_stats)

    charts_out: list[dict[str, Any]] = []
    for idx, spec in enumerate(specs):
        points = _execute_spec(df, spec, colnames)
        if not points:
            continue
        charts_out.append(
            {
                "id": f"chart-{idx + 1}",
                "title": spec.get("title") or "Chart",
                "chart_type": spec.get("chart_type") or "bar",
                "insight": spec.get("insight") or "",
                "query": {
                    "group_by": spec.get("group_by"),
                    "x_column": spec.get("x_column"),
                    "aggregation": spec.get("aggregation"),
                    "value_column": spec.get("value_column"),
                    "time_grain": spec.get("time_grain"),
                },
                "data": points,
            }
        )

    result: dict[str, Any] = {
        "ok": True,
        "dataset_id": dataset_id,
        "table_name": table.table_name,
        "row_count": int(table.row_count or len(df)),
        "charts": charts_out,
        "source": source,
        "message": None,
    }
    if llm_error and source == "heuristic":
        result["llm_unavailable"] = llm_error

    _CACHE[key] = (time.time(), result)
    return result

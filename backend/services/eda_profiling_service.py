"""Generate EDA HTML reports with ydata-profiling from ingested job CSV snapshots."""

from __future__ import annotations

import os

import pandas as pd
from sqlalchemy.orm import Session

import models
from utils.upload_paths import resolve_table_csv_path


def _first_table_with_data(db: Session, job_id: int) -> tuple[str, str] | None:
    tables = (
        db.query(models.TableMetadata)
        .filter(models.TableMetadata.job_id == job_id)
        .order_by(models.TableMetadata.table_id.asc())
        .all()
    )
    for t in tables:
        path = resolve_table_csv_path(job_id, t.table_name)
        if path and os.path.isfile(path) and os.path.getsize(path) > 0:
            return t.table_name, path
    return None


def build_ydata_profiling_html(db: Session, job_id: int, *, max_rows: int = 50_000) -> str:
    picked = _first_table_with_data(db, job_id)
    if not picked:
        raise ValueError("no_data")
    table_name, csv_path = picked
    df = pd.read_csv(csv_path, nrows=max_rows)
    if df.empty:
        raise ValueError("empty_data")

    try:
        from ydata_profiling import ProfileReport
    except ImportError as exc:
        msg = str(exc)
        if "pkg_resources" in msg:
            raise RuntimeError(
                "ydata-profiling needs setuptools with pkg_resources (pin setuptools<82 in requirements)."
            ) from exc
        raise RuntimeError(
            "ydata-profiling is not installed on the API server. Add ydata-profiling to backend requirements."
        ) from exc

    title = f"EDA — {table_name} (job #{job_id})"
    profile = ProfileReport(
        df,
        title=title,
        explorative=True,
        minimal=len(df) > 20_000,
        pool_size=1,
    )
    return profile.to_html()

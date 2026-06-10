"""Generate EDA HTML reports with ydata-profiling from ingested job CSV snapshots."""

from __future__ import annotations

import glob
import os

import pandas as pd
from sqlalchemy.orm import Session

import models
from utils.upload_paths import eda_cache_dir, resolve_table_csv_path


def _first_table_with_data(db: Session, job_id: int) -> tuple[str, str] | None:
    from services.dataset_row_storage_service import has_db_snapshot, snapshot_exists

    tables = (
        db.query(models.TableMetadata)
        .filter(models.TableMetadata.job_id == job_id)
        .order_by(models.TableMetadata.table_id.asc())
        .all()
    )
    for t in tables:
        if has_db_snapshot(db, job_id, t.table_id):
            token = f"db:{job_id}:{t.table_id}:{t.data_updated_at}"
            return t.table_name, token
        path = resolve_table_csv_path(job_id, t.table_name)
        if path and os.path.isfile(path) and os.path.getsize(path) > 0:
            return t.table_name, path
    return None


def _csv_cache_key(csv_path: str) -> str:
    if str(csv_path).startswith("db:"):
        return csv_path.replace(":", "_")
    st = os.stat(csv_path)
    return f"{st.st_size}_{getattr(st, 'st_mtime_ns', int(st.st_mtime * 1e9))}"


def _safe_table_slug(table_name: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in table_name)[:120]


def _eda_cache_path(job_id: int, table_name: str, cache_key: str) -> str:
    base = eda_cache_dir(job_id)
    return os.path.join(base, f"{_safe_table_slug(table_name)}_{cache_key}.html")


def _prune_stale_eda_cache(job_id: int, table_name: str, keep_path: str) -> None:
    base = eda_cache_dir(job_id)
    if not os.path.isdir(base):
        return
    slug = _safe_table_slug(table_name)
    for path in glob.glob(os.path.join(base, f"{slug}_*.html")):
        if os.path.abspath(path) != os.path.abspath(keep_path):
            try:
                os.remove(path)
            except OSError:
                pass


def invalidate_eda_cache_for_job(job_id: int) -> None:
    """Drop cached EDA HTML after refresh/import updates dataset snapshots."""
    base = eda_cache_dir(job_id)
    if not os.path.isdir(base):
        return
    for path in glob.glob(os.path.join(base, "*.html")):
        try:
            os.remove(path)
        except OSError:
            pass


def _generate_profile_html(df: pd.DataFrame, *, title: str, table_name: str) -> str:
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

    row_count = len(df)
    # Minimal mode is much faster; full explorative reports are for ad-hoc analysis only.
    use_minimal = row_count > 500
    profile = ProfileReport(
        df,
        title=title,
        explorative=False,
        minimal=use_minimal,
        pool_size=1,
        progress_bar=False,
    )
    return profile.to_html()


def build_ydata_profiling_html(
    db: Session,
    job_id: int,
    *,
    max_rows: int = 15_000,
    use_cache: bool = True,
) -> tuple[str, bool]:
    """
    Return (html, from_cache).
    Disk cache key follows CSV size + mtime so refresh/import invalidates automatically.
    """
    picked = _first_table_with_data(db, job_id)
    if not picked:
        raise ValueError("no_data")
    table_name, csv_path = picked
    cache_key = _csv_cache_key(csv_path)
    cache_path = _eda_cache_path(job_id, table_name, cache_key)

    if use_cache and os.path.isfile(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            return f.read(), True

    if str(csv_path).startswith("db:"):
        from services.dataset_row_storage_service import load_snapshot_with_csv_fallback

        tbl = (
            db.query(models.TableMetadata)
            .filter(models.TableMetadata.job_id == job_id, models.TableMetadata.table_name == table_name)
            .first()
        )
        df = load_snapshot_with_csv_fallback(
            db, job_id, table_name, table_id=tbl.table_id if tbl else None, nrows=max_rows
        )
    else:
        df = pd.read_csv(csv_path, nrows=max_rows)
    if df.empty:
        raise ValueError("empty_data")

    title = f"EDA — {table_name} (job #{job_id})"
    html = _generate_profile_html(df, title=title, table_name=table_name)

    _prune_stale_eda_cache(job_id, table_name, cache_path)
    with open(cache_path, "w", encoding="utf-8") as f:
        f.write(html)

    return html, False


def prewarm_eda_cache_for_job(db: Session, job_id: int) -> bool:
    """Build disk cache in background after import so first EDA open is fast."""
    try:
        _, from_cache = build_ydata_profiling_html(db, job_id, use_cache=True)
        return from_cache or True
    except Exception:
        return False

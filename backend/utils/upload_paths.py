"""Legacy uploads CSV paths (read-only fallback) and local cache for temp/EDA/join files.

Dataset row data is stored in PostgreSQL (metadata.dataset_rows). Nothing new is written
under uploads/ — only legacy jobs may still have CSV files there for backward compatibility.
"""

from __future__ import annotations

import os
import shutil

_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_ROOT = os.path.join(_BACKEND_ROOT, "uploads")
CACHE_ROOT = os.path.join(_BACKEND_ROOT, ".cache")


def ensure_cache_subdir(*parts: str) -> str:
    path = os.path.join(CACHE_ROOT, *parts)
    os.makedirs(path, exist_ok=True)
    return path


def ensure_upload_root() -> str:
    """Legacy uploads root — not created automatically for new datasets."""
    return UPLOAD_ROOT


def ensure_job_upload_dir(job_id: int) -> str:
    """Legacy per-job uploads folder — avoid calling for new writes."""
    path = os.path.join(UPLOAD_ROOT, f"job_{job_id}")
    return path


def table_csv_path(job_id: int, table_name: str) -> str:
    """Legacy canonical CSV path (read fallback only)."""
    return os.path.join(UPLOAD_ROOT, f"job_{job_id}", f"{table_name}.csv")


def legacy_table_csv_path(table_name: str) -> str:
    """Old flat layout (shared across jobs) — read-only fallback."""
    return os.path.join(UPLOAD_ROOT, f"{table_name}.csv")


def job_temp_upload_path(job_id: int, filename: str) -> str:
    """Temporary upload staging — stored under .cache, not uploads/."""
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in (filename or "upload"))[:200]
    base = ensure_cache_subdir("tmp", f"job_{job_id}")
    return os.path.join(base, f"tmp_{safe}")


def eda_cache_dir(job_id: int) -> str:
    """EDA HTML report cache — stored under .cache, not uploads/."""
    return ensure_cache_subdir("eda", f"job_{job_id}")


def join_source_cache_path(job_id: int, join_id: str) -> str:
    """Cached join source file — stored under .cache, not uploads/."""
    return os.path.join(ensure_cache_subdir("joins", f"job_{job_id}"), f"join_{join_id}.csv")


def resolve_table_csv_path(job_id: int, table_name: str) -> str | None:
    """Prefer job-scoped file; fall back to legacy path for older data."""
    scoped = table_csv_path(job_id, table_name)
    if os.path.isfile(scoped):
        return scoped
    legacy = legacy_table_csv_path(table_name)
    if os.path.isfile(legacy):
        return legacy
    return None


def rename_table_csv(job_id: int, old_name: str, new_name: str) -> None:
    """Rename legacy CSV within job folder (and flat path if present)."""
    for old_path, new_path in (
        (table_csv_path(job_id, old_name), table_csv_path(job_id, new_name)),
        (legacy_table_csv_path(old_name), legacy_table_csv_path(new_name)),
    ):
        if os.path.isfile(old_path):
            os.makedirs(os.path.dirname(new_path), exist_ok=True)
            try:
                if os.path.isfile(new_path):
                    os.remove(new_path)
                os.rename(old_path, new_path)
            except OSError:
                shutil.copy2(old_path, new_path)
                try:
                    os.remove(old_path)
                except OSError:
                    pass

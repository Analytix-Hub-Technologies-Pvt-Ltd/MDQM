"""Per-job CSV storage so the same table/file name can exist on multiple jobs independently."""

from __future__ import annotations

import os
import shutil

UPLOAD_ROOT = "uploads"


def ensure_upload_root() -> str:
    os.makedirs(UPLOAD_ROOT, exist_ok=True)
    return UPLOAD_ROOT


def ensure_job_upload_dir(job_id: int) -> str:
    ensure_upload_root()
    path = os.path.join(UPLOAD_ROOT, f"job_{job_id}")
    os.makedirs(path, exist_ok=True)
    return path


def table_csv_path(job_id: int, table_name: str) -> str:
    """Canonical CSV path for a table on a specific job."""
    return os.path.join(ensure_job_upload_dir(job_id), f"{table_name}.csv")


def legacy_table_csv_path(table_name: str) -> str:
    """Old flat layout (shared across jobs) — read-only fallback."""
    return os.path.join(UPLOAD_ROOT, f"{table_name}.csv")


def job_temp_upload_path(job_id: int, filename: str) -> str:
    return os.path.join(ensure_job_upload_dir(job_id), f"tmp_{filename}")


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
    """Rename CSV within this job's folder (and legacy path if present)."""
    for old_path, new_path in (
        (table_csv_path(job_id, old_name), table_csv_path(job_id, new_name)),
        (legacy_table_csv_path(old_name), legacy_table_csv_path(new_name)),
    ):
        if os.path.isfile(old_path):
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

"""Legacy uploads CSV paths (read-only fallback) and local cache for temp/EDA/join files.

Dataset row data is stored in PostgreSQL (raw schema / metadata). Nothing new is written
under uploads/ — only legacy jobs may still have CSV files there for backward compatibility.

Per-user original files are archived under Upload/{username}/yyyy/mm/ for audit browsing.
"""

from __future__ import annotations

import os
import shutil
from datetime import datetime

_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_ROOT = os.path.join(_BACKEND_ROOT, "uploads")
USER_UPLOAD_ROOT = os.path.join(_BACKEND_ROOT, "Upload")
CACHE_ROOT = os.path.join(_BACKEND_ROOT, ".cache")


def safe_path_segment(value: str | None, *, fallback: str = "file", max_len: int = 120) -> str:
    """Sanitize a path segment (username or filename piece)."""
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in (value or fallback))
    safe = safe.strip("._-") or fallback
    return safe[:max_len]


def ensure_cache_subdir(*parts: str) -> str:
    path = os.path.join(CACHE_ROOT, *parts)
    os.makedirs(path, exist_ok=True)
    return path


def ensure_upload_root() -> str:
    """Legacy uploads root — not created automatically for new datasets."""
    return UPLOAD_ROOT


def ensure_user_upload_root() -> str:
    """Per-user archive root: backend/Upload/{role}/{user}/..."""
    os.makedirs(USER_UPLOAD_ROOT, exist_ok=True)
    return USER_UPLOAD_ROOT


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
    safe = safe_path_segment(filename, fallback="upload", max_len=200)
    base = ensure_cache_subdir("tmp", f"job_{job_id}")
    return os.path.join(base, f"tmp_{safe}")


def job_source_upload_path(job_id: int, table_id: int, filename: str) -> str:
    """Persistent server-side copy of a browser-uploaded source file."""
    safe = safe_path_segment(filename, fallback="source.csv", max_len=200)
    base = ensure_cache_subdir("sources", f"job_{job_id}")
    return os.path.join(base, f"table_{table_id}_{safe}")


# Dashboard / role folder labels under Upload/ (readable in Explorer)
ROLE_UPLOAD_FOLDER = {
    "ADMIN": "Admin",
    "CDO": "CDO",
    "DATA_STEWARD": "Data_Steward",
    "DATA_OWNER": "Data_Owner",
    "DEVELOPER": "Developer",
    "AUDITOR": "Auditor",
    "ANALYST": "Analyst",
    "BUSINESS_USER": "Business_User",
}


def role_upload_folder(role: str | None) -> str:
    """Map auth role → Upload/{Role}/ folder name."""
    key = (role or "UNKNOWN").strip().upper()
    aliases = {
        "OWNER": "DATA_OWNER",
        "STEWARD": "DATA_STEWARD",
        "BU": "BUSINESS_USER",
        "BUSINESS": "BUSINESS_USER",
    }
    key = aliases.get(key, key)
    return ROLE_UPLOAD_FOLDER.get(key, safe_path_segment(key, fallback="Unknown_Role", max_len=40))


def user_upload_dir(
    username: str,
    *,
    role: str | None = None,
    when: datetime | None = None,
) -> str:
    """Directory Upload/{Role}/{username}/yyyy/mm/ — created if missing."""
    stamp = when or datetime.utcnow()
    role_folder = role_upload_folder(role)
    user_folder = safe_path_segment(username, fallback="anonymous", max_len=80)
    path = os.path.join(
        ensure_user_upload_root(),
        role_folder,
        user_folder,
        f"{stamp:%Y}",
        f"{stamp:%m}",
    )
    os.makedirs(path, exist_ok=True)
    return path


def user_upload_archive_path(
    username: str,
    original_filename: str,
    *,
    role: str | None = None,
    when: datetime | None = None,
) -> tuple[str, str, str]:
    """Return (absolute_path, relative_path from backend root, stored_filename).

    Layout: Upload/{Role}/{user}/yyyy/mm/{yyyymmdd_HHMMSS}_{safe_original}
    Example: Upload/Data_Owner/dataowner/2026/08/20260806_110000_customers.csv
    """
    stamp = when or datetime.utcnow()
    original = os.path.basename(original_filename or "upload.csv")
    safe_name = safe_path_segment(original, fallback="upload.csv", max_len=160)
    stored_filename = f"{stamp:%Y%m%d_%H%M%S}_{safe_name}"
    abs_path = os.path.join(user_upload_dir(username, role=role, when=stamp), stored_filename)
    rel_path = os.path.relpath(abs_path, _BACKEND_ROOT).replace("\\", "/")
    return abs_path, rel_path, stored_filename


def eda_cache_dir(job_id: int) -> str:
    """EDA HTML report cache — stored under .cache, not uploads/."""
    return ensure_cache_subdir("eda", f"job_{job_id}")


def join_source_cache_path(job_id: int, join_id: str, *, ext: str | None = None) -> str:
    """Cached join source file — stored under .cache, not uploads/."""
    suffix = (ext or ".csv").strip()
    if not suffix.startswith("."):
        suffix = f".{suffix}"
    if suffix.lower() not in (".csv", ".xlsx", ".xls"):
        suffix = ".csv"
    return os.path.join(ensure_cache_subdir("joins", f"job_{job_id}"), f"join_{join_id}{suffix}")


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

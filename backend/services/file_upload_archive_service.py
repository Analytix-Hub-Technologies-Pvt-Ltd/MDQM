"""Archive original CSV/Excel uploads under backend/Upload/{Role}/{user}/ and record in DB.

Do not confuse with legacy backend/uploads/job_* (old flat / job-scoped CSVs).
New files are always stored as:
  Upload/Data_Owner/dataowner/2026/08/20260806_110000_customers.csv
  Upload/Admin/admin/2026/08/...
"""

from __future__ import annotations

import logging
import os
import shutil
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

import models
from utils.upload_paths import role_upload_folder, user_upload_archive_path

logger = logging.getLogger(__name__)


def resolve_upload_identity(
    user: models.User | None,
    user_id: int | None = None,
) -> tuple[str, str]:
    """Return (folder_username, auth_role) for Upload/{Role}/{username}/."""
    role = "UNKNOWN"
    if user is not None:
        role = (getattr(user, "role", None) or "UNKNOWN").strip().upper() or "UNKNOWN"
        username = (getattr(user, "username", None) or "").strip()
        if username:
            return username, role
        email = (getattr(user, "email", None) or "").strip()
        if email and "@" in email:
            return email.split("@", 1)[0], role
        if email:
            return email, role
        uid = getattr(user, "id", None)
        if uid is not None:
            return f"user_{uid}", role
    if user_id is not None:
        return f"user_{user_id}", role
    return "anonymous", role


def resolve_upload_folder_name(user: models.User | None, user_id: int | None = None) -> str:
    """Backward-compatible single-segment name (username only). Prefer resolve_upload_identity."""
    username, _role = resolve_upload_identity(user, user_id)
    return username


def dataset_id_for_job(db: Session, job_id: int | None) -> int | None:
    if job_id is None:
        return None
    row = (
        db.query(models.EnterpriseDataset.id)
        .filter(
            models.EnterpriseDataset.job_id == job_id,
            models.EnterpriseDataset.deleted_at.is_(None),
        )
        .order_by(models.EnterpriseDataset.id.desc())
        .first()
    )
    return int(row[0]) if row else None


def ensure_uploads_user_role_column(db: Session) -> None:
    """Add user_role column if missing (create_all does not alter existing tables)."""
    try:
        db.execute(
            text(
                "ALTER TABLE datasets.uploads "
                "ADD COLUMN IF NOT EXISTS user_role TEXT"
            )
        )
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass


def _patch_datasource_source_file(
    db: Session,
    *,
    dataset_id: int | None,
    datasource_id: int | None,
    relative_path: str,
    original_filename: str,
    absolute_path: str,
) -> int | None:
    """Best-effort: set datasources.source_file to the Upload/ archive path."""
    row = None
    if datasource_id is not None:
        row = db.query(models.DataSource).filter(models.DataSource.id == datasource_id).first()
    elif dataset_id is not None:
        candidates = (
            db.query(models.DataSource)
            .filter(
                models.DataSource.dataset_id == dataset_id,
                models.DataSource.source_type == "file",
            )
            .order_by(models.DataSource.id.desc())
            .limit(8)
            .all()
        )
        base = os.path.basename(original_filename or "")
        for c in candidates:
            sf = (c.source_file or "").strip()
            if not sf or sf == base or sf.endswith(base) or "Upload/" not in sf.replace("\\", "/"):
                row = c
                break
        if row is None and candidates:
            row = candidates[0]

    if row is None:
        return None

    row.source_file = relative_path
    mapping = dict(row.mapping_config) if isinstance(row.mapping_config, dict) else {}
    mapping["file_name"] = original_filename
    mapping["upload_relative_path"] = relative_path
    mapping["upload_absolute_path"] = absolute_path
    row.mapping_config = mapping
    row.updated_date = datetime.utcnow()
    return int(row.id)


def archive_user_upload(
    db: Session,
    *,
    source_path: str,
    original_filename: str | None = None,
    user: models.User | None = None,
    user_id: int | None = None,
    job_id: int | None = None,
    dataset_id: int | None = None,
    datasource_id: int | None = None,
    table_id: int | None = None,
    source_role: str = "primary",
    commit: bool = True,
    patch_datasource: bool = True,
) -> dict[str, Any] | None:
    """Copy a file into Upload/{Role}/{user}/yyyy/mm/ and insert datasets.uploads.

    Returns a summary dict, or None if source is missing / copy fails (non-fatal).
    """
    if not source_path or not os.path.isfile(source_path):
        logger.warning("archive_user_upload: source missing path=%s", source_path)
        return None

    try:
        ensure_uploads_user_role_column(db)
        uid = user_id if user_id is not None else (getattr(user, "id", None) if user else None)
        folder_name, auth_role = resolve_upload_identity(user, uid)
        role_folder = role_upload_folder(auth_role)
        original = os.path.basename(original_filename or source_path) or "upload.csv"
        abs_path, rel_path, stored_filename = user_upload_archive_path(
            folder_name,
            original,
            role=auth_role,
        )
        shutil.copy2(source_path, abs_path)

        size = None
        try:
            size = int(os.path.getsize(abs_path))
        except OSError:
            pass

        _, ext = os.path.splitext(original)
        ds_id = dataset_id if dataset_id is not None else dataset_id_for_job(db, job_id)

        linked_ds_id = datasource_id
        if patch_datasource:
            linked = _patch_datasource_source_file(
                db,
                dataset_id=ds_id,
                datasource_id=datasource_id,
                relative_path=rel_path,
                original_filename=original,
                absolute_path=abs_path,
            )
            if linked is not None:
                linked_ds_id = linked

        safe_uid = uid
        if uid is not None:
            if not db.query(models.User.id).filter(models.User.id == uid).first():
                safe_uid = None

        row = models.FileUpload(
            user_id=safe_uid,
            username=folder_name,
            user_role=auth_role,
            original_filename=original,
            stored_filename=stored_filename,
            relative_path=rel_path,
            absolute_path=abs_path,
            file_ext=(ext or "").lstrip(".").lower() or None,
            file_size_bytes=size,
            dataset_id=ds_id,
            job_id=job_id,
            datasource_id=linked_ds_id,
            table_id=table_id,
            source_role=(source_role or "primary")[:40],
            uploaded_at=datetime.utcnow(),
        )
        db.add(row)
        if commit:
            db.commit()
            db.refresh(row)
        else:
            db.flush()

        logger.info(
            "Archived upload → %s (role=%s user=%s job=%s)",
            rel_path,
            role_folder,
            folder_name,
            job_id,
        )
        return {
            "id": row.id,
            "user_id": safe_uid,
            "username": folder_name,
            "user_role": auth_role,
            "role_folder": role_folder,
            "original_filename": original,
            "stored_filename": stored_filename,
            "relative_path": rel_path,
            "absolute_path": abs_path,
            "file_size_bytes": size,
            "dataset_id": ds_id,
            "job_id": job_id,
            "datasource_id": linked_ds_id,
            "table_id": table_id,
            "source_role": source_role,
        }
    except Exception:
        logger.exception(
            "archive_user_upload failed job_id=%s file=%s",
            job_id,
            original_filename or source_path,
        )
        try:
            db.rollback()
        except Exception:
            pass
        return None

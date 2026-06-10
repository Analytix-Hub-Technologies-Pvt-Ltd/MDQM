"""Store ingested dataset rows in PostgreSQL (metadata.dataset_rows) instead of uploads CSV."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from sqlalchemy.orm import Session

import models

logger = logging.getLogger(__name__)

INSERT_CHUNK = 1500


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _json_cell(value: Any) -> Any:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    if isinstance(value, (datetime,)):
        return value.isoformat()
    return value


def _row_dicts(df: pd.DataFrame) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for row in df.to_dict(orient="records"):
        records.append({str(k): _json_cell(v) for k, v in row.items()})
    return records


def has_db_snapshot(db: Session, job_id: int, table_id: int) -> bool:
    return (
        db.query(models.DatasetRow.id)
        .filter(
            models.DatasetRow.job_id == job_id,
            models.DatasetRow.table_id == table_id,
        )
        .first()
        is not None
    )


def delete_snapshot(db: Session, job_id: int, table_id: int) -> None:
    db.query(models.DatasetRow).filter(
        models.DatasetRow.job_id == job_id,
        models.DatasetRow.table_id == table_id,
    ).delete(synchronize_session=False)


def save_dataframe(
    db: Session,
    job_id: int,
    table_id: int,
    df: pd.DataFrame,
    *,
    commit: bool = False,
) -> int:
    """Replace all rows for a job/table with the dataframe contents."""
    delete_snapshot(db, job_id, table_id)
    row_count = int(len(df))
    if row_count == 0:
        tbl = (
            db.query(models.TableMetadata)
            .filter(
                models.TableMetadata.job_id == job_id,
                models.TableMetadata.table_id == table_id,
            )
            .first()
        )
        if tbl:
            tbl.row_count = 0
            tbl.data_updated_at = _utc_now()
        if commit:
            db.commit()
        return 0

    records = _row_dicts(df)
    for start in range(0, len(records), INSERT_CHUNK):
        chunk = records[start : start + INSERT_CHUNK]
        mappings = [
            {
                "job_id": job_id,
                "table_id": table_id,
                "row_index": start + i,
                "row_data": row,
            }
            for i, row in enumerate(chunk)
        ]
        db.bulk_insert_mappings(models.DatasetRow, mappings)

    tbl = (
        db.query(models.TableMetadata)
        .filter(
            models.TableMetadata.job_id == job_id,
            models.TableMetadata.table_id == table_id,
        )
        .first()
    )
    if tbl:
        tbl.row_count = row_count
        tbl.data_updated_at = _utc_now()

    if commit:
        db.commit()
    return row_count


def load_dataframe(
    db: Session,
    job_id: int,
    table_id: int,
    *,
    nrows: int | None = None,
) -> pd.DataFrame | None:
    q = (
        db.query(models.DatasetRow.row_data)
        .filter(
            models.DatasetRow.job_id == job_id,
            models.DatasetRow.table_id == table_id,
        )
        .order_by(models.DatasetRow.row_index.asc())
    )
    if nrows is not None and nrows > 0:
        q = q.limit(nrows)
    rows = q.all()
    if not rows:
        return None
    return pd.DataFrame([r[0] for r in rows])


def load_dataframe_for_table_name(
    db: Session,
    job_id: int,
    table_name: str,
    *,
    nrows: int | None = None,
) -> pd.DataFrame | None:
    tbl = (
        db.query(models.TableMetadata)
        .filter(
            models.TableMetadata.job_id == job_id,
            models.TableMetadata.table_name == table_name,
        )
        .first()
    )
    if not tbl:
        return None
    return load_dataframe(db, job_id, tbl.table_id, nrows=nrows)


def load_snapshot_with_csv_fallback(
    db: Session,
    job_id: int,
    table_name: str,
    *,
    table_id: int | None = None,
    nrows: int | None = None,
) -> pd.DataFrame | None:
    """Prefer DB snapshot; fall back to legacy uploads CSV for older jobs."""
    tid = table_id
    if tid is None:
        tbl = (
            db.query(models.TableMetadata)
            .filter(
                models.TableMetadata.job_id == job_id,
                models.TableMetadata.table_name == table_name,
            )
            .first()
        )
        tid = tbl.table_id if tbl else None

    if tid is not None and has_db_snapshot(db, job_id, tid):
        return load_dataframe(db, job_id, tid, nrows=nrows)

    from utils.upload_paths import resolve_table_csv_path

    csv_path = resolve_table_csv_path(job_id, table_name)
    if not csv_path:
        return None
    try:
        read_kwargs: dict[str, Any] = {}
        if nrows is not None and nrows > 0:
            read_kwargs["nrows"] = nrows
        return pd.read_csv(csv_path, **read_kwargs)
    except Exception as exc:
        logger.warning("CSV fallback read failed job=%s table=%s: %s", job_id, table_name, exc)
        return None


def snapshot_exists(
    db: Session,
    job_id: int,
    table_name: str,
    *,
    table_id: int | None = None,
) -> bool:
    tid = table_id
    if tid is None:
        tbl = (
            db.query(models.TableMetadata)
            .filter(
                models.TableMetadata.job_id == job_id,
                models.TableMetadata.table_name == table_name,
            )
            .first()
        )
        tid = tbl.table_id if tbl else None
    if tid is not None and has_db_snapshot(db, job_id, tid):
        return True
    from utils.upload_paths import resolve_table_csv_path
    import os

    path = resolve_table_csv_path(job_id, table_name)
    if not path:
        return False
    try:
        return os.path.isfile(path) and os.path.getsize(path) > 0
    except OSError:
        return False


def storage_label(job_id: int, table_name: str, *, db_stored: bool) -> str:
    if db_stored:
        return f"db://metadata.dataset_rows/job_{job_id}/{table_name}"
    return f"legacy://uploads/job_{job_id}/{table_name}.csv"


def persist_table_snapshot(
    db: Session,
    job_id: int,
    table_id: int,
    df: pd.DataFrame,
    *,
    commit: bool = True,
) -> int:
    """Write dataset rows to PostgreSQL (never to uploads CSV)."""
    return save_dataframe(db, job_id, table_id, df, commit=commit)


def has_base_backup(db: Session, job_id: int) -> bool:
    return (
        db.query(models.DatasetBaseBackupRow.id)
        .filter(models.DatasetBaseBackupRow.job_id == job_id)
        .first()
        is not None
    )


def save_base_backup(db: Session, job_id: int, df: pd.DataFrame) -> None:
    db.query(models.DatasetBaseBackupRow).filter(
        models.DatasetBaseBackupRow.job_id == job_id
    ).delete(synchronize_session=False)
    records = _row_dicts(df)
    for start in range(0, len(records), INSERT_CHUNK):
        chunk = records[start : start + INSERT_CHUNK]
        mappings = [
            {"job_id": job_id, "row_index": start + i, "row_data": row}
            for i, row in enumerate(chunk)
        ]
        db.bulk_insert_mappings(models.DatasetBaseBackupRow, mappings)


def load_base_backup(db: Session, job_id: int) -> pd.DataFrame | None:
    rows = (
        db.query(models.DatasetBaseBackupRow.row_data)
        .filter(models.DatasetBaseBackupRow.job_id == job_id)
        .order_by(models.DatasetBaseBackupRow.row_index.asc())
        .all()
    )
    if not rows:
        return None
    return pd.DataFrame([r[0] for r in rows])

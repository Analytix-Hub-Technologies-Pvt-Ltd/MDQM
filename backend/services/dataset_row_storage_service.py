"""Store ingested dataset rows in PostgreSQL (metadata.dataset_rows) instead of uploads CSV."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from sqlalchemy import func
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


def _has_row_cells(db: Session, job_id: int, table_id: int) -> bool:
    return (
        db.query(models.DatasetRowCell.id)
        .filter(
            models.DatasetRowCell.job_id == job_id,
            models.DatasetRowCell.table_id == table_id,
        )
        .first()
        is not None
    )


def materialize_legacy_rows_to_cells(db: Session, job_id: int, table_id: int) -> None:
    """One-time: split legacy JSON row_data into per-column cells."""
    if _has_row_cells(db, job_id, table_id):
        return
    headers = (
        db.query(models.DatasetRow)
        .filter(
            models.DatasetRow.job_id == job_id,
            models.DatasetRow.table_id == table_id,
        )
        .order_by(models.DatasetRow.row_index.asc())
        .all()
    )
    cell_mappings: list[dict[str, Any]] = []
    reserved = _reserved_row_columns()
    for header in headers:
        row_data = header.row_data or {}
        if not isinstance(row_data, dict) or not row_data:
            continue
        for col, val in row_data.items():
            col_name = str(col)
            if col_name in reserved:
                continue
            cell_mappings.append(
                {
                    "job_id": job_id,
                    "table_id": table_id,
                    "row_index": header.row_index,
                    "column_name": col_name,
                    "value_text": _cell_value_text(val),
                    "dq_passed": None,
                    "dq_remark": None,
                }
            )
    if cell_mappings:
        for start in range(0, len(cell_mappings), INSERT_CHUNK):
            db.bulk_insert_mappings(models.DatasetRowCell, cell_mappings[start : start + INSERT_CHUNK])
        db.commit()


def _cell_value_text(value: Any) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    return str(_json_cell(value) if _json_cell(value) is not None else "")


def _reserved_row_columns() -> frozenset[str]:
    return frozenset({"job_id", "table_id"})


def delete_snapshot(db: Session, job_id: int, table_id: int) -> None:
    db.query(models.DatasetRowCell).filter(
        models.DatasetRowCell.job_id == job_id,
        models.DatasetRowCell.table_id == table_id,
    ).delete(synchronize_session=False)
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
    """Replace all rows for a job/table — one DB cell per column (CSV/DB style)."""
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
    reserved = _reserved_row_columns()
    for start in range(0, len(records), INSERT_CHUNK):
        chunk = records[start : start + INSERT_CHUNK]
        row_mappings: list[dict[str, Any]] = []
        cell_mappings: list[dict[str, Any]] = []
        for i, row in enumerate(chunk):
            row_index = start + i
            row_mappings.append(
                {
                    "job_id": job_id,
                    "table_id": table_id,
                    "row_index": row_index,
                    "row_data": {},
                    "is_golden_record": False,
                    "dq_remarks": None,
                }
            )
            for col, val in row.items():
                col_name = str(col)
                if col_name in reserved:
                    continue
                cell_mappings.append(
                    {
                        "job_id": job_id,
                        "table_id": table_id,
                        "row_index": row_index,
                        "column_name": col_name,
                        "value_text": _cell_value_text(val),
                        "dq_passed": None,
                        "dq_remark": None,
                    }
                )
        db.bulk_insert_mappings(models.DatasetRow, row_mappings)
        if cell_mappings:
            db.bulk_insert_mappings(models.DatasetRowCell, cell_mappings)

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


def _flatten_row_from_cells(
    header: models.DatasetRow,
    cells: list[models.DatasetRowCell],
) -> dict[str, str]:
    flat: dict[str, str] = {}
    for cell in cells:
        col = cell.column_name
        flat[col] = cell.value_text or ""
        if cell.dq_passed is not None:
            flat[f"{col}__dq_pass"] = "true" if cell.dq_passed else "false"
        if cell.dq_remark:
            flat[f"{col}__dq_remark"] = cell.dq_remark
    flat["job_id"] = str(header.job_id)
    flat["table_id"] = str(header.table_id)
    flat["is_golden_record"] = "true" if header.is_golden_record else "false"
    if header.dq_remarks:
        flat["dq_remarks"] = header.dq_remarks
    if header.golden_remarks:
        flat["golden_remarks"] = header.golden_remarks
    return flat


def _load_flat_rows_page(
    db: Session,
    job_id: int,
    table_id: int,
    *,
    offset: int = 0,
    limit: int | None = None,
) -> list[dict[str, str]]:
    q = (
        db.query(models.DatasetRow)
        .filter(
            models.DatasetRow.job_id == job_id,
            models.DatasetRow.table_id == table_id,
        )
        .order_by(models.DatasetRow.row_index.asc())
    )
    if offset > 0:
        q = q.offset(offset)
    if limit is not None and limit > 0:
        q = q.limit(limit)
    headers = q.all()
    if not headers:
        return []

    row_indices = [h.row_index for h in headers]
    cells = (
        db.query(models.DatasetRowCell)
        .filter(
            models.DatasetRowCell.job_id == job_id,
            models.DatasetRowCell.table_id == table_id,
            models.DatasetRowCell.row_index.in_(row_indices),
        )
        .all()
    )
    by_row: dict[int, list[models.DatasetRowCell]] = {}
    for cell in cells:
        by_row.setdefault(cell.row_index, []).append(cell)

    rows_out: list[dict[str, str]] = []
    for header in headers:
        row_cells = by_row.get(header.row_index, [])
        if row_cells:
            rows_out.append(_flatten_row_from_cells(header, row_cells))
            continue
        legacy = _normalize_row_dict(header.row_data or {})
        if legacy:
            legacy.setdefault("job_id", str(header.job_id))
            legacy.setdefault("table_id", str(header.table_id))
            legacy["is_golden_record"] = "true" if header.is_golden_record else "false"
            if header.dq_remarks:
                legacy["dq_remarks"] = header.dq_remarks
            if header.golden_remarks:
                legacy["golden_remarks"] = header.golden_remarks
            rows_out.append(legacy)
    return rows_out


def apply_dq_results(
    db: Session,
    job_id: int,
    table_id: int,
    results: list[dict[str, Any]],
) -> None:
    """Persist per-column DQ pass/fail flags and row-level golden record remarks."""
    for item in results:
        row_index = int(item["row_index"])
        header = (
            db.query(models.DatasetRow)
            .filter(
                models.DatasetRow.job_id == job_id,
                models.DatasetRow.table_id == table_id,
                models.DatasetRow.row_index == row_index,
            )
            .first()
        )
        if not header:
            continue
        header.is_golden_record = bool(item.get("is_golden_record"))
        header.dq_remarks = item.get("dq_remarks") or None
        header.golden_remarks = item.get("golden_remarks") or None
        column_flags: dict[str, Any] = item.get("column_flags") or {}
        merged_values: dict[str, Any] = item.get("merged_values") or {}
        for col, flag in column_flags.items():
            cell = (
                db.query(models.DatasetRowCell)
                .filter(
                    models.DatasetRowCell.job_id == job_id,
                    models.DatasetRowCell.table_id == table_id,
                    models.DatasetRowCell.row_index == row_index,
                    models.DatasetRowCell.column_name == col,
                )
                .first()
            )
            if not cell:
                continue
            cell.dq_passed = bool(flag.get("passed"))
            cell.dq_remark = flag.get("remark") or None
            if col in merged_values:
                cell.value_text = str(merged_values[col])


def load_dataframe(
    db: Session,
    job_id: int,
    table_id: int,
    *,
    nrows: int | None = None,
) -> pd.DataFrame | None:
    flat_rows = _load_flat_rows_page(db, job_id, table_id, offset=0, limit=nrows)
    if not flat_rows:
        return None
    df = pd.DataFrame(flat_rows)
    drop_cols = [
        c
        for c in df.columns
        if "__dq_" in c or c in ("is_golden_record", "dq_remarks", "golden_remarks", "job_id", "table_id")
    ]
    return df.drop(columns=drop_cols, errors="ignore")


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


def _normalize_row_dict(row: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in row.items():
        if value is None:
            out[str(key)] = ""
        else:
            try:
                if pd.isna(value):
                    out[str(key)] = ""
                    continue
            except (TypeError, ValueError):
                pass
            out[str(key)] = str(value)
    return out


def load_table_rows_page(
    db: Session,
    job_id: int,
    table_name: str,
    *,
    table_id: int | None = None,
    offset: int = 0,
    limit: int = 50,
) -> tuple[list[dict[str, str]], int]:
    """Paginated row slice for a job table (DB snapshot preferred, CSV fallback)."""
    offset = max(0, int(offset))
    limit = max(1, min(int(limit), 200))

    tid = table_id
    tbl_meta = None
    if tid is None:
        tbl_meta = (
            db.query(models.TableMetadata)
            .filter(
                models.TableMetadata.job_id == job_id,
                models.TableMetadata.table_name == table_name,
            )
            .first()
        )
        tid = tbl_meta.table_id if tbl_meta else None
    else:
        tbl_meta = (
            db.query(models.TableMetadata)
            .filter(
                models.TableMetadata.job_id == job_id,
                models.TableMetadata.table_id == tid,
            )
            .first()
        )

    if tid is not None and has_db_snapshot(db, job_id, tid):
        materialize_legacy_rows_to_cells(db, job_id, tid)
        total = (
            db.query(func.count(models.DatasetRow.id))
            .filter(
                models.DatasetRow.job_id == job_id,
                models.DatasetRow.table_id == tid,
            )
            .scalar()
            or 0
        )
        rows = _load_flat_rows_page(db, job_id, tid, offset=offset, limit=limit)
        return rows, int(total)

    from utils.upload_paths import resolve_table_csv_path

    csv_path = resolve_table_csv_path(job_id, table_name)
    if not csv_path:
        return [], 0

    total = int(tbl_meta.row_count or 0) if tbl_meta and tbl_meta.row_count else 0
    if total <= 0:
        try:
            with open(csv_path, "rb") as fh:
                total = max(sum(1 for _ in fh) - 1, 0)
        except OSError:
            total = 0

    skip = range(1, offset + 1) if offset > 0 else None
    try:
        df = pd.read_csv(csv_path, skiprows=skip, nrows=limit)
    except Exception as exc:
        logger.warning("CSV page read failed job=%s table=%s: %s", job_id, table_name, exc)
        return [], total

    if df.empty:
        return [], total
    rows = [_normalize_row_dict(r) for r in df.fillna("").to_dict(orient="records")]
    if tid is not None:
        for row in rows:
            row.setdefault("job_id", str(job_id))
            row.setdefault("table_id", str(tid))
    return rows, total


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
        materialize_legacy_rows_to_cells(db, job_id, tid)
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
        return f"db://metadata.dataset_row_cells/job_{job_id}/{table_name}"
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

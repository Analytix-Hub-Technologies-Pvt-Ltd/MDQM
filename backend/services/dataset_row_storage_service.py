"""Dataset row storage — physical per-dataset tables backend.

Architecture
------------
Primary storage  : datasets.job_{job_id}_tbl_{table_id}
                   One real PostgreSQL table per dataset, created on first write.
Base backup      : datasets.job_{job_id}_base
                   Snapshot of the primary table before any join is applied.
Registry         : metadata.dataset_physical_tables
                   Tracks existence, column list, and row count for every physical table.
Legacy fallback  : metadata.dataset_rows / metadata.dataset_row_cells
                   Old EAV tables. Data is lazily migrated on first access.

Public API (unchanged signatures)
----------------------------------
  has_db_snapshot(db, job_id, table_id) -> bool
  delete_snapshot(db, job_id, table_id) -> None
  save_dataframe(db, job_id, table_id, df, *, commit=False) -> int
  load_dataframe(db, job_id, table_id, *, nrows=None) -> pd.DataFrame | None
  load_dataframe_for_table_name(db, job_id, table_name, *, nrows=None) -> pd.DataFrame | None
  load_table_rows_page(db, job_id, table_name, *, ...) -> tuple[list, int]
  load_snapshot_with_csv_fallback(db, job_id, table_name, *, ...) -> pd.DataFrame | None
  snapshot_exists(db, job_id, table_name, *, table_id=None) -> bool
  apply_dq_results(db, job_id, table_id, results) -> None
  persist_table_snapshot(db, job_id, table_id, df, *, commit=True) -> int
  has_base_backup(db, job_id) -> bool
  save_base_backup(db, job_id, df) -> None
  load_base_backup(db, job_id) -> pd.DataFrame | None
  storage_label(job_id, table_name, *, db_stored) -> str
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session

import models
from services.dq_remarks_helper import (
    attach_dq_remark_fields,
    build_categorized_dq_remarks,
    build_dq_remarks_from_column_flags,
    parse_dq_remarks,
)
from services.physical_table_manager import (
    DATASETS_SCHEMA,
    batch_insert_dataframe,
    bulk_copy_dataframe,
    create_base_backup_table,
    create_dataset_table,
    drop_base_backup_table,
    drop_dataset_table,
    full_table_ref,
    get_base_backup_table_name,
    get_physical_table_name,
    sanitize_column_name,
    table_exists,
)

logger = logging.getLogger(__name__)

_INTERNAL_COLS = frozenset({"_row_index", "_dq_passed", "_is_golden", "_dq_remarks", "_golden_remarks"})
_LEGACY_RESERVED = frozenset({"job_id", "table_id"})
_ROW_METADATA_KEYS = frozenset(
    {"job_id", "table_id", "is_golden_record", "golden_remarks", "dq_remarks", "dq_failed_remarks"}
)


def _strip_grid_metadata(row: dict[str, Any]) -> dict[str, Any]:
    """Remove DQ / golden-record fields so analytics dataframes only contain user columns."""
    return {
        k: v
        for k, v in row.items()
        if k not in _ROW_METADATA_KEYS and not k.endswith("__dq_pass") and not k.endswith("__dq_remark")
    }


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_value(value: Any) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        try:
            return str(value.item())
        except Exception:
            pass
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


# ---------------------------------------------------------------------------
# Registry helpers
# ---------------------------------------------------------------------------


def _get_registry(db: Session, job_id: int, table_id: int):
    return (
        db.query(models.DatasetPhysicalTable)
        .filter(
            models.DatasetPhysicalTable.job_id == job_id,
            models.DatasetPhysicalTable.table_id == table_id,
        )
        .first()
    )


def _upsert_registry(db, job_id, table_id, column_names, row_count, *, has_base_backup=None):
    reg = _get_registry(db, job_id, table_id)
    tbl_name = get_physical_table_name(job_id, table_id)
    if reg is None:
        reg = models.DatasetPhysicalTable(
            job_id=job_id,
            table_id=table_id,
            physical_table_name=tbl_name,
            schema_name=DATASETS_SCHEMA,
            column_names=column_names,
            row_count=row_count,
            has_base_backup=False,
        )
        db.add(reg)
    else:
        reg.physical_table_name = tbl_name
        reg.column_names = column_names
        reg.row_count = row_count
        reg.updated_at = _utc_now()
    if has_base_backup is not None:
        reg.has_base_backup = has_base_backup
    return reg


# ---------------------------------------------------------------------------
# Physical table: existence
# ---------------------------------------------------------------------------


def _physical_table_exists(db: Session, job_id: int, table_id: int) -> bool:
    tbl_name = get_physical_table_name(job_id, table_id)
    with db.get_bind().connect() as conn:
        return table_exists(conn, tbl_name, DATASETS_SCHEMA)


# ---------------------------------------------------------------------------
# Legacy EAV: existence
# ---------------------------------------------------------------------------


def _has_legacy_rows(db: Session, job_id: int, table_id: int) -> bool:
    return (
        db.query(models.DatasetRow.id)
        .filter(
            models.DatasetRow.job_id == job_id,
            models.DatasetRow.table_id == table_id,
        )
        .first()
        is not None
    )


# ---------------------------------------------------------------------------
# Public: has_db_snapshot
# ---------------------------------------------------------------------------


def has_db_snapshot(db: Session, job_id: int, table_id: int) -> bool:
    if _get_registry(db, job_id, table_id) is not None:
        return True
    if _physical_table_exists(db, job_id, table_id):
        return True
    return _has_legacy_rows(db, job_id, table_id)


# ---------------------------------------------------------------------------
# Public: delete_snapshot
# ---------------------------------------------------------------------------


def delete_snapshot(db: Session, job_id: int, table_id: int) -> None:
    with db.get_bind().begin() as conn:
        drop_dataset_table(conn, job_id, table_id)
    db.query(models.DatasetPhysicalTable).filter(
        models.DatasetPhysicalTable.job_id == job_id,
        models.DatasetPhysicalTable.table_id == table_id,
    ).delete(synchronize_session=False)
    db.query(models.DatasetRowCell).filter(
        models.DatasetRowCell.job_id == job_id,
        models.DatasetRowCell.table_id == table_id,
    ).delete(synchronize_session=False)
    db.query(models.DatasetRow).filter(
        models.DatasetRow.job_id == job_id,
        models.DatasetRow.table_id == table_id,
    ).delete(synchronize_session=False)


# ---------------------------------------------------------------------------
# Internal: write DataFrame to physical table
# ---------------------------------------------------------------------------


def _write_df_to_physical_table(db, job_id, table_id, df, *, replace=True):
    if df.empty:
        return 0
    user_cols = [c for c in df.columns if c not in _INTERNAL_COLS and c not in _LEGACY_RESERVED]
    df_user = df[user_cols].copy()
    for col in df_user.columns:
        df_user[col] = df_user[col].apply(_normalize_value)
    safe_cols = [sanitize_column_name(c) for c in df_user.columns]
    df_user.columns = pd.Index(safe_cols)
    engine = db.get_bind()
    with engine.begin() as conn:
        create_dataset_table(conn, job_id, table_id, list(df_user.columns), replace=replace)
    try:
        raw_conn = engine.raw_connection()
        try:
            tbl_name = get_physical_table_name(job_id, table_id)
            count = bulk_copy_dataframe(raw_conn, tbl_name, df_user, DATASETS_SCHEMA)
        finally:
            raw_conn.close()
    except Exception as exc:
        logger.warning("COPY fast-path failed (%s); falling back to batch INSERT", exc)
        with engine.begin() as conn:
            tbl_name = get_physical_table_name(job_id, table_id)
            count = batch_insert_dataframe(conn, tbl_name, df_user, DATASETS_SCHEMA)
    return count


# ---------------------------------------------------------------------------
# Public: save_dataframe
# ---------------------------------------------------------------------------


def save_dataframe(db, job_id, table_id, df, *, commit=False):
    if df.empty:
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

    user_cols = [c for c in df.columns if c not in _INTERNAL_COLS and c not in _LEGACY_RESERVED]
    safe_cols = [sanitize_column_name(c) for c in user_cols]
    row_count = _write_df_to_physical_table(db, job_id, table_id, df, replace=True)
    _upsert_registry(db, job_id, table_id, safe_cols, row_count)

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


# ---------------------------------------------------------------------------
# Internal: read from physical table
# ---------------------------------------------------------------------------


def _read_physical_table(db, job_id, table_id, *, offset=0, limit=None):
    tbl_name = get_physical_table_name(job_id, table_id)
    fqn = full_table_ref(tbl_name)
    sql = f"SELECT * FROM {fqn} ORDER BY _row_index"
    params = {}
    if limit is not None and limit > 0:
        sql += " LIMIT :limit"
        params["limit"] = limit
    if offset > 0:
        sql += " OFFSET :offset"
        params["offset"] = offset
    with db.get_bind().connect() as conn:
        result = conn.execute(text(sql), params)
        keys = list(result.keys())
        data = result.fetchall()

    # Fetch column metadata to map sanitized column names back to original names
    cols = (
        db.query(models.ColumnMetadata)
        .filter(
            models.ColumnMetadata.job_id == job_id,
            models.ColumnMetadata.table_id == table_id,
        )
        .all()
    )

    # Fetch active rules for the table to determine which columns were evaluated
    rules = (
        db.query(models.Rule)
        .filter(
            models.Rule.job_id == job_id,
            models.Rule.table_id == table_id,
            models.Rule.is_active == True,
        )
        .all()
    )
    cols_with_rules = {r.column_name.strip() for r in rules}

    # Map sanitized SQL identifier -> original column name
    name_map = {}
    for c in cols:
        name_map[sanitize_column_name(c.column_name)] = c.column_name

    out = []
    for row in data:
        row_dict = dict(zip(keys, row))

        # Parse _dq_remarks if present
        dq_passed = row_dict.get("_dq_passed")
        dq_remarks = row_dict.get("_dq_remarks")
        failed_cols_map = {}
        dq_failed_remarks = parse_dq_remarks(dq_remarks)
        for item in dq_failed_remarks:
            failed_cols_map[item["column"]] = item["message"]

        row_out = {}
        # Map user columns back to original names
        for c in cols:
            sanitized = sanitize_column_name(c.column_name)
            val = row_dict.get(sanitized)
            row_out[c.column_name] = str(val) if val is not None else ""

            if dq_passed is not None:
                if c.column_name in failed_cols_map:
                    row_out[f"{c.column_name}__dq_pass"] = "false"
                    row_out[f"{c.column_name}__dq_remark"] = failed_cols_map[c.column_name]
                elif c.column_name in cols_with_rules:
                    row_out[f"{c.column_name}__dq_pass"] = "true"
                    row_out[f"{c.column_name}__dq_remark"] = ""

        row_out["is_golden_record"] = "true" if row_dict.get("_is_golden") else "false"
        row_out["golden_remarks"] = str(row_dict.get("_golden_remarks")) if row_dict.get("_golden_remarks") is not None else ""
        if row_dict.get("_row_index") is not None:
            try:
                row_out["row_index"] = int(row_dict["_row_index"])
            except (TypeError, ValueError):
                row_out["row_index"] = row_dict["_row_index"]
        if dq_passed is not None:
            row_out["dq_passed"] = "true" if dq_passed else "false"
        attach_dq_remark_fields(row_out, dq_remarks)
        row_out["dq_failed_remarks"] = dq_failed_remarks

        # If ColumnMetadata is missing, fallback to returning keys as-is
        if not cols:
            user_keys = [k for k in keys if k not in _INTERNAL_COLS]
            row_out = {k: (str(row_dict[k]) if row_dict[k] is not None else "") for k in user_keys}
            row_out["is_golden_record"] = "true" if row_dict.get("_is_golden") else "false"
            row_out["golden_remarks"] = str(row_dict.get("_golden_remarks")) if row_dict.get("_golden_remarks") is not None else ""
            if row_dict.get("_row_index") is not None:
                try:
                    row_out["row_index"] = int(row_dict["_row_index"])
                except (TypeError, ValueError):
                    row_out["row_index"] = row_dict["_row_index"]
            attach_dq_remark_fields(row_out, row_dict.get("_dq_remarks"))

        out.append(row_out)
    return out



def _count_physical_table(db, job_id, table_id):
    tbl_name = get_physical_table_name(job_id, table_id)
    fqn = full_table_ref(tbl_name)
    with db.get_bind().connect() as conn:
        row = conn.execute(text(f"SELECT COUNT(*) FROM {fqn}")).fetchone()
    return int(row[0]) if row else 0


# ---------------------------------------------------------------------------
# Internal: lazy migration from legacy EAV to physical table
# ---------------------------------------------------------------------------


def materialize_legacy_rows_to_cells(db, job_id, table_id):
    has_cells = (
        db.query(models.DatasetRowCell.id)
        .filter(
            models.DatasetRowCell.job_id == job_id,
            models.DatasetRowCell.table_id == table_id,
        )
        .first()
        is not None
    )
    if has_cells:
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
    cell_mappings = []
    for header in headers:
        row_data = header.row_data or {}
        if not isinstance(row_data, dict) or not row_data:
            continue
        for col, val in row_data.items():
            col_name = str(col)
            if col_name in _LEGACY_RESERVED:
                continue
            cell_mappings.append(
                {
                    "job_id": job_id,
                    "table_id": table_id,
                    "row_index": header.row_index,
                    "column_name": col_name,
                    "value_text": _normalize_value(val),
                    "dq_passed": None,
                    "dq_remark": None,
                }
            )
    if cell_mappings:
        for start in range(0, len(cell_mappings), 1500):
            db.bulk_insert_mappings(models.DatasetRowCell, cell_mappings[start : start + 1500])
        db.commit()


def _load_flat_rows_from_legacy(db, job_id, table_id, *, offset=0, limit=None):
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
    by_row = {}
    for cell in cells:
        by_row.setdefault(cell.row_index, []).append(cell)

    out = []
    for header in headers:
        row_cells = by_row.get(header.row_index, [])
        flat = {}
        dq_failed_remarks = []
        if row_cells:
            for cell in row_cells:
                flat[cell.column_name] = cell.value_text or ""
                if cell.dq_passed is not None:
                    flat[f"{cell.column_name}__dq_pass"] = "true" if cell.dq_passed else "false"
                    flat[f"{cell.column_name}__dq_remark"] = cell.dq_remark or ""
                    if cell.dq_passed is False:
                        dq_failed_remarks.append(
                            {
                                "category": "Validation",
                                "column": cell.column_name,
                                "message": cell.dq_remark or "fail",
                                "value": cell.value_text,
                            }
                        )
        else:
            for k, v in (header.row_data or {}).items():
                flat[str(k)] = _normalize_value(v)
        flat["job_id"] = str(header.job_id)
        flat["table_id"] = str(header.table_id)
        flat["row_index"] = int(header.row_index)
        flat["is_golden_record"] = "true" if header.is_golden_record else "false"
        if header.dq_remarks:
            attach_dq_remark_fields(flat, header.dq_remarks)
            if not dq_failed_remarks:
                dq_failed_remarks = flat.get("dq_failed_remarks") or []
        else:
            attach_dq_remark_fields(flat, None)
        flat["dq_failed_remarks"] = dq_failed_remarks
        if dq_failed_remarks:
            flat["dq_passed"] = "false"
        elif any(k.endswith("__dq_pass") and v == "true" for k, v in flat.items()):
            flat["dq_passed"] = "true"
        if header.golden_remarks:
            flat["golden_remarks"] = header.golden_remarks
        else:
            flat["golden_remarks"] = ""
        out.append(flat)
    return out


def _migrate_legacy_to_physical(db, job_id, table_id):
    if not _has_legacy_rows(db, job_id, table_id):
        return False
    logger.info("Lazy-migrating legacy EAV data to physical table (job=%s, table=%s)", job_id, table_id)
    materialize_legacy_rows_to_cells(db, job_id, table_id)
    rows = _load_flat_rows_from_legacy(db, job_id, table_id)
    if not rows:
        return False
    clean_rows = [{k: v for k, v in r.items() if k not in _LEGACY_RESERVED} for r in rows]
    df = pd.DataFrame(clean_rows)
    user_cols = [c for c in df.columns if c not in _INTERNAL_COLS]
    safe_cols = [sanitize_column_name(c) for c in user_cols]
    _write_df_to_physical_table(db, job_id, table_id, df, replace=True)
    _upsert_registry(db, job_id, table_id, safe_cols, len(df))
    db.commit()
    logger.info("Migration complete - %d rows moved to physical table", len(df))
    return True


# ---------------------------------------------------------------------------
# Public: load_dataframe
# ---------------------------------------------------------------------------


def load_dataframe(db, job_id, table_id, *, nrows=None):
    if _get_registry(db, job_id, table_id) is not None or _physical_table_exists(db, job_id, table_id):
        try:
            rows = _read_physical_table(db, job_id, table_id, offset=0, limit=nrows)
            clean = [_strip_grid_metadata(r) for r in rows] if rows else []
            return pd.DataFrame(clean) if clean else pd.DataFrame()
        except Exception as exc:
            logger.warning("Physical table read failed (job=%s, table=%s): %s", job_id, table_id, exc)
    if _has_legacy_rows(db, job_id, table_id):
        _migrate_legacy_to_physical(db, job_id, table_id)
        rows = _read_physical_table(db, job_id, table_id, offset=0, limit=nrows)
        clean = [_strip_grid_metadata(r) for r in rows] if rows else []
        return pd.DataFrame(clean) if clean else None
    return None


def load_dataframe_for_table_name(db, job_id, table_name, *, nrows=None):
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


# ---------------------------------------------------------------------------
# Public: load_table_rows_page
# ---------------------------------------------------------------------------


def load_table_rows_page(db, job_id, table_name, *, table_id=None, offset=0, limit=50):
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

    if tid is not None:
        if not _get_registry(db, job_id, tid) and not _physical_table_exists(db, job_id, tid):
            if _has_legacy_rows(db, job_id, tid):
                _migrate_legacy_to_physical(db, job_id, tid)

        if _physical_table_exists(db, job_id, tid):
            try:
                total = _count_physical_table(db, job_id, tid)
                rows = _read_physical_table(db, job_id, tid, offset=offset, limit=limit)
                return rows, total
            except Exception as exc:
                logger.warning("Physical table page read failed: %s", exc)

        if _has_legacy_rows(db, job_id, tid):
            materialize_legacy_rows_to_cells(db, job_id, tid)
            from sqlalchemy import func as sqlfunc
            total = (
                db.query(sqlfunc.count(models.DatasetRow.id))
                .filter(
                    models.DatasetRow.job_id == job_id,
                    models.DatasetRow.table_id == tid,
                )
                .scalar()
                or 0
            )
            clean = []
            rows_flat = _load_flat_rows_from_legacy(db, job_id, tid, offset=offset, limit=limit)
            for r in rows_flat:
                row_clean = {k: v for k, v in r.items() if k not in ("job_id", "table_id") and "__dq_" not in k}
                row_clean["is_golden_record"] = r.get("is_golden_record", "false")
                row_clean["golden_remarks"] = r.get("golden_remarks", "")
                row_clean["dq_remarks"] = r.get("dq_remarks", "")
                row_clean["dq_failed_remarks"] = r.get("dq_failed_remarks") or []
                for k, v in r.items():
                    if k.endswith("__dq_pass") or k.endswith("__dq_remark"):
                        row_clean[k] = v
                clean.append(row_clean)
            return clean, int(total)

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
    rows_out = []
    for r in df.fillna("").to_dict(orient="records"):
        row_clean = {str(k): _normalize_value(v) for k, v in r.items()}
        row_clean["is_golden_record"] = "false"
        row_clean["golden_remarks"] = ""
        row_clean["dq_remarks"] = ""
        row_clean["dq_failed_remarks"] = []
        if tid is not None:
            row_clean["job_id"] = str(job_id)
            row_clean["table_id"] = str(tid)
        rows_out.append(row_clean)
    return rows_out, total


# ---------------------------------------------------------------------------
# Public: load_snapshot_with_csv_fallback
# ---------------------------------------------------------------------------


def load_snapshot_with_csv_fallback(db, job_id, table_name, *, table_id=None, nrows=None):
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
    if tid is not None:
        df = load_dataframe(db, job_id, tid, nrows=nrows)
        if df is not None:
            return df
    from utils.upload_paths import resolve_table_csv_path
    csv_path = resolve_table_csv_path(job_id, table_name)
    if not csv_path:
        return None
    try:
        read_kwargs = {}
        if nrows is not None and nrows > 0:
            read_kwargs["nrows"] = nrows
        return pd.read_csv(csv_path, **read_kwargs)
    except Exception as exc:
        logger.warning("CSV fallback read failed job=%s table=%s: %s", job_id, table_name, exc)
        return None


# ---------------------------------------------------------------------------
# Public: snapshot_exists
# ---------------------------------------------------------------------------


def snapshot_exists(db, job_id, table_name, *, table_id=None):
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
    if tid is not None:
        if _get_registry(db, job_id, tid) is not None:
            return True
        if _physical_table_exists(db, job_id, tid):
            return True
        if _has_legacy_rows(db, job_id, tid):
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


# ---------------------------------------------------------------------------
# Public: update_table_row_values
# ---------------------------------------------------------------------------


def update_table_row_values(
    db,
    job_id: int,
    table_id: int,
    row_index: int,
    values: dict,
) -> dict:
    """
    Update user-column values for one dataset row.
    Does not allow changing DQ STATUS / DQ REMARKS / golden fields.
    """
    if not isinstance(values, dict) or not values:
        raise ValueError("No values to update")

    cols = (
        db.query(models.ColumnMetadata)
        .filter(
            models.ColumnMetadata.job_id == job_id,
            models.ColumnMetadata.table_id == table_id,
        )
        .all()
    )
    allowed = {c.column_name for c in cols}
    clean: dict[str, str | None] = {}
    for key, raw in values.items():
        name = str(key or "").strip()
        if not name or name not in allowed:
            continue
        if raw is None:
            clean[name] = None
            continue
        # Do not name this `text` — that shadows sqlalchemy.text
        text_val = str(raw)
        if text_val == "—" or text_val.lower() in {"nan", "none", "null"}:
            text_val = ""
        clean[name] = text_val

    if not clean:
        raise ValueError("No editable columns matched the payload")

    row_idx = int(row_index)
    tbl_name = get_physical_table_name(job_id, table_id)
    fqn = full_table_ref(tbl_name)
    engine = db.get_bind()

    with engine.connect() as conn:
        phys_exists = table_exists(conn, tbl_name, DATASETS_SCHEMA)

    if phys_exists:
        set_parts = []
        params: dict = {"row_idx": row_idx}
        for i, (col_name, val) in enumerate(clean.items()):
            safe = sanitize_column_name(col_name)
            key = f"v{i}"
            set_parts.append(f'"{safe}" = :{key}')
            params[key] = val
        sql = text(f"UPDATE {fqn} SET {', '.join(set_parts)} WHERE _row_index = :row_idx")
        with engine.begin() as conn:
            result = conn.execute(sql, params)
            if result.rowcount == 0:
                raise ValueError(f"Row {row_idx} not found")
        return {"row_index": row_idx, "updated_columns": list(clean.keys())}

    # Legacy EAV path
    header = (
        db.query(models.DatasetRow)
        .filter(
            models.DatasetRow.job_id == job_id,
            models.DatasetRow.table_id == table_id,
            models.DatasetRow.row_index == row_idx,
        )
        .first()
    )
    if not header:
        # physical uses 1-based; legacy is often 0-based — try row_idx - 1
        if row_idx > 0:
            header = (
                db.query(models.DatasetRow)
                .filter(
                    models.DatasetRow.job_id == job_id,
                    models.DatasetRow.table_id == table_id,
                    models.DatasetRow.row_index == row_idx - 1,
                )
                .first()
            )
            if header:
                row_idx = header.row_index
    if not header:
        raise ValueError(f"Row {row_index} not found")

    row_data = dict(header.row_data or {})
    for col_name, val in clean.items():
        row_data[col_name] = val
        cell = (
            db.query(models.DatasetRowCell)
            .filter(
                models.DatasetRowCell.job_id == job_id,
                models.DatasetRowCell.table_id == table_id,
                models.DatasetRowCell.row_index == header.row_index,
                models.DatasetRowCell.column_name == col_name,
            )
            .first()
        )
        if cell:
            cell.value_text = val
        else:
            db.add(
                models.DatasetRowCell(
                    job_id=job_id,
                    table_id=table_id,
                    row_index=header.row_index,
                    column_name=col_name,
                    value_text=val,
                )
            )
    header.row_data = row_data
    db.commit()
    return {"row_index": header.row_index, "updated_columns": list(clean.keys())}


# ---------------------------------------------------------------------------
# Public: apply_dq_results
# ---------------------------------------------------------------------------


def apply_dq_results(db, job_id, table_id, results):
    if not results:
        return
    tbl_name = get_physical_table_name(job_id, table_id)
    fqn = full_table_ref(tbl_name)
    engine = db.get_bind()
    with engine.connect() as conn:
        phys_exists = table_exists(conn, tbl_name, DATASETS_SCHEMA)
    if phys_exists:
        update_rows = []
        for item in results:
            row_index = int(item["row_index"])
            column_flags = item.get("column_flags") or {}
            row_errors = item.get("row_errors")
            if row_errors:
                dq_remarks, _ = build_categorized_dq_remarks(row_errors)
            elif item.get("dq_remarks"):
                dq_remarks = item.get("dq_remarks")
            else:
                dq_remarks, _ = build_dq_remarks_from_column_flags(column_flags)
            failed_cols = [col for col, flag in column_flags.items() if not flag.get("passed", True)]
            update_rows.append(
                {
                    "row_idx": row_index + 1,
                    "dq_passed": len(failed_cols) == 0,
                    "is_golden": bool(item.get("is_golden_record")),
                    "dq_remarks": dq_remarks,
                    "golden_remarks": item.get("golden_remarks") or None,
                }
            )
        upd_sql = text(
            f"UPDATE {fqn} SET "
            "_dq_passed = :dq_passed, "
            "_is_golden = :is_golden, "
            "_dq_remarks = :dq_remarks, "
            "_golden_remarks = :golden_remarks "
            "WHERE _row_index = :row_idx"
        )
        with engine.begin() as conn:
            conn.execute(upd_sql, update_rows)
        return
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
        row_errors = item.get("row_errors")
        if row_errors:
            dq_remarks, dq_failed = build_categorized_dq_remarks(row_errors)
        else:
            dq_remarks = item.get("dq_remarks")
            dq_failed = item.get("dq_failed_remarks") or parse_dq_remarks(dq_remarks)
        header.dq_remarks = dq_remarks or None
        header.golden_remarks = item.get("golden_remarks") or None
        column_flags = item.get("column_flags") or {}
        merged_values = item.get("merged_values") or {}
        failed_by_col = {f["column"]: f for f in dq_failed}
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
            fail_info = failed_by_col.get(col)
            cell.dq_remark = (fail_info or {}).get("message") or flag.get("remark") or None
            if col in merged_values:
                cell.value_text = str(merged_values[col])


# ---------------------------------------------------------------------------
# Public: persist_table_snapshot
# ---------------------------------------------------------------------------


def persist_table_snapshot(db, job_id, table_id, df, *, commit=True):
    result = save_dataframe(db, job_id, table_id, df, commit=False)
    if commit:
        db.commit()
    return result


def storage_label(job_id, table_name, *, db_stored):
    if db_stored:
        return f"db://datasets/job_{job_id}/{table_name}"
    return f"legacy://uploads/job_{job_id}/{table_name}.csv"


# ---------------------------------------------------------------------------
# Public: base backup
# ---------------------------------------------------------------------------


def has_base_backup(db, job_id):
    tbl_name = get_base_backup_table_name(job_id)
    with db.get_bind().connect() as conn:
        if table_exists(conn, tbl_name, DATASETS_SCHEMA):
            return True
    return (
        db.query(models.DatasetBaseBackupRow.id)
        .filter(models.DatasetBaseBackupRow.job_id == job_id)
        .first()
        is not None
    )


def save_base_backup(db, job_id, df):
    if df.empty:
        return
    user_cols = [c for c in df.columns if c not in _INTERNAL_COLS and c not in _LEGACY_RESERVED]
    df_user = df[user_cols].copy()
    for col in df_user.columns:
        df_user[col] = df_user[col].apply(_normalize_value)
    safe_cols = [sanitize_column_name(c) for c in df_user.columns]
    df_user.columns = pd.Index(safe_cols)
    engine = db.get_bind()
    with engine.begin() as conn:
        create_base_backup_table(conn, job_id, list(df_user.columns), replace=True)
    try:
        raw_conn = engine.raw_connection()
        try:
            tbl_name = get_base_backup_table_name(job_id)
            bulk_copy_dataframe(raw_conn, tbl_name, df_user, DATASETS_SCHEMA)
        finally:
            raw_conn.close()
    except Exception as exc:
        logger.warning("COPY fast-path failed for base backup (%s); using batch INSERT", exc)
        with engine.begin() as conn:
            tbl_name = get_base_backup_table_name(job_id)
            batch_insert_dataframe(conn, tbl_name, df_user, DATASETS_SCHEMA)


def load_base_backup(db, job_id):
    tbl_name = get_base_backup_table_name(job_id)
    fqn = full_table_ref(tbl_name)
    with db.get_bind().connect() as conn:
        if table_exists(conn, tbl_name, DATASETS_SCHEMA):
            result = conn.execute(text(f"SELECT * FROM {fqn} ORDER BY _row_index"))
            all_keys = list(result.keys())
            user_keys = [k for k in all_keys if k not in _INTERNAL_COLS]
            data = result.fetchall()
            if not data:
                return None
            records = [
                {k: (str(row[all_keys.index(k)]) if row[all_keys.index(k)] is not None else "")
                 for k in user_keys}
                for row in data
            ]
            return pd.DataFrame(records)
    rows = (
        db.query(models.DatasetBaseBackupRow.row_data)
        .filter(models.DatasetBaseBackupRow.job_id == job_id)
        .order_by(models.DatasetBaseBackupRow.row_index.asc())
        .all()
    )
    if not rows:
        return None
    return pd.DataFrame([r[0] for r in rows])

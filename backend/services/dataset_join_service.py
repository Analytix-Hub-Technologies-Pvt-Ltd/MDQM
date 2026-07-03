"""Add secondary data sources to an existing dataset and join them to the primary table."""

from __future__ import annotations

import os
import shutil
import uuid
from typing import Any

import pandas as pd
from sqlalchemy.orm import Session

import models
from services.dataset_db_import import (
    build_table_select_query,
    connect_external_db,
    normalize_dataframe_columns,
    normalize_selected_columns,
    normalize_column_aliases,
    resolve_column_in_frame,
    resolve_creds_from_job_config,
)
from utils.source_secret_crypto import decrypt_db_password_optional, encrypt_db_password_optional
from utils.upload_paths import join_source_cache_path, resolve_table_csv_path


JOIN_TYPES = {"left", "inner", "right", "outer"}


def normalize_join_keys(join: dict[str, Any]) -> list[dict[str, str]]:
    keys = join.get("join_keys")
    if isinstance(keys, list) and keys:
        out: list[dict[str, str]] = []
        for item in keys:
            if not isinstance(item, dict):
                continue
            lk = str(item.get("left_key") or "").strip()
            rk = str(item.get("right_key") or "").strip()
            if lk and rk:
                out.append({"left_key": lk, "right_key": rk})
        if out:
            return out
    lk = str(join.get("left_key") or "").strip()
    rk = str(join.get("right_key") or "").strip()
    if lk and rk:
        return [{"left_key": lk, "right_key": rk}]
    return []


def format_join_keys_display(join: dict[str, Any]) -> str:
    pairs = normalize_join_keys(join)
    if not pairs:
        return ""
    return " · ".join(f"{p['left_key']} = {p['right_key']}" for p in pairs)


from services.job_source_config_service import read_job_source_config, write_job_source_config


def _job_cfg(job: models.Job) -> dict[str, Any]:
    return dict(read_job_source_config(job))


def _save_job_cfg(db: Session, job: models.Job, cfg: dict[str, Any]) -> None:
    write_job_source_config(job, cfg)
    db.commit()


def _infer_kind(cfg: dict[str, Any]) -> str:
    if cfg.get("kind") == "postgres_tables" or cfg.get("schema_name"):
        return "postgres_tables"
    return "file"


def legacy_base_snapshot_path(job_id: int) -> str:
    """Legacy CSV backup path — only read for old jobs; new jobs use metadata.dataset_base_backup_rows."""
    from utils.upload_paths import UPLOAD_ROOT

    return os.path.join(UPLOAD_ROOT, f"job_{job_id}", "_base_primary.csv")


def join_source_csv_path(job_id: int, join_id: str, *, ext: str | None = None) -> str:
    return join_source_cache_path(job_id, join_id, ext=ext)


def list_join_sources(job: models.Job) -> list[dict[str, Any]]:
    cfg = _job_cfg(job)
    joins = cfg.get("join_sources") or []
    if not isinstance(joins, list):
        return []
    out = []
    for j in joins:
        if not isinstance(j, dict):
            continue
        source_kind = str(j.get("source_kind") or "file").lower()
        file_ready = True
        if source_kind == "file":
            join_id = str(j.get("id") or "")
            path = j.get("file_path") or (
                join_source_csv_path(job.job_id, join_id) if join_id else ""
            )
            file_ready = bool(path and os.path.isfile(path))

        stored_materialized = j.get("materialized") is True
        if source_kind == "file" and not file_ready:
            status = "broken"
            is_materialized = False
        elif stored_materialized:
            status = "active"
            is_materialized = True
        else:
            status = "broken"
            is_materialized = False

        out.append(
            {
                "id": j.get("id"),
                "label": j.get("label"),
                "source_kind": j.get("source_kind"),
                "join_type": j.get("join_type") or "left",
                "left_key": j.get("left_key"),
                "right_key": j.get("right_key"),
                "join_keys": normalize_join_keys(j),
                "selected_columns": j.get("selected_columns") or [],
                "column_aliases": j.get("column_aliases") or {},
                "schema_name": j.get("schema_name"),
                "table_name": j.get("table_name"),
                "file_name": j.get("file_name"),
                "status": status,
                "materialized": is_materialized,
            }
        )
    return out


def _primary_table(db: Session, job_id: int) -> models.TableMetadata | None:
    return (
        db.query(models.TableMetadata)
        .filter(models.TableMetadata.job_id == job_id)
        .order_by(models.TableMetadata.table_id.asc())
        .first()
    )


def _ensure_base_snapshot(db: Session, job: models.Job) -> None:
    """Preserve the primary table snapshot before the first join is applied."""
    from services.dataset_row_storage_service import (
        has_base_backup,
        load_snapshot_with_csv_fallback,
        save_base_backup,
    )

    primary = _primary_table(db, job.job_id)
    if not primary:
        raise ValueError("No primary table found on this dataset job.")

    if has_base_backup(db, job.job_id):
        return

    df = load_snapshot_with_csv_fallback(db, job.job_id, primary.table_name, table_id=primary.table_id)
    if df is None or df.empty:
        raise ValueError("Primary dataset has no loaded data. Upload or import base data before joining.")

    save_base_backup(db, job.job_id, df)
    cfg = _job_cfg(job)
    cfg["base_snapshot_in_db"] = True
    if not cfg.get("kind"):
        cfg["kind"] = _infer_kind(cfg)
    _save_job_cfg(db, job, cfg)
    db.commit()


def _load_base_dataframe(db: Session, job: models.Job) -> pd.DataFrame:
    from services.dataset_row_storage_service import (
        has_base_backup,
        load_base_backup,
        load_snapshot_with_csv_fallback,
    )

    cfg = _job_cfg(job)
    primary = _primary_table(db, job.job_id)
    if not primary:
        raise ValueError("No primary table found on this dataset job.")

    if cfg.get("base_snapshot_in_db") or has_base_backup(db, job.job_id):
        df = load_base_backup(db, job.job_id)
        if df is not None:
            return df

    backup = cfg.get("base_snapshot_path") or legacy_base_snapshot_path(job.job_id)
    if os.path.isfile(backup):
        return pd.read_csv(backup)

    if cfg.get("kind") == "postgres_tables":
        creds = resolve_creds_from_job_config(db, job)
        schema_name = str(cfg.get("schema_name") or "").strip()
        table_names = cfg.get("table_names") or [primary.table_name]
        table_name = str(table_names[0] or primary.table_name).strip()
        selected = normalize_selected_columns(cfg.get("selected_columns"))
        external_conn = connect_external_db(creds)
        try:
            q = build_table_select_query(
                schema_name,
                table_name,
                creds.get("db_type") or "postgres",
                external_conn,
                selected or None,
            )
            return pd.read_sql_query(q, external_conn)
        finally:
            external_conn.close()

    from services.dataset_row_storage_service import load_snapshot_with_csv_fallback

    df = load_snapshot_with_csv_fallback(db, job.job_id, primary.table_name, table_id=primary.table_id)
    if df is None:
        raise ValueError("Primary dataset has no loaded data. Upload or import base data before joining.")
    
    # Drop internal metadata columns from the base DataFrame before joining
    drop_cols = [c for c in ["is_golden_record", "golden_remarks", "dq_remarks", "job_id", "table_id"] if c in df.columns]
    if drop_cols:
        df = df.drop(columns=drop_cols)
        
    return normalize_dataframe_columns(df)


def _load_file_join_df(job_id: int, join_cfg: dict[str, Any]) -> pd.DataFrame:
    join_id = str(join_cfg.get("id") or "")
    path = join_cfg.get("file_path") or join_source_csv_path(job_id, join_id)
    if not path or not os.path.isfile(path):
        raise ValueError(f"Join source file not found for '{join_cfg.get('label') or join_id}'.")
    name_hint = str(join_cfg.get("file_name") or path).lower()
    path_l = str(path).lower()
    if name_hint.endswith((".xlsx", ".xls")) or path_l.endswith((".xlsx", ".xls")):
        df = pd.read_excel(path)
    else:
        df = pd.read_csv(path)
    return normalize_dataframe_columns(df)


def _load_table_join_df(join_cfg: dict[str, Any], pass_override: str | None = None) -> pd.DataFrame:
    schema_name = str(join_cfg.get("schema_name") or "").strip()
    table_name = str(join_cfg.get("table_name") or "").strip()
    if not schema_name or not table_name:
        raise ValueError("Join table source is incomplete.")

    creds = {
        "host": join_cfg.get("host"),
        "port": str(join_cfg.get("port") or "5432"),
        "user": join_cfg.get("user"),
        "dbname": join_cfg.get("dbname"),
        "db_type": join_cfg.get("db_type") or "postgres",
        "pass": pass_override or "",
    }
    if not creds["pass"]:
        creds["pass"] = decrypt_db_password_optional(join_cfg.get("encrypted_db_pass")) or ""
    if not str(creds["pass"] or "").strip():
        raise ValueError("No password available for join table source.")

    selected = normalize_selected_columns(join_cfg.get("selected_columns"))
    for pair in normalize_join_keys(join_cfg):
        rk = pair.get("right_key") or ""
        if rk and rk not in selected:
            selected = selected + [rk]

    external_conn = connect_external_db(creds)
    try:
        q = build_table_select_query(
            schema_name,
            table_name,
            creds.get("db_type") or "postgres",
            external_conn,
            selected or None,
        )
        return pd.read_sql_query(q, external_conn)
    finally:
        external_conn.close()


def load_join_source_df(job_id: int, join_cfg: dict[str, Any], pass_override: str | None = None) -> pd.DataFrame:
    kind = str(join_cfg.get("source_kind") or "file").lower()
    if kind == "table":
        return _load_table_join_df(join_cfg, pass_override)
    return _load_file_join_df(job_id, join_cfg)


def _normalize_join_key_value(val: Any) -> str | None:
    """Coerce join key cell values to a comparable string (handles int64 vs object)."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        if isinstance(val, float) and val != int(val):
            return str(val).strip()
        return str(int(val))
    text = str(val).strip()
    if not text or text.lower() in ("nan", "none", "<na>"):
        return None
    try:
        num = float(text)
        if num == int(num):
            return str(int(num))
    except ValueError:
        pass
    return text


def _harmonize_join_key_column(df: pd.DataFrame, column: str) -> pd.DataFrame:
    if column not in df.columns:
        return df
    out = df.copy()
    out[column] = out[column].map(_normalize_join_key_value).astype("string")
    return out


def materialize_dataset_with_joins(
    db: Session,
    job_id: int,
    snapshot_fn,
    *,
    joins_override: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not job:
        raise ValueError("Job not found.")

    primary = _primary_table(db, job_id)
    if not primary:
        raise ValueError("No primary table found on this dataset job.")

    cfg = _job_cfg(job)
    joins = joins_override if joins_override is not None else (cfg.get("join_sources") or [])
    result = normalize_dataframe_columns(_load_base_dataframe(db, job))

    for join in joins:
        if not isinstance(join, dict):
            continue
        right_df = load_join_source_df(job.job_id, join)
        right_df = normalize_dataframe_columns(right_df)
        selected = normalize_selected_columns(join.get("selected_columns"))
        key_pairs = normalize_join_keys(join)
        join_type = str(join.get("join_type") or "outer").lower()
        if join_type not in JOIN_TYPES:
            join_type = "outer"
        if not key_pairs:
            raise ValueError(f"Join '{join.get('label')}' is missing join keys.")

        left_cols: list[str] = []
        right_cols: list[str] = []
        for pair in key_pairs:
            left_key = pair["left_key"]
            right_key = pair["right_key"]
            left_col = resolve_column_in_frame(result, left_key)
            right_col = resolve_column_in_frame(right_df, right_key)
            if not left_col:
                raise ValueError(f"Left join key '{left_key}' not found in base dataset.")
            if not right_col:
                raise ValueError(
                    f"Right join key '{right_key}' not found in join source '{join.get('label')}'."
                )
            left_cols.append(left_col)
            right_cols.append(right_col)

        resolved_selected: list[str] = []
        for col_name in selected or list(right_df.columns):
            match = resolve_column_in_frame(right_df, col_name)
            if match and match not in resolved_selected:
                resolved_selected.append(match)
        for right_col in right_cols:
            if right_col not in resolved_selected:
                resolved_selected.append(right_col)

        keep_cols = list(dict.fromkeys(resolved_selected))
        right_subset = right_df[[c for c in keep_cols if c in right_df.columns]].copy()

        overlap = (set(result.columns) & set(right_subset.columns)) - set(left_cols) - set(right_cols)
        rename = {c: f"{c}_joined" for c in overlap}
        if rename:
            right_subset = right_subset.rename(columns=rename)
            right_cols = [rename.get(c, c) for c in right_cols]

        user_aliases = normalize_column_aliases(join.get("column_aliases"))
        if user_aliases:
            alias_rename: dict[str, str] = {}
            for src_name, alias_name in user_aliases.items():
                col = resolve_column_in_frame(right_subset, src_name)
                if not col and f"{src_name}_joined" in right_subset.columns:
                    col = f"{src_name}_joined"
                if not col or col in right_cols:
                    continue
                if alias_name in result.columns or alias_name in right_subset.columns:
                    raise ValueError(
                        f"Column alias '{alias_name}' for '{src_name}' conflicts with an existing column name."
                    )
                alias_rename[col] = alias_name
            if alias_rename:
                right_subset = right_subset.rename(columns=alias_rename)

        for left_col, right_col in zip(left_cols, right_cols):
            result = _harmonize_join_key_column(result, left_col)
            right_subset = _harmonize_join_key_column(right_subset, right_col)

        rows_before = len(result)
        right_rows = len(right_subset)

        if left_cols == right_cols:
            result = result.merge(right_subset, on=left_cols, how=join_type)
        else:
            result = result.merge(right_subset, left_on=left_cols, right_on=right_cols, how=join_type)
            drop_cols = [rc for lc, rc in zip(left_cols, right_cols) if rc in result.columns and rc != lc]
            if drop_cols:
                result = result.drop(columns=list(dict.fromkeys(drop_cols)))

        if join_type == "inner" and rows_before > 0 and right_rows > 0 and len(result) == 0:
            raise ValueError(
                f"Inner join '{join.get('label')}' matched no rows. Check join keys "
                f"({format_join_keys_display(join)}) and value formats."
            )

    snapshot_fn(db, job_id, primary.table_id, primary.table_name, result)
    return {
        "row_count": int(len(result)),
        "column_count": int(len(result.columns)),
        "join_count": len([j for j in joins if isinstance(j, dict)]),
    }


def add_join_source(
    db: Session,
    job: models.Job,
    *,
    payload: dict[str, Any],
    file_path: str | None = None,
    snapshot_fn,
) -> dict[str, Any]:
    _ensure_base_snapshot(db, job)

    join_id = str(uuid.uuid4())
    source_kind = str(payload.get("source_kind") or "file").lower()
    join_type = str(payload.get("join_type") or "outer").lower()
    if join_type not in JOIN_TYPES:
        join_type = "outer"

    join_keys: list[dict[str, str]] = []
    raw_keys = payload.get("join_keys")
    if isinstance(raw_keys, list):
        for item in raw_keys:
            if isinstance(item, dict):
                lk = str(item.get("left_key") or "").strip()
                rk = str(item.get("right_key") or "").strip()
                if lk and rk:
                    join_keys.append({"left_key": lk, "right_key": rk})
    if not join_keys:
        lk = str(payload.get("left_key") or "").strip()
        rk = str(payload.get("right_key") or "").strip()
        if lk and rk:
            join_keys = [{"left_key": lk, "right_key": rk}]
    if not join_keys:
        raise ValueError("At least one join key pair is required.")

    selected_columns = normalize_selected_columns(payload.get("selected_columns"))
    column_aliases = normalize_column_aliases(payload.get("column_aliases"))
    label = str(payload.get("label") or "").strip() or f"join_{join_id[:8]}"

    entry: dict[str, Any] = {
        "id": join_id,
        "label": label,
        "source_kind": source_kind,
        "join_type": join_type,
        "join_keys": join_keys,
        "left_key": join_keys[0]["left_key"],
        "right_key": join_keys[0]["right_key"],
        "selected_columns": selected_columns,
        "column_aliases": column_aliases,
    }

    join_file_dest: str | None = None
    if source_kind == "table":
        entry.update(
            {
                "connection_id": payload.get("connection_id"),
                "schema_name": payload.get("schema_name"),
                "table_name": payload.get("table_name"),
                "host": payload.get("host"),
                "port": str(payload.get("port") or "5432"),
                "user": payload.get("user"),
                "dbname": payload.get("dbname"),
                "db_type": payload.get("db_type") or "postgres",
            }
        )
        enc = encrypt_db_password_optional(str(payload.get("pass") or ""))
        if enc:
            entry["encrypted_db_pass"] = enc
    else:
        if not file_path:
            raise ValueError("file is required for file join sources.")
        orig_name = os.path.basename(file_path)
        _, ext = os.path.splitext(orig_name)
        join_file_dest = join_source_csv_path(job.job_id, join_id, ext=ext or ".csv")
        shutil.copy2(file_path, join_file_dest)
        entry["file_path"] = join_file_dest
        entry["file_name"] = orig_name

    entry["materialized"] = False

    cfg = _job_cfg(job)
    if not cfg.get("kind"):
        cfg["kind"] = _infer_kind(cfg)
    joins = list(cfg.get("join_sources") or [])
    trial_joins = joins + [entry]

    try:
        stats = materialize_dataset_with_joins(
            db, job.job_id, snapshot_fn, joins_override=trial_joins
        )
    except Exception:
        if join_file_dest and os.path.isfile(join_file_dest):
            try:
                os.remove(join_file_dest)
            except OSError:
                pass
        raise

    entry["materialized"] = True
    for j in trial_joins:
        if isinstance(j, dict):
            j["materialized"] = True

    cfg["join_sources"] = trial_joins
    _save_job_cfg(db, job, cfg)
    return {"join": entry, "materialized": stats}


def remove_join_source(db: Session, job: models.Job, join_id: str, snapshot_fn) -> dict[str, Any]:
    cfg = _job_cfg(job)
    joins = [j for j in (cfg.get("join_sources") or []) if isinstance(j, dict) and str(j.get("id")) != str(join_id)]
    if len(joins) == len(cfg.get("join_sources") or []):
        raise ValueError("Join source not found.")

    stats = materialize_dataset_with_joins(db, job.job_id, snapshot_fn, joins_override=joins)

    cfg["join_sources"] = joins
    _save_job_cfg(db, job, cfg)

    path = join_source_csv_path(job.job_id, join_id)
    if os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass

    return {"removed": join_id, "materialized": stats}

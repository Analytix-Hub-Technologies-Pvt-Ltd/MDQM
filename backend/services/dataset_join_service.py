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
    normalize_selected_columns,
    resolve_creds_from_job_config,
)
from utils.source_secret_crypto import decrypt_db_password_optional, encrypt_db_password_optional
from utils.upload_paths import join_source_cache_path, resolve_table_csv_path


JOIN_TYPES = {"left", "inner", "right", "outer"}


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


def join_source_csv_path(job_id: int, join_id: str) -> str:
    return join_source_cache_path(job_id, join_id)


def list_join_sources(job: models.Job) -> list[dict[str, Any]]:
    cfg = _job_cfg(job)
    joins = cfg.get("join_sources") or []
    if not isinstance(joins, list):
        return []
    out = []
    for j in joins:
        if not isinstance(j, dict):
            continue
        out.append(
            {
                "id": j.get("id"),
                "label": j.get("label"),
                "source_kind": j.get("source_kind"),
                "join_type": j.get("join_type") or "left",
                "left_key": j.get("left_key"),
                "right_key": j.get("right_key"),
                "selected_columns": j.get("selected_columns") or [],
                "schema_name": j.get("schema_name"),
                "table_name": j.get("table_name"),
                "file_name": j.get("file_name"),
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
    return df


def _load_file_join_df(job_id: int, join_cfg: dict[str, Any]) -> pd.DataFrame:
    join_id = str(join_cfg.get("id") or "")
    path = join_cfg.get("file_path") or join_source_csv_path(job_id, join_id)
    if not path or not os.path.isfile(path):
        raise ValueError(f"Join source file not found for '{join_cfg.get('label') or join_id}'.")
    lower = str(path).lower()
    if lower.endswith((".xlsx", ".xls")):
        return pd.read_excel(path)
    return pd.read_csv(path)


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
    right_key = str(join_cfg.get("right_key") or "").strip()
    if right_key and right_key not in selected:
        selected = selected + [right_key]

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


def materialize_dataset_with_joins(db: Session, job_id: int, snapshot_fn) -> dict[str, Any]:
    job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not job:
        raise ValueError("Job not found.")

    primary = _primary_table(db, job_id)
    if not primary:
        raise ValueError("No primary table found on this dataset job.")

    cfg = _job_cfg(job)
    joins = cfg.get("join_sources") or []
    result = _load_base_dataframe(db, job)

    for join in joins:
        if not isinstance(join, dict):
            continue
        right_df = load_join_source_df(job.job_id, join)
        selected = normalize_selected_columns(join.get("selected_columns"))
        left_key = str(join.get("left_key") or "").strip()
        right_key = str(join.get("right_key") or "").strip()
        join_type = str(join.get("join_type") or "left").lower()
        if join_type not in JOIN_TYPES:
            join_type = "left"
        if not left_key or not right_key:
            raise ValueError(f"Join '{join.get('label')}' is missing join keys.")
        if left_key not in result.columns:
            raise ValueError(f"Left join key '{left_key}' not found in base dataset.")
        if right_key not in right_df.columns:
            raise ValueError(f"Right join key '{right_key}' not found in join source '{join.get('label')}'.")

        keep_cols = list(dict.fromkeys((selected or list(right_df.columns)) + [right_key]))
        right_subset = right_df[[c for c in keep_cols if c in right_df.columns]].copy()

        overlap = (set(result.columns) & set(right_subset.columns)) - {left_key, right_key}
        if left_key == right_key:
            overlap.discard(left_key)
        rename = {c: f"{c}_joined" for c in overlap}
        if rename:
            right_subset = right_subset.rename(columns=rename)

        if left_key == right_key:
            result = result.merge(right_subset, on=left_key, how=join_type)
        else:
            result = result.merge(right_subset, left_on=left_key, right_on=right_key, how=join_type)
            if right_key in result.columns and right_key != left_key:
                result = result.drop(columns=[right_key])

    snapshot_fn(db, job_id, primary.table_id, primary.table_name, result)
    return {
        "row_count": int(len(result)),
        "column_count": int(len(result.columns)),
        "join_count": len(joins),
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
    join_type = str(payload.get("join_type") or "left").lower()
    if join_type not in JOIN_TYPES:
        join_type = "left"

    left_key = str(payload.get("left_key") or "").strip()
    right_key = str(payload.get("right_key") or "").strip()
    if not left_key or not right_key:
        raise ValueError("left_key and right_key are required.")

    selected_columns = normalize_selected_columns(payload.get("selected_columns"))
    label = str(payload.get("label") or "").strip() or f"join_{join_id[:8]}"

    entry: dict[str, Any] = {
        "id": join_id,
        "label": label,
        "source_kind": source_kind,
        "join_type": join_type,
        "left_key": left_key,
        "right_key": right_key,
        "selected_columns": selected_columns,
    }

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
        dest = join_source_csv_path(job.job_id, join_id)
        shutil.copy2(file_path, dest)
        entry["file_path"] = dest
        entry["file_name"] = os.path.basename(file_path)

    cfg = _job_cfg(job)
    if not cfg.get("kind"):
        cfg["kind"] = _infer_kind(cfg)
    joins = list(cfg.get("join_sources") or [])
    joins.append(entry)
    cfg["join_sources"] = joins
    _save_job_cfg(db, job, cfg)

    stats = materialize_dataset_with_joins(db, job.job_id, snapshot_fn)
    return {"join": entry, "materialized": stats}


def remove_join_source(db: Session, job: models.Job, join_id: str, snapshot_fn) -> dict[str, Any]:
    cfg = _job_cfg(job)
    joins = [j for j in (cfg.get("join_sources") or []) if isinstance(j, dict) and str(j.get("id")) != str(join_id)]
    if len(joins) == len(cfg.get("join_sources") or []):
        raise ValueError("Join source not found.")

    cfg["join_sources"] = joins
    _save_job_cfg(db, job, cfg)

    path = join_source_csv_path(job.job_id, join_id)
    if os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass

    stats = materialize_dataset_with_joins(db, job.job_id, snapshot_fn)
    return {"removed": join_id, "materialized": stats}

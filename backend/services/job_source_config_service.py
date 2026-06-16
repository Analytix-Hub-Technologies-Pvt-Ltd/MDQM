"""Relational job source config (replaces metadata.jobs.db_source_config JSON)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

import models

_TABLE_SEP = "|"
_COL_SEP = ","
_JOIN_ONLY_KEYS = frozenset({"join_sources", "base_snapshot_in_db", "base_snapshot_path"})


def _split_tables(raw: str | None) -> list[str]:
    if not raw or not str(raw).strip():
        return []
    return [p.strip() for p in str(raw).split(_TABLE_SEP) if p.strip()]


def _join_tables(names: list[str]) -> str | None:
    cleaned = [str(n).strip() for n in names if str(n).strip()]
    return _TABLE_SEP.join(cleaned) if cleaned else None


def _split_columns(raw: str | None) -> list[str]:
    if not raw or not str(raw).strip():
        return []
    return [p.strip() for p in str(raw).split(_COL_SEP) if p.strip()]


def _join_columns(names: list[str]) -> str | None:
    cleaned = [str(n).strip() for n in names if str(n).strip()]
    return _COL_SEP.join(cleaned) if cleaned else None


def _has_column_config(job: models.Job) -> bool:
    return bool(
        (job.source_kind or "").strip()
        or (job.source_host or "").strip()
        or (job.source_schema_name or "").strip()
        or (job.source_table_names or "").strip()
    )


def _join_only_fragment(job: models.Job) -> dict[str, Any]:
    legacy = job.db_source_config
    if not isinstance(legacy, dict):
        return {}
    return {k: legacy[k] for k in _JOIN_ONLY_KEYS if k in legacy and legacy[k] not in (None, "", [])}


def read_job_source_config(job: models.Job | None) -> dict[str, Any]:
    """Build config dict from relational columns (fallback: legacy JSON)."""
    if not job:
        return {}
    if _has_column_config(job):
        cfg: dict[str, Any] = {}
        if job.source_kind:
            cfg["kind"] = job.source_kind
        if job.source_connection_id is not None:
            cfg["connection_id"] = job.source_connection_id
        if job.source_host:
            cfg["host"] = job.source_host
        if job.source_port:
            cfg["port"] = job.source_port
        if job.source_db_user:
            cfg["user"] = job.source_db_user
        if job.source_dbname:
            cfg["dbname"] = job.source_dbname
        if job.source_db_type:
            cfg["db_type"] = job.source_db_type
        if job.source_schema_name:
            cfg["schema_name"] = job.source_schema_name
        tables = _split_tables(job.source_table_names)
        if tables:
            cfg["table_names"] = tables
        cols = _split_columns(job.source_selected_columns)
        if cols:
            cfg["selected_columns"] = cols
        if job.source_encrypted_db_pass:
            cfg["encrypted_db_pass"] = job.source_encrypted_db_pass
        cfg.update(_join_only_fragment(job))
        return cfg

    legacy = job.db_source_config
    return dict(legacy) if isinstance(legacy, dict) else {}


def write_job_source_config(job: models.Job, cfg: dict[str, Any] | None) -> None:
    """Persist connection config as relational columns; keep join-only keys in minimal JSON."""
    if not cfg or not isinstance(cfg, dict):
        job.source_kind = None
        job.source_connection_id = None
        job.source_host = None
        job.source_port = None
        job.source_db_user = None
        job.source_dbname = None
        job.source_db_type = None
        job.source_schema_name = None
        job.source_table_names = None
        job.source_selected_columns = None
        job.source_encrypted_db_pass = None
        job.db_source_config = None
        return

    join_fragment = {k: cfg[k] for k in _JOIN_ONLY_KEYS if k in cfg and cfg[k] not in (None, "", [])}

    cid = cfg.get("connection_id")
    try:
        connection_id = int(float(cid)) if cid is not None and str(cid).strip() not in ("", "null", "nan") else None
    except (TypeError, ValueError):
        connection_id = None

    table_names = cfg.get("table_names")
    if isinstance(table_names, str):
        tables = [table_names]
    elif isinstance(table_names, list):
        tables = [str(t) for t in table_names]
    else:
        tables = []

    selected = cfg.get("selected_columns")
    if isinstance(selected, list):
        cols = [str(c) for c in selected]
    elif isinstance(selected, str) and selected.strip():
        cols = _split_columns(selected)
    else:
        cols = []

    job.source_kind = str(cfg.get("kind") or "").strip() or None
    job.source_connection_id = connection_id
    job.source_host = str(cfg.get("host") or "").strip() or None
    job.source_port = str(cfg.get("port") or "").strip() or None
    job.source_db_user = str(cfg.get("user") or "").strip() or None
    job.source_dbname = str(cfg.get("dbname") or "").strip() or None
    job.source_db_type = str(cfg.get("db_type") or "").strip().lower() or None
    job.source_schema_name = str(cfg.get("schema_name") or "").strip() or None
    job.source_table_names = _join_tables(tables)
    job.source_selected_columns = _join_columns(cols)
    enc = cfg.get("encrypted_db_pass")
    job.source_encrypted_db_pass = str(enc).strip() if enc else None
    job.db_source_config = join_fragment or None


def migrate_job_source_json_to_columns(db: Session) -> int:
    """One-time: copy legacy db_source_config JSON into relational columns."""
    rows = (
        db.query(models.Job)
        .filter(models.Job.db_source_config.isnot(None))
        .all()
    )
    migrated = 0
    for job in rows:
        if not isinstance(job.db_source_config, dict):
            continue
        legacy = dict(job.db_source_config)
        if _has_column_config(job):
            job.db_source_config = {k: legacy[k] for k in _JOIN_ONLY_KEYS if k in legacy} or None
            migrated += 1
            continue
        write_job_source_config(job, legacy)
        migrated += 1
    if migrated:
        db.commit()
    return migrated

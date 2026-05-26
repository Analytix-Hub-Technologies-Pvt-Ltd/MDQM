"""Register and import Postgres table sources for Data Owner datasets."""

from __future__ import annotations

from typing import Any

import pandas as pd
from psycopg2 import sql as psql
from sqlalchemy import func
from sqlalchemy.orm import Session

import models


def _normalize_import_dataframe_dates(df: pd.DataFrame) -> pd.DataFrame:
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            continue
        if df[col].dtype == object:
            try:
                converted = pd.to_datetime(df[col], format="mixed", dayfirst=True, errors="coerce")
                if not converted.isna().all():
                    df[col] = converted
            except Exception:
                pass
    return df


def build_db_source_config(payload: dict, creds: dict, schema_name: str, table_names: list[str]) -> dict[str, Any]:
    from utils.source_secret_crypto import encrypt_db_password_optional

    cfg: dict[str, Any] = {
        "kind": "postgres_tables",
        "connection_id": payload.get("connection_id"),
        "dbname": creds["dbname"],
        "db_type": creds.get("db_type") or "postgres",
        "schema_name": schema_name,
        "table_names": list(table_names),
        "host": creds.get("host"),
        "port": str(creds.get("port") or "5432"),
        "user": creds.get("user"),
    }
    enc = encrypt_db_password_optional(creds.get("pass") or "")
    if enc:
        cfg["encrypted_db_pass"] = enc
    return cfg


def import_tables_into_job(
    db: Session,
    *,
    job_id: int,
    external_conn,
    schema_name: str,
    table_names: list[str],
    snapshot_fn,
    db_type: str = "postgres",
) -> list[dict[str, Any]]:
    """Pull tables from Postgres/SQLServer/MySQL and snapshot to job CSVs. Returns per-table summaries."""
    summaries: list[dict[str, Any]] = []
    max_id = (
        db.query(func.max(models.TableMetadata.table_id))
        .filter(models.TableMetadata.job_id == job_id)
        .scalar()
    )
    next_table_id = 1 if max_id is None else int(max_id) + 1

    existing = {
        t.table_name: t
        for t in db.query(models.TableMetadata).filter(models.TableMetadata.job_id == job_id).all()
    }

    db_type_lower = str(db_type or "postgres").lower().strip()
    for table_name in table_names:
        if db_type_lower in ("mssql", "sqlserver", "sql_server"):
            q_str = f"SELECT * FROM [{schema_name}].[{table_name}]"
        elif db_type_lower == "mysql":
            if schema_name:
                q_str = f"SELECT * FROM `{schema_name}`.`{table_name}`"
            else:
                q_str = f"SELECT * FROM `{table_name}`"
        elif db_type_lower in ("oracle", "snowflake"):
            if schema_name:
                q_str = f'SELECT * FROM "{schema_name}"."{table_name}"'
            else:
                q_str = f'SELECT * FROM "{table_name}"'
        elif db_type_lower == "databricks":
            if schema_name:
                q_str = f"SELECT * FROM `{schema_name}`.`{table_name}`"
            else:
                q_str = f"SELECT * FROM `{table_name}`"
        else:
            query = psql.SQL("SELECT * FROM {}.{}").format(
                psql.Identifier(schema_name),
                psql.Identifier(table_name),
            )
            q_str = query.as_string(external_conn)

        df = pd.read_sql_query(q_str, external_conn)
        df = _normalize_import_dataframe_dates(df)

        tm = existing.get(table_name)
        if tm:
            table_id = tm.table_id
        else:
            tm = models.TableMetadata(
                job_id=job_id,
                table_id=next_table_id,
                table_name=table_name,
                row_count=0,
            )
            db.add(tm)
            db.commit()
            existing[table_name] = tm
            table_id = next_table_id
            next_table_id += 1

        snapshot_fn(db, job_id, table_id, table_name, df)
        summaries.append({"table_name": table_name, "row_count": int(len(df))})

    return summaries

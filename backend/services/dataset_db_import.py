"""Register and import Postgres table sources for Data Owner datasets."""

from __future__ import annotations

from typing import Any

import pandas as pd
import psycopg2
from psycopg2 import sql as psql
from sqlalchemy import func
from sqlalchemy.orm import Session

import models


def sql_type_to_mdqm(sql_type: str) -> str:
    t = (sql_type or "").lower()
    if any(x in t for x in ("int", "serial", "bigint", "smallint", "tinyint", "number")):
        return "Integer"
    if any(x in t for x in ("float", "double", "decimal", "numeric", "real", "money")):
        return "Float"
    if any(x in t for x in ("date", "time", "timestamp")):
        return "Date"
    if "bool" in t:
        return "Boolean"
    return "String"


def connect_external_db(creds: dict):
    db_type = str(creds.get("db_type") or "postgres").lower().strip()
    if db_type in ("mssql", "sqlserver", "sql_server"):
        import pyodbc

        drivers = [
            "ODBC Driver 18 for SQL Server",
            "ODBC Driver 17 for SQL Server",
            "ODBC Driver 13 for SQL Server",
            "SQL Server Native Client 11.0",
            "SQL Server",
        ]
        last_err = None
        for driver in drivers:
            try:
                host = creds["host"]
                port = str(creds.get("port") or "").strip()
                host_port = f"{host},{port}" if port and port not in ("0", "5432") else host
                conn_str = (
                    f"Driver={{{driver}}};Server={host_port};"
                    f"Database={creds['dbname']};Uid={creds['user']};Pwd={creds['pass']};"
                    "TrustServerCertificate=yes;Connection Timeout=8;"
                )
                return pyodbc.connect(conn_str)
            except Exception as e:
                last_err = e
        raise Exception(f"SQL Server connection failed: {last_err}")
    if db_type == "mysql":
        import pymysql

        return pymysql.connect(
            host=creds["host"],
            port=int(creds.get("port") or 3306),
            user=creds["user"],
            password=creds["pass"],
            database=creds["dbname"],
            connect_timeout=8,
        )
    if db_type == "oracle":
        import oracledb

        return oracledb.connect(
            user=creds["user"],
            password=creds["pass"],
            host=creds["host"],
            port=int(creds.get("port") or 1521),
            service_name=creds["dbname"],
        )
    if db_type == "databricks":
        from databricks import sql

        server_hostname = creds["host"]
        http_path = creds["dbname"]
        if "/" in server_hostname:
            parts = server_hostname.split("/", 1)
            server_hostname = parts[0]
            http_path = "/" + parts[1]
        return sql.connect(
            server_hostname=server_hostname,
            http_path=http_path,
            access_token=creds["pass"],
        )
    return psycopg2.connect(
        host=creds["host"],
        port=creds["port"],
        user=creds["user"],
        password=creds["pass"],
        dbname=creds["dbname"],
        connect_timeout=8,
    )


def fetch_table_column_schema(
    external_conn,
    schema_name: str,
    table_name: str,
    db_type: str = "postgres",
) -> list[dict[str, str]]:
    """Read column names and types from the source database (no row import)."""
    db_type_lower = str(db_type or "postgres").lower().strip()
    cur = external_conn.cursor()
    try:
        if db_type_lower in ("mssql", "sqlserver", "sql_server"):
            cur.execute(
                """
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = ?
                AND table_name = ?
                ORDER BY ordinal_position
                """,
                (schema_name, table_name),
            )
        elif db_type_lower == "oracle":
            cur.execute(
                """
                SELECT column_name, data_type
                FROM all_tab_columns
                WHERE owner = :1
                AND table_name = :2
                ORDER BY column_id
                """,
                (schema_name.upper(), table_name.upper()),
            )
        elif db_type_lower == "databricks":
            cur.execute(f"DESCRIBE TABLE `{schema_name}`.`{table_name}`")
            rows = cur.fetchall()
            out: list[dict[str, str]] = []
            for row in rows:
                name = str(row[0] or "").strip()
                if not name or name.startswith("#"):
                    continue
                out.append({"name": name, "data_type": sql_type_to_mdqm(str(row[1] if len(row) > 1 else ""))})
            return out
        else:
            cur.execute(
                """
                SELECT column_name, data_type, udt_name
                FROM information_schema.columns
                WHERE table_schema = %s
                AND table_name = %s
                ORDER BY ordinal_position
                """,
                (schema_name, table_name),
            )
        return [
            {
                "name": str(row[0]),
                "data_type": sql_type_to_mdqm(str(row[1] if len(row) > 1 else "")),
            }
            for row in cur.fetchall()
            if row and row[0]
        ]
    finally:
        cur.close()


def persist_table_column_schema(
    db: Session,
    *,
    job_id: int,
    table_id: int,
    columns: list[dict[str, str]],
) -> None:
    if not columns:
        return
    existing = (
        db.query(models.ColumnMetadata)
        .filter(
            models.ColumnMetadata.job_id == job_id,
            models.ColumnMetadata.table_id == table_id,
        )
        .all()
    )
    cached_descriptions = {
        (c.column_name or "").strip(): (
            c.description,
            c.description_generated_at,
            c.data_type,
        )
        for c in existing
    }
    db.query(models.ColumnMetadata).filter(
        models.ColumnMetadata.job_id == job_id,
        models.ColumnMetadata.table_id == table_id,
    ).delete(synchronize_session=False)
    for col in columns:
        name = col["name"]
        data_type = col.get("data_type") or "String"
        row = models.ColumnMetadata(
            job_id=job_id,
            table_id=table_id,
            column_name=name,
            data_type=data_type,
        )
        cached = cached_descriptions.get((name or "").strip())
        if cached:
            description, generated_at, old_type = cached
            if description and old_type == data_type:
                row.description = description
                row.description_generated_at = generated_at
        db.add(row)
    db.commit()


def _stored_connection_password_plain(row: models.DbConnection) -> str:
    from utils.source_secret_crypto import decrypt_db_password_optional

    blob = row.password
    if not blob or not str(blob).strip():
        return ""
    s = str(blob).strip()
    plain = decrypt_db_password_optional(s)
    if plain is not None:
        return plain
    if s.startswith("gAAAA"):
        return ""
    return s


def resolve_creds_from_job_config(db: Session, job: models.Job, body: dict | None = None) -> dict[str, Any]:
    """Resolve external DB credentials from job.db_source_config."""
    body = body or {}
    cfg = job.db_source_config
    if not cfg or not isinstance(cfg, dict) or cfg.get("kind") != "postgres_tables":
        raise ValueError("Dataset is not database-backed.")

    cid_raw = cfg.get("connection_id")
    cid_norm = None
    if cid_raw is not None and str(cid_raw).strip() != "" and str(cid_raw).lower() not in ("null", "nan"):
        try:
            cid_norm = int(float(cid_raw))
        except (ValueError, TypeError):
            cid_norm = None

    from utils.source_secret_crypto import decrypt_db_password_optional

    creds: dict[str, Any] = {
        "host": str(cfg.get("host") or "").strip(),
        "port": str(cfg.get("port") or "5432"),
        "user": str(cfg.get("user") or "").strip(),
        "dbname": str(cfg.get("dbname") or "").strip(),
        "db_type": str(cfg.get("db_type") or "postgres").strip().lower(),
        "pass": decrypt_db_password_optional(cfg.get("encrypted_db_pass")) or "",
    }

    if cid_norm and cid_norm > 0:
        row = db.query(models.DbConnection).filter(models.DbConnection.connection_id == cid_norm).first()
        if row:
            db_type = row.db_type or "postgres"
            port_str = str(row.port or "").strip()
            if db_type == "postgres":
                if port_str == "1433" or "sql server" in (row.connection_name or "").lower():
                    db_type = "sqlserver"
                elif port_str == "3306" or "mysql" in (row.connection_name or "").lower():
                    db_type = "mysql"
            creds = {
                "host": row.host,
                "port": str(row.port or "5432"),
                "user": row.username,
                "pass": _stored_connection_password_plain(row),
                "dbname": str(cfg.get("dbname") or "").strip(),
                "db_type": db_type,
            }

    for key in ("host", "port", "user", "dbname"):
        if str(body.get(key) or "").strip():
            creds[key] = str(body[key]).strip()
    if body.get("pass") is not None and str(body.get("pass", "")) != "":
        creds["pass"] = body["pass"]

    creds["host"] = str(creds.get("host") or "").strip()
    creds["user"] = str(creds.get("user") or "").strip()
    creds["dbname"] = str(creds.get("dbname") or "").strip()
    creds["port"] = str(creds.get("port") or "5432")
    creds["db_type"] = str(creds.get("db_type") or "postgres").strip().lower()
    if not creds.get("host") or not creds.get("user") or not creds.get("dbname"):
        raise ValueError("Cannot resolve database credentials.")
    if not str(creds.get("pass") or "").strip():
        raise ValueError("No stored password for this dataset.")
    return creds


def sync_registered_table_columns_from_source(
    db: Session,
    *,
    job: models.Job,
    table: models.TableMetadata,
) -> list[dict[str, str]]:
    """Fetch source schema for a registered table and persist ColumnMetadata when missing."""
    existing = (
        db.query(models.ColumnMetadata)
        .filter(
            models.ColumnMetadata.job_id == job.job_id,
            models.ColumnMetadata.table_id == table.table_id,
        )
        .count()
    )
    if existing:
        rows = (
            db.query(models.ColumnMetadata)
            .filter(
                models.ColumnMetadata.job_id == job.job_id,
                models.ColumnMetadata.table_id == table.table_id,
            )
            .order_by(models.ColumnMetadata.column_name.asc())
            .all()
        )
        return [{"name": c.column_name, "data_type": c.data_type or "String"} for c in rows]

    cfg = job.db_source_config if isinstance(job.db_source_config, dict) else {}
    schema_name = str(cfg.get("schema_name") or "").strip()
    if not schema_name:
        return []

    external_conn = None
    try:
        creds = resolve_creds_from_job_config(db, job)
        external_conn = connect_external_db(creds)
        columns = fetch_table_column_schema(
            external_conn,
            schema_name,
            table.table_name,
            creds.get("db_type") or "postgres",
        )
        persist_table_column_schema(
            db,
            job_id=job.job_id,
            table_id=table.table_id,
            columns=columns,
        )
        return columns
    except Exception:
        return []
    finally:
        if external_conn is not None:
            try:
                external_conn.close()
            except Exception:
                pass


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


def normalize_selected_columns(raw) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        name = str(item or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
    return out


def filter_column_schema(columns: list[dict[str, str]], selected_columns: list[str] | None) -> list[dict[str, str]]:
    if not selected_columns:
        return columns
    wanted = {c for c in selected_columns}
    filtered = [col for col in columns if col.get("name") in wanted]
    return filtered if filtered else columns


def build_table_select_query(
    schema_name: str,
    table_name: str,
    db_type: str,
    external_conn,
    selected_columns: list[str] | None = None,
) -> str:
    db_type_lower = str(db_type or "postgres").lower().strip()
    cols = normalize_selected_columns(selected_columns)

    if not cols:
        if db_type_lower in ("mssql", "sqlserver", "sql_server"):
            return f"SELECT * FROM [{schema_name}].[{table_name}]"
        if db_type_lower == "mysql":
            if schema_name:
                return f"SELECT * FROM `{schema_name}`.`{table_name}`"
            return f"SELECT * FROM `{table_name}`"
        if db_type_lower in ("oracle", "snowflake"):
            if schema_name:
                return f'SELECT * FROM "{schema_name}"."{table_name}"'
            return f'SELECT * FROM "{table_name}"'
        if db_type_lower == "databricks":
            if schema_name:
                return f"SELECT * FROM `{schema_name}`.`{table_name}`"
            return f"SELECT * FROM `{table_name}`"
        query = psql.SQL("SELECT * FROM {}.{}").format(
            psql.Identifier(schema_name),
            psql.Identifier(table_name),
        )
        return query.as_string(external_conn)

    if db_type_lower in ("mssql", "sqlserver", "sql_server"):
        col_sql = ", ".join(f"[{c}]" for c in cols)
        return f"SELECT {col_sql} FROM [{schema_name}].[{table_name}]"
    if db_type_lower == "mysql":
        col_sql = ", ".join(f"`{c}`" for c in cols)
        if schema_name:
            return f"SELECT {col_sql} FROM `{schema_name}`.`{table_name}`"
        return f"SELECT {col_sql} FROM `{table_name}`"
    if db_type_lower in ("oracle", "snowflake"):
        col_sql = ", ".join(f'"{c}"' for c in cols)
        if schema_name:
            return f'SELECT {col_sql} FROM "{schema_name}"."{table_name}"'
        return f'SELECT {col_sql} FROM "{table_name}"'
    if db_type_lower == "databricks":
        col_sql = ", ".join(f"`{c}`" for c in cols)
        if schema_name:
            return f"SELECT {col_sql} FROM `{schema_name}`.`{table_name}`"
        return f"SELECT {col_sql} FROM `{table_name}`"

    query = psql.SQL("SELECT {} FROM {}.{}").format(
        psql.SQL(", ").join(psql.Identifier(c) for c in cols),
        psql.Identifier(schema_name),
        psql.Identifier(table_name),
    )
    return query.as_string(external_conn)


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
    selected_columns = normalize_selected_columns(payload.get("selected_columns"))
    if selected_columns:
        cfg["selected_columns"] = selected_columns
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
    selected_columns: list[str] | None = None,
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
        q_str = build_table_select_query(
            schema_name,
            table_name,
            db_type_lower,
            external_conn,
            selected_columns,
        )
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

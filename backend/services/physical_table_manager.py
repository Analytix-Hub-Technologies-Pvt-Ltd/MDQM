"""DDL manager for per-dataset physical PostgreSQL tables (schema: datasets).

Responsibilities
----------------
* Safe SQL identifier generation from job/table IDs and user column names
* CREATE / DROP TABLE via raw DDL (bypasses SQLAlchemy ORM for schema flexibility)
* Bulk-insert DataFrames using the fast PostgreSQL COPY protocol
* Table-existence checks via information_schema
"""

from __future__ import annotations

import io
import logging
import re
from typing import Any

import pandas as pd
from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

logger = logging.getLogger(__name__)

# Schema that holds all physical per-dataset raw tables.
RAW_COLUMNS_SCHEMA = "raw_column"
# Existing imports use this name for the physical storage schema.
DATASETS_SCHEMA = RAW_COLUMNS_SCHEMA

# DQ / bookkeeping columns appended to every physical table.
# These are hidden from end-users in the read path.
_INTERNAL_COLS: list[str] = [
    "_row_index",       # stable row identity (BIGSERIAL, PK)
    "_dq_passed",       # overall DQ flag for the row
    "_is_golden",       # set when fuzzy-match merges to master
    "_dq_remarks",      # human-readable DQ failure summary
    "_golden_remarks",  # fuzzy-match details
]

_RESERVED_KEYWORDS = frozenset(
    {
        "order", "group", "select", "where", "from", "join", "table", "index",
        "column", "user", "value", "default", "check", "constraint", "primary",
        "foreign", "key", "unique", "references", "create", "drop", "alter",
        "insert", "update", "delete", "with", "case", "when", "then", "else",
        "end", "as", "on", "and", "or", "not", "in", "is", "null", "true",
        "false", "limit", "offset", "distinct", "all", "any", "exists",
        "having", "union", "except", "intersect", "set", "to", "do",
    }
)


# ---------------------------------------------------------------------------
# Identifier helpers
# ---------------------------------------------------------------------------


def sanitize_column_name(raw: str) -> str:
    """Return a safe, lowercase SQL column identifier for a user-supplied column name."""
    name = str(raw).strip()
    # Replace whitespace and common separators with underscores
    name = re.sub(r"[\s\-\.\/\\]+", "_", name)
    # Remove characters that are not word chars or digits
    name = re.sub(r"[^\w]", "", name)
    # Strip leading digits / underscores
    name = re.sub(r"^[_\d]+", "", name)
    if not name:
        name = "col"
    name = name.lower()
    # Suffix reserved keywords to avoid quoting everywhere
    if name in _RESERVED_KEYWORDS:
        name = f"{name}_col"
    return name


def get_physical_table_name(job_id: int, table_id: int) -> str:
    """Return the bare physical table name (no schema prefix)."""
    return f"raw_job_{job_id}"


def get_base_backup_table_name(job_id: int) -> str:
    """Return the bare physical table name for the pre-join base backup."""
    return f"raw_job_{job_id}_backup"


def full_table_ref(table_name: str, schema: str = DATASETS_SCHEMA) -> str:
    """Return schema-qualified table name safe for use in raw SQL."""
    return f"{schema}.{table_name}"


# ---------------------------------------------------------------------------
# DDL helpers
# ---------------------------------------------------------------------------


def table_exists(conn: Connection, table_name: str, schema: str = DATASETS_SCHEMA) -> bool:
    """Check whether a table exists in information_schema (schema-qualified)."""
    row = conn.execute(
        text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = :schema AND table_name = :table "
            "LIMIT 1"
        ),
        {"schema": schema, "table": table_name},
    ).fetchone()
    return row is not None


def _build_column_ddl(user_columns: list[str]) -> str:
    """Build the column list fragment for a CREATE TABLE statement."""
    parts: list[str] = ["_row_index BIGSERIAL PRIMARY KEY"]
    seen: set[str] = set()
    for col in user_columns:
        safe = sanitize_column_name(col)
        if safe in seen:
            n = 2
            while f"{safe}_{n}" in seen:
                n += 1
            safe = f"{safe}_{n}"
        seen.add(safe)
        parts.append(f'"{safe}" TEXT')
    parts += [
        "_dq_passed    BOOLEAN",
        "_is_golden    BOOLEAN NOT NULL DEFAULT FALSE",
        "_dq_remarks   TEXT",
        "_golden_remarks TEXT",
    ]
    return ",\n    ".join(parts)


def create_dataset_table(
    conn: Connection,
    job_id: int,
    table_id: int,
    user_columns: list[str],
    *,
    replace: bool = False,
) -> str:
    """
    Create (or recreate) the physical table for a dataset.

    Returns the bare table name (without schema).
    """
    tbl = get_physical_table_name(job_id, table_id)
    fqn = full_table_ref(tbl)
    if replace:
        conn.execute(text(f"DROP TABLE IF EXISTS {fqn}"))
        logger.debug("Dropped %s for recreation", fqn)

    col_ddl = _build_column_ddl(user_columns)
    ddl = f"CREATE TABLE IF NOT EXISTS {fqn} (\n    {col_ddl}\n)"
    conn.execute(text(ddl))
    logger.info("Created physical table %s with %d user columns", fqn, len(user_columns))
    return tbl


def create_base_backup_table(
    conn: Connection,
    job_id: int,
    user_columns: list[str],
    *,
    replace: bool = False,
) -> str:
    """Create the pre-join base backup physical table for a job."""
    tbl = get_base_backup_table_name(job_id)
    fqn = full_table_ref(tbl)
    if replace:
        conn.execute(text(f"DROP TABLE IF EXISTS {fqn}"))
    col_ddl = _build_column_ddl(user_columns)
    ddl = f"CREATE TABLE IF NOT EXISTS {fqn} (\n    {col_ddl}\n)"
    conn.execute(text(ddl))
    logger.info("Created base backup table %s", fqn)
    return tbl


def drop_dataset_table(conn: Connection, job_id: int, table_id: int) -> None:
    """Drop the physical dataset table if it exists."""
    tbl = get_physical_table_name(job_id, table_id)
    conn.execute(text(f"DROP TABLE IF EXISTS {full_table_ref(tbl)}"))
    logger.info("Dropped physical table %s", tbl)


def drop_base_backup_table(conn: Connection, job_id: int) -> None:
    """Drop the pre-join base backup table if it exists."""
    tbl = get_base_backup_table_name(job_id)
    conn.execute(text(f"DROP TABLE IF EXISTS {full_table_ref(tbl)}"))
    logger.info("Dropped base backup table %s", tbl)


def migrate_legacy_physical_tables(engine: Engine) -> int:
    """Move legacy datasets.job_* physical tables into raw_column."""
    table_pattern = re.compile(r"^job_(\d+)_tbl_(\d+)$")
    base_pattern = re.compile(r"^job_(\d+)_base$")
    moved = 0
    with engine.begin() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {RAW_COLUMNS_SCHEMA}"))
        legacy_tables = conn.execute(
            text(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'datasets'
                  AND (table_name LIKE 'job_%_tbl_%' OR table_name LIKE 'job_%_base')
                """
            )
        ).fetchall()
        for (old_name,) in legacy_tables:
            table_match = table_pattern.fullmatch(old_name)
            base_match = base_pattern.fullmatch(old_name)
            if table_match:
                job_id, table_id = map(int, table_match.groups())
                new_name = get_physical_table_name(job_id, table_id)
            elif base_match:
                job_id, table_id = int(base_match.group(1)), None
                new_name = get_base_backup_table_name(job_id)
            else:
                continue
            if table_exists(conn, new_name, RAW_COLUMNS_SCHEMA):
                continue
            conn.execute(text(f"ALTER TABLE datasets.{old_name} RENAME TO {new_name}"))
            conn.execute(text(f"ALTER TABLE datasets.{new_name} SET SCHEMA {RAW_COLUMNS_SCHEMA}"))
            if table_id is not None:
                conn.execute(
                    text(
                        """
                        UPDATE metadata.dataset_physical_tables
                        SET physical_table_name = :name, schema_name = :schema
                        WHERE job_id = :job_id AND table_id = :table_id
                        """
                    ),
                    {
                        "name": new_name,
                        "schema": RAW_COLUMNS_SCHEMA,
                        "job_id": job_id,
                        "table_id": table_id,
                    },
                )
            moved += 1
        conn.execute(
            text(
                """
                UPDATE metadata.dataset_physical_tables
                SET schema_name = :schema
                WHERE physical_table_name LIKE 'raw_job_%'
                """
            ),
            {"schema": RAW_COLUMNS_SCHEMA},
        )
    return moved


def migrate_raw_table_names(engine: Engine) -> int:
    """Rename raw_job_*_table_*_data and *_base_data tables to shorter names."""
    data_pattern = re.compile(r"^raw_job_(\d+)_table_\d+_data$")
    backup_pattern = re.compile(r"^raw_job_(\d+)_base_data$")
    renamed = 0
    with engine.begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = :schema
                  AND (table_name LIKE 'raw_job_%_table_%_data'
                       OR table_name LIKE 'raw_job_%_base_data')
                """
            ),
            {"schema": RAW_COLUMNS_SCHEMA},
        ).fetchall()
        for (old_name,) in rows:
            data_match = data_pattern.fullmatch(old_name)
            backup_match = backup_pattern.fullmatch(old_name)
            if data_match:
                job_id = int(data_match.group(1))
                new_name = f"raw_job_{job_id}"
                table_id_row = conn.execute(
                    text(
                        """
                        SELECT table_id
                        FROM metadata.dataset_physical_tables
                        WHERE physical_table_name = :old_name
                        LIMIT 1
                        """
                    ),
                    {"old_name": old_name},
                ).first()
                table_id = table_id_row[0] if table_id_row else None
            elif backup_match:
                job_id = int(backup_match.group(1))
                new_name = f"raw_job_{job_id}_backup"
                table_id = None
            else:
                continue
            if table_exists(conn, new_name, RAW_COLUMNS_SCHEMA):
                continue
            conn.execute(text(f"ALTER TABLE {RAW_COLUMNS_SCHEMA}.{old_name} RENAME TO {new_name}"))
            if table_id is not None:
                conn.execute(
                    text(
                        """
                        UPDATE metadata.dataset_physical_tables
                        SET physical_table_name = :new_name
                        WHERE job_id = :job_id AND table_id = :table_id
                        """
                    ),
                    {"new_name": new_name, "job_id": job_id, "table_id": table_id},
                )
            renamed += 1
    return renamed


# ---------------------------------------------------------------------------
# Bulk-insert via PostgreSQL COPY (fast path)
# ---------------------------------------------------------------------------


def _df_to_tsv_buffer(df: pd.DataFrame) -> io.StringIO:
    """Serialise a DataFrame to a tab-delimited buffer suitable for COPY FROM STDIN."""
    buf = io.StringIO()
    df.to_csv(buf, index=False, sep="\t", na_rep="\\N", header=True)
    buf.seek(0)
    return buf


def bulk_copy_dataframe(
    raw_conn: Any,
    table_name: str,
    df: pd.DataFrame,
    schema: str = DATASETS_SCHEMA,
) -> int:
    """
    Fast-path insert using PostgreSQL COPY FROM STDIN.

    ``raw_conn`` must be a raw psycopg2 connection object.
    Returns the number of rows copied.
    """
    if df.empty:
        return 0

    fqn = f"{schema}.{table_name}"
    col_list = ", ".join(f'"{c}"' for c in df.columns)
    copy_sql = (
        f"COPY {fqn} ({col_list}) FROM STDIN "
        "WITH (FORMAT CSV, DELIMITER E'\\t', NULL '\\N', HEADER TRUE)"
    )

    buf = _df_to_tsv_buffer(df)
    cur = raw_conn.cursor()
    try:
        cur.copy_expert(copy_sql, buf)
        raw_conn.commit()
    finally:
        cur.close()

    return len(df)


# ---------------------------------------------------------------------------
# Fallback insert via SQLAlchemy executemany (non-psycopg2 drivers)
# ---------------------------------------------------------------------------


def batch_insert_dataframe(
    conn: Connection,
    table_name: str,
    df: pd.DataFrame,
    schema: str = DATASETS_SCHEMA,
    chunk_size: int = 2000,
) -> int:
    """
    Fallback insert using executemany in chunks.

    Used when the raw psycopg2 connection is not available (e.g., tests / other drivers).
    """
    if df.empty:
        return 0

    fqn = f"{schema}.{table_name}"
    cols = list(df.columns)
    col_list = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join(f":{c}" for c in cols)
    stmt = text(f"INSERT INTO {fqn} ({col_list}) VALUES ({placeholders})")

    records = df.where(pd.notnull(df), None).to_dict(orient="records")
    for start in range(0, len(records), chunk_size):
        conn.execute(stmt, records[start : start + chunk_size])

    return len(df)


# ---------------------------------------------------------------------------
# Schema bootstrap
# ---------------------------------------------------------------------------


def ensure_raw_columns_schema(engine: Engine) -> None:
    """Create the raw_column schema if it does not already exist."""
    with engine.begin() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {DATASETS_SCHEMA}"))
    logger.info("Ensured schema '%s' exists", DATASETS_SCHEMA)

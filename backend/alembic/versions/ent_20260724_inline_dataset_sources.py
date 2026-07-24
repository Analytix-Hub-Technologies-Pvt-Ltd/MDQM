"""Move source tables into schema datasets as datasetssource / datasources.

Revision ID: ent_20260724_inline_sources
Revises: ds_20260717_rename
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "ent_20260724_inline_sources"
down_revision = "ds_20260717_rename"
branch_labels = None
depends_on = None


def _table_exists(conn, schema: str, table: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                """
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = :schema
                  AND table_name = :table
                """
            ),
            {"schema": schema, "table": table},
        ).first()
    )


def _column_exists(conn, schema: str, table: str, column: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = :schema
                  AND table_name = :table
                  AND column_name = :column
                """
            ),
            {"schema": schema, "table": table, "column": column},
        ).first()
    )


def _rename_if_needed(conn, schema: str, old: str, new: str) -> None:
    if _table_exists(conn, schema, old) and not _table_exists(conn, schema, new):
        op.execute(f"ALTER TABLE {schema}.{old} RENAME TO {new}")


def upgrade() -> None:
    conn = op.get_bind()
    op.execute("CREATE SCHEMA IF NOT EXISTS datasets")

    # Prefer renaming existing underscored names in datasets
    _rename_if_needed(conn, "datasets", "dataset_source", "datasetssource")
    _rename_if_needed(conn, "datasets", "data_sources", "datasources")

    if not _table_exists(conn, "datasets", "datasetssource"):
        op.create_table(
            "datasetssource",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("enterprise_dataset_id", sa.Integer(), nullable=False),
            sa.Column("dataset_name", sa.Text(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["enterprise_dataset_id"],
                ["enterprise.datasets.id"],
                name="fk_datasets_datasetssource_enterprise_dataset_id",
            ),
            sa.ForeignKeyConstraint(
                ["created_by_user_id"],
                ["auth.users.id"],
                name="fk_datasets_datasetssource_created_by",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("enterprise_dataset_id"),
            schema="datasets",
        )

    if not _table_exists(conn, "datasets", "datasources"):
        op.create_table(
            "datasources",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("dataset_id", sa.Integer(), nullable=False),
            sa.Column("source_type", sa.Text(), nullable=False),
            sa.Column("db_connection_id", sa.Integer(), nullable=True),
            sa.Column("data_source_name", sa.Text(), nullable=False),
            sa.Column("join_configuration", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("mapping_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("created_by", sa.Integer(), nullable=True),
            sa.Column("created_date", sa.DateTime(), nullable=False),
            sa.Column("updated_date", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["dataset_id"],
                ["enterprise.datasets.id"],
                name="fk_datasets_datasources_dataset_id",
            ),
            sa.ForeignKeyConstraint(
                ["created_by"],
                ["auth.users.id"],
                name="fk_datasets_datasources_created_by",
            ),
            sa.PrimaryKeyConstraint("id"),
            schema="datasets",
        )

    for old_schema, table_name, target_name in (
        ("dataset_source", "dataset_source", "datasetssource"),
        ("dataset_details", "dataset_details", "datasetssource"),
        ("data_source", "data_sources", "datasources"),
    ):
        if not _table_exists(conn, old_schema, table_name):
            continue
        if _table_exists(conn, "datasets", target_name):
            if target_name == "datasetssource":
                conn.execute(
                    sa.text(
                        f"""
                        INSERT INTO datasets.datasetssource (
                          enterprise_dataset_id, dataset_name, description,
                          created_by_user_id, created_at, updated_at
                        )
                        SELECT
                          s.enterprise_dataset_id, s.dataset_name, s.description,
                          s.created_by_user_id, s.created_at, s.updated_at
                        FROM {old_schema}.{table_name} s
                        WHERE NOT EXISTS (
                          SELECT 1 FROM datasets.datasetssource d
                          WHERE d.enterprise_dataset_id = s.enterprise_dataset_id
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    sa.text(
                        f"""
                        INSERT INTO datasets.datasources (
                          dataset_id, source_type, db_connection_id, data_source_name,
                          join_configuration, mapping_config, created_by,
                          created_date, updated_date
                        )
                        SELECT
                          s.dataset_id, s.source_type, s.db_connection_id, s.data_source_name,
                          s.join_configuration, s.mapping_config, s.created_by,
                          s.created_date, s.updated_date
                        FROM {old_schema}.{table_name} s
                        WHERE NOT EXISTS (
                          SELECT 1 FROM datasets.datasources d WHERE d.id = s.id
                        )
                        """
                    )
                )
        else:
            if table_name != target_name:
                op.execute(f"ALTER TABLE {old_schema}.{table_name} RENAME TO {target_name}")
            op.execute(f"ALTER TABLE {old_schema}.{target_name} SET SCHEMA datasets")

    if _column_exists(conn, "enterprise", "datasets", "data_sources"):
        conn.execute(
            sa.text(
                """
                INSERT INTO datasets.datasources (
                  dataset_id, source_type, db_connection_id, data_source_name,
                  join_configuration, mapping_config, created_by,
                  created_date, updated_date
                )
                SELECT
                  d.id,
                  COALESCE(elem->>'source_type', 'file'),
                  NULLIF(elem->>'db_connection_id', '')::integer,
                  COALESCE(elem->>'data_source_name', 'source'),
                  elem->'join_configuration',
                  elem->'mapping_config',
                  NULLIF(elem->>'created_by', '')::integer,
                  COALESCE(NULLIF(elem->>'created_date', '')::timestamp, NOW()),
                  COALESCE(NULLIF(elem->>'updated_date', '')::timestamp, NOW())
                FROM enterprise.datasets d
                CROSS JOIN LATERAL jsonb_array_elements(
                  COALESCE(d.data_sources::jsonb, '[]'::jsonb)
                ) AS elem
                WHERE jsonb_typeof(COALESCE(d.data_sources::jsonb, '[]'::jsonb)) = 'array'
                  AND jsonb_array_length(COALESCE(d.data_sources::jsonb, '[]'::jsonb)) > 0
                  AND NOT EXISTS (
                    SELECT 1 FROM datasets.datasources s WHERE s.dataset_id = d.id
                  )
                """
            )
        )

    if _column_exists(conn, "enterprise", "datasets", "created_by_user_id") or _column_exists(
        conn, "enterprise", "datasets", "updated_at"
    ):
        has_created_by = _column_exists(conn, "enterprise", "datasets", "created_by_user_id")
        has_updated = _column_exists(conn, "enterprise", "datasets", "updated_at")
        created_by_expr = "d.created_by_user_id" if has_created_by else "d.owner_user_id"
        updated_expr = (
            "COALESCE(d.updated_at, d.created_at, NOW())"
            if has_updated
            else "COALESCE(d.created_at, NOW())"
        )
        conn.execute(
            sa.text(
                f"""
                INSERT INTO datasets.datasetssource (
                  enterprise_dataset_id, dataset_name, description,
                  created_by_user_id, created_at, updated_at
                )
                SELECT
                  d.id, d.name, d.description,
                  {created_by_expr}, d.created_at, {updated_expr}
                FROM enterprise.datasets d
                WHERE NOT EXISTS (
                  SELECT 1 FROM datasets.datasetssource s
                  WHERE s.enterprise_dataset_id = d.id
                )
                """
            )
        )

    op.execute("ALTER TABLE enterprise.datasets DROP COLUMN IF EXISTS data_sources")
    op.execute("ALTER TABLE enterprise.datasets DROP COLUMN IF EXISTS updated_at")
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = 'enterprise'
              AND table_name = 'datasets'
              AND constraint_name = 'fk_datasets_created_by_user_id'
          ) THEN
            ALTER TABLE enterprise.datasets DROP CONSTRAINT fk_datasets_created_by_user_id;
          END IF;
        END $$;
        """
    )
    op.execute("DROP INDEX IF EXISTS enterprise.ix_datasets_created_by_user_id")
    op.execute("ALTER TABLE enterprise.datasets DROP COLUMN IF EXISTS created_by_user_id")

    op.execute("DROP TABLE IF EXISTS datasets.dataset_source CASCADE")
    op.execute("DROP TABLE IF EXISTS datasets.data_sources CASCADE")
    op.execute("DROP SCHEMA IF EXISTS dataset_details CASCADE")
    op.execute("DROP SCHEMA IF EXISTS dataset_source CASCADE")
    op.execute("DROP SCHEMA IF EXISTS data_source CASCADE")


def downgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS dataset_source")
    op.execute("CREATE SCHEMA IF NOT EXISTS data_source")
    op.execute("ALTER TABLE datasets.datasetssource RENAME TO dataset_source")
    op.execute("ALTER TABLE datasets.datasources RENAME TO data_sources")
    op.execute("ALTER TABLE datasets.dataset_source SET SCHEMA dataset_source")
    op.execute("ALTER TABLE datasets.data_sources SET SCHEMA data_source")

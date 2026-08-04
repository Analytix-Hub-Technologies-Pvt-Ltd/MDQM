"""Rename datasets.datasetssource to datasets.datasets.

Revision ID: ds_20260804_rename_datasets
Revises: ent_20260724_inline_dataset_sources
Create Date: 2026-08-04
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "ds_20260804_rename_datasets"
down_revision = "ent_20260724_inline_sources"
branch_labels = None
depends_on = None


def _table_exists(conn, schema: str, table: str) -> bool:
    row = conn.execute(
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
    return row is not None


def upgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "datasets", "datasetssource") and not _table_exists(
        conn, "datasets", "datasets"
    ):
        op.execute("ALTER TABLE datasets.datasetssource RENAME TO datasets")
    elif _table_exists(conn, "datasets", "datasetssource") and _table_exists(
        conn, "datasets", "datasets"
    ):
        conn.execute(
            sa.text(
                """
                INSERT INTO datasets.datasets (
                  enterprise_dataset_id, dataset_name, description,
                  created_by_user_id, created_at, updated_at
                )
                SELECT
                  s.enterprise_dataset_id, s.dataset_name, s.description,
                  s.created_by_user_id, s.created_at, s.updated_at
                FROM datasets.datasetssource s
                WHERE NOT EXISTS (
                  SELECT 1 FROM datasets.datasets d
                  WHERE d.enterprise_dataset_id = s.enterprise_dataset_id
                )
                """
            )
        )
        op.execute("DROP TABLE datasets.datasetssource CASCADE")


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "datasets", "datasets") and not _table_exists(
        conn, "datasets", "datasetssource"
    ):
        op.execute("ALTER TABLE datasets.datasets RENAME TO datasetssource")

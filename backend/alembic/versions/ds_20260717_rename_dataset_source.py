"""Rename dataset_details schema/table to dataset_source.

Revision ID: ds_20260717_rename
Revises: ds_20260717_sources
"""

from alembic import op
import sqlalchemy as sa

revision = "ds_20260717_rename"
down_revision = "ds_20260717_sources"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    legacy = conn.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'dataset_details'
              AND table_name = 'dataset_details'
            """
        )
    ).first()
    new_exists = conn.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'dataset_source'
              AND table_name = 'dataset_source'
            """
        )
    ).first()

    if legacy and not new_exists:
        op.execute("CREATE SCHEMA IF NOT EXISTS dataset_source")
        op.execute("ALTER TABLE dataset_details.dataset_details SET SCHEMA dataset_source")
        op.execute("ALTER TABLE dataset_source.dataset_details RENAME TO dataset_source")
    elif not new_exists:
        op.execute("CREATE SCHEMA IF NOT EXISTS dataset_source")
        op.create_table(
            "dataset_source",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("enterprise_dataset_id", sa.Integer(), nullable=False),
            sa.Column("dataset_name", sa.Text(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("enterprise_dataset_id"),
            sa.ForeignKeyConstraint(
                ["enterprise_dataset_id"],
                ["enterprise.datasets.id"],
                name="fk_dataset_source_enterprise_dataset_id",
            ),
            sa.ForeignKeyConstraint(
                ["created_by_user_id"],
                ["auth.users.id"],
                name="fk_dataset_source_created_by",
            ),
            schema="dataset_source",
        )
        op.create_index(
            "ix_dataset_source_enterprise_dataset_id",
            "dataset_source",
            ["enterprise_dataset_id"],
            schema="dataset_source",
        )
        op.create_index(
            "ix_dataset_source_created_by_user_id",
            "dataset_source",
            ["created_by_user_id"],
            schema="dataset_source",
        )

    op.execute("DROP SCHEMA IF EXISTS dataset_details CASCADE")


def downgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS dataset_details")
    op.execute("ALTER TABLE dataset_source.dataset_source SET SCHEMA dataset_details")
    op.execute("ALTER TABLE dataset_details.dataset_source RENAME TO dataset_details")
    op.execute("DROP SCHEMA IF EXISTS dataset_source CASCADE")

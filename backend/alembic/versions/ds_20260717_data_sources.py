"""Create data_source.data_sources table linked to enterprise.datasets.

Revision ID: ds_20260717_sources
Revises: dd_20260717_details
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "ds_20260717_sources"
down_revision = "dd_20260717_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS data_source")
    op.create_table(
        "data_sources",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("dataset_id", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.Text(), nullable=False),
        sa.Column("db_connection_id", sa.Integer(), nullable=True),
        sa.Column("data_source_name", sa.Text(), nullable=False),
        sa.Column("join_configuration", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("mapping_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_date", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_date", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["enterprise.datasets.id"],
            name="fk_data_sources_dataset_id",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["auth.users.id"],
            name="fk_data_sources_created_by",
        ),
        schema="data_source",
    )
    op.create_index(
        "ix_data_sources_dataset_id",
        "data_sources",
        ["dataset_id"],
        schema="data_source",
    )
    op.create_index(
        "ix_data_sources_db_connection_id",
        "data_sources",
        ["db_connection_id"],
        schema="data_source",
    )
    op.create_index(
        "ix_data_sources_created_by",
        "data_sources",
        ["created_by"],
        schema="data_source",
    )


def downgrade() -> None:
    op.drop_index("ix_data_sources_created_by", table_name="data_sources", schema="data_source")
    op.drop_index("ix_data_sources_db_connection_id", table_name="data_sources", schema="data_source")
    op.drop_index("ix_data_sources_dataset_id", table_name="data_sources", schema="data_source")
    op.drop_table("data_sources", schema="data_source")
    op.execute("DROP SCHEMA IF EXISTS data_source")

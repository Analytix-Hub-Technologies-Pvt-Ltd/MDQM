"""Create dataset_details schema and table for description + audit metadata.

Revision ID: dd_20260717_details
Revises: ent_20260626_gold
"""

from alembic import op
import sqlalchemy as sa

revision = "dd_20260717_details"
down_revision = "ent_20260626_gold"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS dataset_details")
    op.create_table(
        "dataset_details",
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
            name="fk_dataset_details_enterprise_dataset_id",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["auth.users.id"],
            name="fk_dataset_details_created_by",
        ),
        schema="dataset_details",
    )
    op.create_index(
        "ix_dataset_details_enterprise_dataset_id",
        "dataset_details",
        ["enterprise_dataset_id"],
        schema="dataset_details",
    )
    op.create_index(
        "ix_dataset_details_created_by_user_id",
        "dataset_details",
        ["created_by_user_id"],
        schema="dataset_details",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_dataset_details_created_by_user_id",
        table_name="dataset_details",
        schema="dataset_details",
    )
    op.drop_index(
        "ix_dataset_details_enterprise_dataset_id",
        table_name="dataset_details",
        schema="dataset_details",
    )
    op.drop_table("dataset_details", schema="dataset_details")
    op.execute("DROP SCHEMA IF EXISTS dataset_details")

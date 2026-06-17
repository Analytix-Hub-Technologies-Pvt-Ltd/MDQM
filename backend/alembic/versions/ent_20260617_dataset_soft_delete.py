"""Add soft-delete columns to enterprise.datasets for recycle bin.

Revision ID: ent_20260617_softdel
Revises: mdqm_20260520_src
"""

from alembic import op
import sqlalchemy as sa

revision = "ent_20260617_softdel"
down_revision = "mdqm_20260520_src"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("datasets", sa.Column("deleted_at", sa.DateTime(), nullable=True), schema="enterprise")
    op.add_column("datasets", sa.Column("purge_at", sa.DateTime(), nullable=True), schema="enterprise")
    op.add_column("datasets", sa.Column("deleted_by_user_id", sa.Integer(), nullable=True), schema="enterprise")
    op.create_index("ix_enterprise_datasets_deleted_at", "datasets", ["deleted_at"], schema="enterprise")
    op.create_index("ix_enterprise_datasets_purge_at", "datasets", ["purge_at"], schema="enterprise")
    op.create_foreign_key(
        "fk_enterprise_datasets_deleted_by",
        "datasets",
        "users",
        ["deleted_by_user_id"],
        ["id"],
        source_schema="enterprise",
        referent_schema="auth",
    )


def downgrade() -> None:
    op.drop_constraint("fk_enterprise_datasets_deleted_by", "datasets", schema="enterprise", type_="foreignkey")
    op.drop_index("ix_enterprise_datasets_purge_at", table_name="datasets", schema="enterprise")
    op.drop_index("ix_enterprise_datasets_deleted_at", table_name="datasets", schema="enterprise")
    op.drop_column("datasets", "deleted_by_user_id", schema="enterprise")
    op.drop_column("datasets", "purge_at", schema="enterprise")
    op.drop_column("datasets", "deleted_at", schema="enterprise")

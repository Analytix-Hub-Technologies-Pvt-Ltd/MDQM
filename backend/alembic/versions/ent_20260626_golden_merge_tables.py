"""Create golden merge candidates and configs tables.

Revision ID: ent_20260626_gold
Revises: ent_20260617_softdel
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "ent_20260626_gold"
down_revision = "ent_20260617_softdel"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create golden_merge_configs table in metadata schema
    op.create_table(
        "golden_merge_configs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("dataset_id", sa.Integer(), nullable=False),
        sa.Column("source_priority", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("auto_merge_threshold", sa.Float(), nullable=False),
        sa.Column("review_threshold", sa.Float(), nullable=False),
        sa.Column("column_overrides", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dataset_id"),
        sa.ForeignKeyConstraint(["dataset_id"], ["enterprise.datasets.id"], name="fk_golden_merge_configs_dataset_id"),
        schema="metadata"
    )
    
    # Create golden_merge_candidates table in metadata schema
    op.create_table(
        "golden_merge_candidates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("dataset_id", sa.Integer(), nullable=False),
        sa.Column("row_group_key", sa.String(length=512), nullable=False),
        sa.Column("source_values", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("column_scores", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("row_score", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("golden_values", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("resolved_by_user_id", sa.Integer(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("merge_config_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["dataset_id"], ["enterprise.datasets.id"], name="fk_golden_merge_candidates_dataset_id"),
        sa.ForeignKeyConstraint(["resolved_by_user_id"], ["auth.users.id"], name="fk_golden_merge_candidates_resolved_by"),
        schema="metadata"
    )
    
    op.create_index("ix_metadata_golden_merge_candidates_dataset_id", "golden_merge_candidates", ["dataset_id"], schema="metadata")
    op.create_index("ix_metadata_golden_merge_candidates_status", "golden_merge_candidates", ["status"], schema="metadata")


def downgrade() -> None:
    op.drop_index("ix_metadata_golden_merge_candidates_status", table_name="golden_merge_candidates", schema="metadata")
    op.drop_index("ix_metadata_golden_merge_candidates_dataset_id", table_name="golden_merge_candidates", schema="metadata")
    op.drop_table("golden_merge_candidates", schema="metadata")
    op.drop_table("golden_merge_configs", schema="metadata")

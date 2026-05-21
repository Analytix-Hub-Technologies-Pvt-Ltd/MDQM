"""Add metadata.jobs.db_source_config for DB-backed dataset refresh.

Revision ID: mdqm_20260520_src
Revises: bu_20260519
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "mdqm_20260520_src"
down_revision = "bu_20260519"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column("db_source_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        schema="metadata",
    )


def downgrade() -> None:
    op.drop_column("jobs", "db_source_config", schema="metadata")

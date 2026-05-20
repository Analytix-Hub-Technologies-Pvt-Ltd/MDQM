"""Business user dashboard: dataset quality fields, glossary extras, reports, alert subscriptions.

Revision ID: bu_20260519
Revises: ent_20260512
Create Date: 2026-05-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "bu_20260519"
down_revision = "ent_20260512"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("datasets", sa.Column("job_id", sa.Integer(), nullable=True), schema="enterprise")
    op.add_column("datasets", sa.Column("tier", sa.String(32), nullable=True), schema="enterprise")
    op.add_column("datasets", sa.Column("quality_score", sa.Integer(), nullable=True), schema="enterprise")
    op.add_column("datasets", sa.Column("record_count_label", sa.String(64), nullable=True), schema="enterprise")
    op.add_column("datasets", sa.Column("pii", sa.Boolean(), nullable=False, server_default=sa.text("false")), schema="enterprise")
    op.add_column("datasets", sa.Column("steward_name", sa.String(255), nullable=True), schema="enterprise")
    op.create_foreign_key(
        "fk_enterprise_datasets_job_id",
        "datasets",
        "jobs",
        ["job_id"],
        ["job_id"],
        source_schema="enterprise",
        referent_schema="metadata",
    )

    op.add_column("glossary", sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=True), schema="enterprise")
    op.add_column("glossary", sa.Column("related_terms", postgresql.JSONB(astext_type=sa.Text()), nullable=True), schema="enterprise")
    op.add_column("glossary", sa.Column("owner_user_id", sa.Integer(), nullable=True), schema="enterprise")
    op.create_foreign_key(
        "fk_enterprise_glossary_owner",
        "glossary",
        "users",
        ["owner_user_id"],
        ["id"],
        source_schema="enterprise",
        referent_schema="auth",
    )

    op.create_table(
        "business_reports",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("report_type", sa.String(64), nullable=False),
        sa.Column("dataset_name", sa.String(255), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="Certified"),
        sa.Column("quality_score", sa.Integer(), nullable=True),
        sa.Column("last_refreshed_label", sa.String(64), nullable=True),
        sa.Column("external_url", sa.String(512), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["auth.users.id"]),
        schema="enterprise",
    )

    op.create_table(
        "alert_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("dataset_name", sa.String(255), nullable=False),
        sa.Column("threshold", sa.Integer(), nullable=False, server_default="85"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["auth.users.id"]),
        schema="enterprise",
    )
    op.create_index("ix_alert_subscriptions_user", "alert_subscriptions", ["user_id"], schema="enterprise")


def downgrade() -> None:
    op.drop_index("ix_alert_subscriptions_user", table_name="alert_subscriptions", schema="enterprise")
    op.drop_table("alert_subscriptions", schema="enterprise")
    op.drop_table("business_reports", schema="enterprise")
    op.drop_constraint("fk_enterprise_glossary_owner", "glossary", schema="enterprise", type_="foreignkey")
    op.drop_column("glossary", "owner_user_id", schema="enterprise")
    op.drop_column("glossary", "related_terms", schema="enterprise")
    op.drop_column("glossary", "tags", schema="enterprise")
    op.drop_constraint("fk_enterprise_datasets_job_id", "datasets", schema="enterprise", type_="foreignkey")
    for col in ("steward_name", "pii", "record_count_label", "quality_score", "tier", "job_id"):
        op.drop_column("datasets", col, schema="enterprise")

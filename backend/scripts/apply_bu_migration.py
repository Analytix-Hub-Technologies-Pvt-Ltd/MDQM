"""Apply business-user DB changes (run: .venv\\Scripts\\python scripts/apply_bu_migration.py)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import engine

STATEMENTS = [
    "ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS job_id INTEGER",
    "ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS tier VARCHAR(32)",
    "ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS quality_score INTEGER",
    "ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS record_count_label VARCHAR(64)",
    "ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS pii BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS steward_name VARCHAR(255)",
    "CREATE INDEX IF NOT EXISTS ix_enterprise_datasets_job_id ON enterprise.datasets (job_id)",
    "ALTER TABLE enterprise.glossary ADD COLUMN IF NOT EXISTS tags JSONB",
    "ALTER TABLE enterprise.glossary ADD COLUMN IF NOT EXISTS related_terms JSONB",
    "ALTER TABLE enterprise.glossary ADD COLUMN IF NOT EXISTS owner_user_id INTEGER",
]

FK_STATEMENTS = [
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'fk_enterprise_datasets_job_id'
              AND conrelid = 'enterprise.datasets'::regclass
        ) THEN
            ALTER TABLE enterprise.datasets
                ADD CONSTRAINT fk_enterprise_datasets_job_id
                FOREIGN KEY (job_id) REFERENCES metadata.jobs (job_id);
        END IF;
    END $$
    """,
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'fk_enterprise_glossary_owner'
              AND conrelid = 'enterprise.glossary'::regclass
        ) THEN
            ALTER TABLE enterprise.glossary
                ADD CONSTRAINT fk_enterprise_glossary_owner
                FOREIGN KEY (owner_user_id) REFERENCES auth.users (id);
        END IF;
    END $$
    """,
]

TABLE_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS enterprise.business_reports (
        id SERIAL NOT NULL,
        title VARCHAR(255) NOT NULL,
        report_type VARCHAR(64) NOT NULL,
        dataset_name VARCHAR(255),
        status VARCHAR(32) NOT NULL DEFAULT 'Certified',
        quality_score INTEGER,
        last_refreshed_label VARCHAR(64),
        external_url VARCHAR(512),
        user_id INTEGER,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id),
        FOREIGN KEY (user_id) REFERENCES auth.users (id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_enterprise_business_reports_user_id ON enterprise.business_reports (user_id)",
    """
    CREATE TABLE IF NOT EXISTS enterprise.alert_subscriptions (
        id SERIAL NOT NULL,
        user_id INTEGER NOT NULL,
        dataset_name VARCHAR(255) NOT NULL,
        threshold INTEGER NOT NULL DEFAULT 85,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id),
        FOREIGN KEY (user_id) REFERENCES auth.users (id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_alert_subscriptions_user ON enterprise.alert_subscriptions (user_id)",
]


def main():
    with engine.begin() as conn:
        for sql in STATEMENTS + FK_STATEMENTS + TABLE_STATEMENTS:
            conn.execute(text(sql))
            print("OK:", sql.strip().split("\n")[0][:70], "...")
    print("Migration applied. Run: python scripts/check_bu_schema.py")


if __name__ == "__main__":
    main()

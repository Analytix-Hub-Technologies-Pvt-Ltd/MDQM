"""Apply business-user DB changes (run: .venv\\Scripts\\python scripts/apply_bu_migration.py)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import engine

STATEMENTS = [
    "ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS job_id INTEGER REFERENCES metadata.jobs(job_id)",
    "ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS tier VARCHAR(32)",
    "ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS quality_score INTEGER",
    "ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS record_count_label VARCHAR(64)",
    "ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS pii BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE enterprise.datasets ADD COLUMN IF NOT EXISTS steward_name VARCHAR(255)",
    "ALTER TABLE enterprise.glossary ADD COLUMN IF NOT EXISTS tags JSONB",
    "ALTER TABLE enterprise.glossary ADD COLUMN IF NOT EXISTS related_terms JSONB",
    "ALTER TABLE enterprise.glossary ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES auth.users(id)",
]


def main():
    with engine.begin() as conn:
        for sql in STATEMENTS:
            conn.execute(text(sql))
            print("OK:", sql[:70], "...")
    print("Migration applied. Run: python scripts/check_bu_schema.py")


if __name__ == "__main__":
    main()

"""Quick check: business-user migration columns exist."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal

EXPECTED_DATASET_COLS = {
    "job_id",
    "tier",
    "quality_score",
    "record_count_label",
    "pii",
    "steward_name",
}
EXPECTED_GLOSSARY_COLS = {"tags", "related_terms", "owner_user_id"}
EXPECTED_TABLES = ("business_reports", "alert_subscriptions")


def main():
    db = SessionLocal()
    try:
        cols = db.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='enterprise' AND table_name='datasets'"
            )
        ).fetchall()
        colset = {r[0] for r in cols}
        missing = EXPECTED_DATASET_COLS - colset
        if missing:
            print("MIGRATION NEEDED — missing on enterprise.datasets:", sorted(missing))
        else:
            print("OK — enterprise.datasets extended columns present")

        gcols = db.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='enterprise' AND table_name='glossary'"
            )
        ).fetchall()
        gset = {r[0] for r in gcols}
        gmissing = EXPECTED_GLOSSARY_COLS - gset
        if gmissing:
            print("MIGRATION NEEDED — missing on enterprise.glossary:", sorted(gmissing))
        else:
            print("OK — enterprise.glossary extended columns present")

        for table in EXPECTED_TABLES:
            n = db.execute(
                text(
                    "SELECT COUNT(*) FROM information_schema.tables "
                    "WHERE table_schema='enterprise' AND table_name=:t"
                ),
                {"t": table},
            ).scalar()
            print(f"{'OK' if n else 'MISSING'} — enterprise.{table}")
    finally:
        db.close()

if __name__ == "__main__":
    main()

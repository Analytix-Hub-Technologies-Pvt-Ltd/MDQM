"""Quick check: business-user migration columns exist."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal

EXPECTED = {"job_id", "tier", "quality_score", "business_reports", "alert_subscriptions"}

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
        missing = {"job_id", "tier", "quality_score", "pii"} - colset
        if missing:
            print("MIGRATION NEEDED — missing on enterprise.datasets:", sorted(missing))
        else:
            print("OK — enterprise.datasets extended columns present")

        for table in ("business_reports", "alert_subscriptions"):
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

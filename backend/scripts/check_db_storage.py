"""Quick check: dataset rows stored in metadata.dataset_rows."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import SessionLocal, engine
from sqlalchemy import text
import models

with engine.connect() as c:
    tables = c.execute(
        text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema='metadata' AND table_name IN ('dataset_rows','dataset_base_backup_rows')"
        )
    ).fetchall()
    has_col = c.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema='metadata' AND table_name='table_metadata' AND column_name='data_updated_at'"
        )
    ).first()

print("metadata.dataset_rows exists:", any(t[0] == "dataset_rows" for t in tables))
print("metadata.dataset_base_backup_rows exists:", any(t[0] == "dataset_base_backup_rows" for t in tables))
print("table_metadata.data_updated_at exists:", bool(has_col))

db = SessionLocal()
total = db.query(models.DatasetRow).count()
jobs = db.execute(text("SELECT COUNT(DISTINCT job_id) FROM metadata.dataset_rows")).scalar() or 0
print(f"Total stored rows: {total} across {jobs} job(s)")

rows = db.execute(
    text(
        """
        SELECT dr.job_id, tm.table_name, COUNT(*) AS row_count, MAX(tm.data_updated_at) AS updated_at
        FROM metadata.dataset_rows dr
        JOIN metadata.table_metadata tm ON tm.job_id = dr.job_id AND tm.table_id = dr.table_id
        GROUP BY dr.job_id, tm.table_name
        ORDER BY MAX(tm.data_updated_at) DESC NULLS LAST
        LIMIT 5
        """
    )
).fetchall()
if rows:
    print("\nLatest DB snapshots:")
    for r in rows:
        print(f"  job {r[0]} | {r[1]} | {r[2]} rows | updated {r[3]}")
else:
    print("\nNo rows in metadata.dataset_rows yet — refresh or import a dataset after this change.")

db.close()

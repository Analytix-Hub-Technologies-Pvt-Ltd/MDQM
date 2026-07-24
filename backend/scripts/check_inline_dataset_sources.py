"""Verify tables: datasets.datasetssource and datasets.datasources."""

from sqlalchemy import text
from database import SessionLocal


def main() -> None:
    db = SessionLocal()
    try:
        print("=== Tables in schema datasets (source tables) ===")
        tables = db.execute(
            text(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'datasets'
                  AND table_name IN (
                    'datasetssource', 'datasources',
                    'dataset_source', 'data_sources'
                  )
                ORDER BY table_name
                """
            )
        ).fetchall()
        print([t[0] for t in tables])

        print()
        print("=== Sample datasets.datasetssource ===")
        if any(t[0] == "datasetssource" for t in tables):
            for r in db.execute(
                text(
                    "SELECT id, enterprise_dataset_id, dataset_name "
                    "FROM datasets.datasetssource ORDER BY id LIMIT 5"
                )
            ):
                print(" ", r)
        else:
            print("  missing")
    finally:
        db.close()


if __name__ == "__main__":
    main()

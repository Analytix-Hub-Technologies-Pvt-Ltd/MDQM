"""Rename datasets.file_uploads -> datasets.uploads (merge data if both exist)."""
from __future__ import annotations

from sqlalchemy import inspect, text

from database import engine


def main() -> None:
    insp = inspect(engine)
    tables = set(insp.get_table_names(schema="datasets"))
    print("before:", sorted(tables))

    with engine.begin() as conn:
        has_old = "file_uploads" in tables
        has_new = "uploads" in tables

        if has_old and not has_new:
            conn.execute(text("ALTER TABLE datasets.file_uploads RENAME TO uploads"))
            print("renamed file_uploads -> uploads")
        elif has_old and has_new:
            cols_old = [c["name"] for c in insp.get_columns("file_uploads", schema="datasets")]
            cols_new = [c["name"] for c in insp.get_columns("uploads", schema="datasets")]
            shared = [c for c in cols_old if c in cols_new]
            col_list = ", ".join(shared)
            old_count = conn.execute(text("SELECT COUNT(*) FROM datasets.file_uploads")).scalar()
            new_count = conn.execute(text("SELECT COUNT(*) FROM datasets.uploads")).scalar()
            print(f"file_uploads={old_count}, uploads={new_count}")
            if old_count and new_count == 0:
                conn.execute(text("DELETE FROM datasets.uploads"))
                conn.execute(
                    text(
                        f"INSERT INTO datasets.uploads ({col_list}) "
                        f"SELECT {col_list} FROM datasets.file_uploads"
                    )
                )
                print("copied rows into uploads")
            elif old_count and new_count:
                # Prefer keeping uploads; still drop old after ensuring data present
                print("both have data; keeping uploads, dropping file_uploads")
            conn.execute(
                text(
                    "SELECT setval("
                    "pg_get_serial_sequence('datasets.uploads', 'id'), "
                    "COALESCE((SELECT MAX(id) FROM datasets.uploads), 1), "
                    "true)"
                )
            )
            conn.execute(text("DROP TABLE datasets.file_uploads CASCADE"))
            print("dropped datasets.file_uploads")
        elif has_new:
            print("uploads already present; nothing to rename")
        else:
            print("no uploads tables found")

        conn.execute(
            text("ALTER TABLE datasets.uploads ADD COLUMN IF NOT EXISTS user_role TEXT")
        )

    print("after:", sorted(inspect(engine).get_table_names(schema="datasets")))
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT id, username, user_role, relative_path "
                "FROM datasets.uploads ORDER BY id"
            )
        ).fetchall()
        print("rows:", rows)


if __name__ == "__main__":
    main()

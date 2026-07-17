"""Migrate GENDER contains->exact_values so Female no longer passes as Male."""
from database import SessionLocal
from models import Rule
from sqlalchemy import func


def main():
    db = SessionLocal()
    try:
        rules = (
            db.query(Rule)
            .filter(func.lower(Rule.column_name) == "gender")
            .filter(func.lower(Rule.rule_type) == "contains")
            .all()
        )
        if not rules:
            print("No GENDER contains rules to update.")
            return

        for r in rules:
            old = r.rule_type
            r.rule_type = "exact_values"
            print(
                f"Updated rule_id={r.rule_id} job={r.job_id} table={r.table_id}: "
                f"{old!r} -> 'exact_values' (value={r.rule_value!r})"
            )
        db.commit()
        print(f"Done. Updated {len(rules)} rule(s).")
    finally:
        db.close()


if __name__ == "__main__":
    main()

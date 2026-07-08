import pandas as pd
import os
from datetime import datetime
from sqlalchemy.orm import Session
import models

# --- IMPORT THE NEW LIBRARY ---
from .rule_library import RuleLibrary
from services.dq_remarks_helper import build_categorized_dq_remarks

from utils.upload_paths import resolve_table_csv_path


def load_real_csv(job_id: int, table_name: str, db: Session | None = None):
    if db is not None:
        from services.dataset_row_storage_service import load_snapshot_with_csv_fallback

        return load_snapshot_with_csv_fallback(db, job_id, table_name)
    file_path = resolve_table_csv_path(job_id, table_name)
    return pd.read_csv(file_path) if file_path else None


def save_dataframe_to_sql(df, table_name, job_id, suffix, db_engine):
    full_table_name = f"{table_name}_job{job_id}_{suffix}".lower()

    try:
        df.to_sql(name=full_table_name, con=db_engine, schema="app_data", if_exists="replace", index=False)
        print(f"    -> Saved {len(df)} rows to {full_table_name} in app_data")
    except Exception as e:
        print(f"    [Error saving {full_table_name}]: {e}")


def _evaluate_row_rules(row: pd.Series, rules: list, master_data_cache: dict, data_columns: list[str]) -> dict:
    """Per-column DQ flags; golden record only when fuzzy match merges to master."""
    column_flags: dict[str, dict] = {}
    row_errors: list[dict] = []
    val_errs = 0
    fuzzy_errs = 0
    golden_matches: list[str] = []
    merged_values: dict[str, str] = {}

    for rule in rules:
        col = rule.column_name.strip()
        if col not in data_columns:
            continue

        if col not in column_flags:
            column_flags[col] = {"passed": True, "remark": None}

        val = row[col]
        if pd.isna(val):
            val = ""

        valid, msg = RuleLibrary.validate(
            val, rule.rule_type, rule.rule_value, master_data_cache.get(col)
        )

        if not valid:
            etype = "Fuzzy" if rule.rule_type == "fuzzy_match" else "Validation"
            column_flags[col]["passed"] = False
            column_flags[col]["remark"] = msg
            column_flags[col]["category"] = etype
            if etype == "Fuzzy":
                fuzzy_errs += 1
            else:
                val_errs += 1
            row_errors.append({"col": col, "type": etype, "msg": msg, "val": str(val)})
        elif rule.rule_type == "fuzzy_match" and msg:
            master_val = str(msg)
            golden_matches.append(f"{col}: '{val}' merged to '{master_val}'")
            merged_values[col] = master_val

    is_clean = not row_errors
    is_golden = bool(golden_matches)
    dq_remarks, dq_failed_remarks = build_categorized_dq_remarks(row_errors)
    golden_remarks = (
        "Fuzzy match — merged multiple source values to master: " + "; ".join(golden_matches)
        if golden_matches
        else None
    )

    return {
        "is_clean": is_clean,
        "column_flags": column_flags,
        "row_errors": row_errors,
        "val_errs": val_errs,
        "fuzzy_errs": fuzzy_errs,
        "is_golden_record": is_golden,
        "dq_remarks": dq_remarks,
        "dq_failed_remarks": dq_failed_remarks,
        "golden_remarks": golden_remarks,
        "merged_values": merged_values,
    }


def run_data_quality_job(job_id: int, db: Session):
    print(f"--- [START] Job {job_id} ---")
    job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not job:
        return

    job.status = "Running"
    job.start_time = datetime.now()
    db.commit()

    try:
        tables = db.query(models.TableMetadata).filter(models.TableMetadata.job_id == job_id).all()

        for table in tables:
            print(f"Processing {table.table_name}...")
            df = load_real_csv(job_id, table.table_name, db)
            if df is None:
                print(f"ERROR: Could not find CSV for job {job_id} table {table.table_name}")
                continue

            df.columns = df.columns.str.strip()

            db.query(models.QuarantineLog).filter(
                models.QuarantineLog.job_id == job_id,
                models.QuarantineLog.table_name == table.table_name,
            ).delete()
            db.commit()

            raw_rules = (
                db.query(models.Rule)
                .filter(
                    models.Rule.table_id == table.table_id,
                    models.Rule.job_id == job_id,
                    models.Rule.is_active == True,
                )
                .all()
            )
            rules = list({r.rule_id: r for r in raw_rules}.values())

            master_data_cache = {}
            for r in rules:
                if r.rule_type == "fuzzy_match":
                    masters = (
                        db.query(models.MasterTable.master_value)
                        .filter(
                            models.MasterTable.job_id == job_id,
                            models.MasterTable.table_id == table.table_id,
                        )
                        .all()
                    )
                    master_data_cache[r.column_name.strip()] = [m[0] for m in masters]

            date_rules = [r for r in rules if r.rule_type == "date_format_check"]
            for d_rule in date_rules:
                col = d_rule.column_name.strip()
                target_fmt = d_rule.rule_value

                def standardize_date(val, fmt=target_fmt):
                    if pd.isna(val) or str(val).strip() == "":
                        return val
                    clean_val = str(val).replace("/", "-").replace(".", "-").replace("\\", "-")
                    try:
                        return datetime.strptime(clean_val, fmt).strftime(fmt)
                    except Exception:
                        return val

                df[col] = df[col].apply(standardize_date)

            data_columns = [c for c in df.columns if c not in ("job_id", "table_id")]

            clean_rows = []
            error_rows = []
            quarantine_logs = []
            dq_results = []
            val_errs = 0
            fuzzy_errs = 0

            for row_index, (_, row) in enumerate(df.iterrows()):
                evaluated = _evaluate_row_rules(row, rules, master_data_cache, data_columns)
                val_errs += evaluated["val_errs"]
                fuzzy_errs += evaluated["fuzzy_errs"]

                dq_results.append(
                    {
                        "row_index": row_index,
                        "column_flags": evaluated["column_flags"],
                        "row_errors": evaluated["row_errors"],
                        "is_golden_record": evaluated["is_golden_record"],
                        "dq_remarks": evaluated["dq_remarks"],
                        "dq_failed_remarks": evaluated["dq_failed_remarks"],
                        "golden_remarks": evaluated["golden_remarks"],
                        "merged_values": evaluated["merged_values"],
                    }
                )

                row_dict = row.to_dict()
                if evaluated["is_clean"]:
                    clean_rows.append(row_dict)
                else:
                    error_rows.append(row_dict)
                    for err in evaluated["row_errors"]:
                        master_match = None
                        if err["type"] == "Fuzzy" and err.get("msg"):
                            master_match = err["msg"]
                        quarantine_logs.append(
                            models.QuarantineLog(
                                job_id=job_id,
                                table_name=table.table_name,
                                row_id=row_index,
                                column_name=err["col"],
                                error_type=err["type"],
                                error_value=err["val"],
                                description=err["msg"],
                                master_match=master_match,
                            )
                        )

            from services.dataset_row_storage_service import apply_dq_results

            apply_dq_results(db, job_id, table.table_id, dq_results)

            out_columns = list(df.columns)
            clean_df = pd.DataFrame(clean_rows, columns=out_columns) if clean_rows else pd.DataFrame(columns=out_columns)
            error_df = pd.DataFrame(error_rows, columns=out_columns) if error_rows else pd.DataFrame(columns=out_columns)

            save_dataframe_to_sql(clean_df, table.table_name, job_id, "clean", db.get_bind())
            save_dataframe_to_sql(error_df, table.table_name, job_id, "error", db.get_bind())

            if quarantine_logs:
                db.bulk_save_objects(quarantine_logs)

            db.add(
                models.TableStats(
                    job_id=job_id,
                    table_id=table.table_id,
                    table_name=table.table_name,
                    start_time=job.start_time,
                    end_time=datetime.now(),
                    total_rows=len(df),
                    validation_errors=val_errs,
                    fuzzy_errors=fuzzy_errs,
                    good_rows=len(clean_rows),
                )
            )

        job.status = "Completed"

    except Exception as e:
        print(f"ERROR: {e}")
        job.status = "Failed"

    job.end_time = datetime.now()
    db.commit()
    print("--- Job Finished ---")

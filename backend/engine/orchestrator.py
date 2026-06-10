import pandas as pd
import os
from datetime import datetime
from sqlalchemy.orm import Session
import models

# --- IMPORT THE NEW LIBRARY ---
from .rule_library import RuleLibrary 

from utils.upload_paths import resolve_table_csv_path


def load_real_csv(job_id: int, table_name: str, db: Session | None = None):
    if db is not None:
        from services.dataset_row_storage_service import load_snapshot_with_csv_fallback

        return load_snapshot_with_csv_fallback(db, job_id, table_name)
    file_path = resolve_table_csv_path(job_id, table_name)
    return pd.read_csv(file_path) if file_path else None

# In engine/orchestrator.py
def save_dataframe_to_sql(df, table_name, job_id, suffix, db_engine):
    # Force lowercase so Postgres doesn't get confused
    full_table_name = f"{table_name}_job{job_id}_{suffix}".lower()
    
    try:
        # Keep schema="app_data"!
        df.to_sql(name=full_table_name, con=db_engine, schema="app_data", if_exists="replace", index=False)
        print(f"    -> Saved {len(df)} rows to {full_table_name} in app_data")
    except Exception as e:
        print(f"    [Error saving {full_table_name}]: {e}")

def run_data_quality_job(job_id: int, db: Session):
    print(f"--- [START] Job {job_id} ---")
    job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not job: return
    
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
            
            # --- NEW: Strip hidden spaces from Excel column names! ---
            df.columns = df.columns.str.strip()
            
            # Wipe old quarantine logs
            db.query(models.QuarantineLog).filter(
                models.QuarantineLog.job_id == job_id,
                models.QuarantineLog.table_name == table.table_name
            ).delete()
            db.commit()
            
            df["job_id"] = job_id
            df["table_id"] = table.table_id

            # Get Rules & Master Data
            raw_rules = db.query(models.Rule).filter(
                models.Rule.table_id == table.table_id, models.Rule.job_id == job_id, models.Rule.is_active == True
            ).all()
            rules = list({r.rule_id: r for r in raw_rules}.values()) 

            master_data_cache = {}
            for r in rules:
                if r.rule_type == "fuzzy_match":
                    masters = db.query(models.MasterTable.master_value).filter(
                        models.MasterTable.job_id == job_id, models.MasterTable.table_id == table.table_id
                    ).all()
                    master_data_cache[r.column_name.strip()] = [m[0] for m in masters]

            # --- DATE SANITIZER (PRE-PROCESSING) ---
            date_rules = [r for r in rules if r.rule_type == "date_format_check"]
            for d_rule in date_rules:
                col = d_rule.column_name.strip()
                target_fmt = d_rule.rule_value # e.g., %d-%m-%Y
                
                def standardize_date(val):
                    if pd.isna(val) or str(val).strip() == "": return val
                    # Replace common separators with dashes
                    clean_val = str(val).replace("/", "-").replace(".", "-").replace("\\", "-")
                    try:
                        # Try to parse and re-format
                        return datetime.strptime(clean_val, target_fmt).strftime(target_fmt)
                    except:
                        return val # Return original if it's too messy to fix

                df[col] = df[col].apply(standardize_date)
            # ----------------------------------------

            # Validation Loop
            clean_rows = []
            error_rows = []
            quarantine_logs = []
            val_errs = 0
            fuzzy_errs = 0

            for idx, row in df.iterrows():
                is_clean = True
                row_errors = []

                for rule in rules:
                    # --- NEW: Strip hidden spaces from the rule name too! ---
                    col = rule.column_name.strip()
                    
                    if col not in df.columns: 
                        print(f"WARNING: Rule column '{col}' not found in CSV headers!")
                        continue
                    
                    # Handle NaN values gracefully
                    val = row[col]
                    if pd.isna(val): val = ""
                    
                    valid, msg = RuleLibrary.validate(
                        val, rule.rule_type, rule.rule_value, master_data_cache.get(col)
                    )
                    
                    if not valid:
                        is_clean = False
                        etype = "Fuzzy" if rule.rule_type == "fuzzy_match" else "Validation"
                        if etype == "Fuzzy": fuzzy_errs += 1
                        else: val_errs += 1
                        
                        row_errors.append({"col": col, "type": etype, "msg": msg, "val": str(val)})

                if is_clean: 
                    clean_rows.append(row.to_dict())
                else: 
                    error_rows.append(row.to_dict())
                    for err in row_errors:
                        quarantine_logs.append(models.QuarantineLog(
                            job_id=job_id, table_name=table.table_name, row_id=idx,
                            column_name=err['col'], error_type=err['type'], 
                            error_value=err['val'], description=err['msg']
                        ))

            # --- THE FIX: Always save, even if empty, to overwrite old Ghost Data ---
            # We pass df.columns so it remembers your column names even if there are 0 rows!
            clean_df = pd.DataFrame(clean_rows, columns=df.columns)
            error_df = pd.DataFrame(error_rows, columns=df.columns)
            
            save_dataframe_to_sql(clean_df, table.table_name, job_id, "clean", db.get_bind())
            save_dataframe_to_sql(error_df, table.table_name, job_id, "error", db.get_bind())
            
            if quarantine_logs: 
                db.bulk_save_objects(quarantine_logs)
            # -------------------------------------------------------------------------
            
            # Update Stats
            db.add(models.TableStats(
                job_id=job_id, table_id=table.table_id, table_name=table.table_name,
                start_time=job.start_time, end_time=datetime.now(), total_rows=len(df),
                validation_errors=val_errs, fuzzy_errors=fuzzy_errs, good_rows=len(clean_rows)
            ))

        job.status = "Completed"

    except Exception as e:
        print(f"ERROR: {e}")
        job.status = "Failed"
    
    job.end_time = datetime.now()
    db.commit()
    print("--- Job Finished ---")
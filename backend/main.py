from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, inspect, update
from pydantic import BaseModel
from typing import List, Optional
import shutil
import os
import pandas as pd
import models
from database import SessionLocal, engine
from engine.orchestrator import run_data_quality_job
from fastapi.responses import StreamingResponse
import io
import zipfile
from openpyxl.styles import PatternFill
from thefuzz import process
from pydantic import BaseModel

from prometheus_fastapi_instrumentator import Instrumentator

app = FastAPI()


# Create Tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Data Quality Engine")

# --- 1. ENABLE CORS (FIXED PORT) ---
app.add_middleware(
    CORSMiddleware,
    # Allow BOTH React ports to be safe
    allow_origins=["http://localhost:3000", "http://localhost:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- PYDANTIC SCHEMAS ---
class RuleCreate(BaseModel):
    job_id: int
    table_id: int
    column_name: str
    rule_type: str
    data_type: str
    rule_value: Optional[str] = None
    is_active: bool = True
    master_data: Optional[List[str]] = []

class RuleToggle(BaseModel):
    is_active: bool

class RuleUpdate(BaseModel):
    rule_type: str
    rule_value: Optional[str] = None
    is_active: bool
    master_data: Optional[List[str]] = [] # For updating fuzzy lists
    
class RenamePayload(BaseModel):
    name: str
    
class ErrorEdit(BaseModel):
    new_value: str
    
class MasterAdd(BaseModel):
    new_master: str

class FuzzyReplace(BaseModel):
    row_id: int
    column_name: str
    new_value: str
    
class JobCreate(BaseModel):
    job_name: str
# --- 3. API ENDPOINTS ---

@app.get("/")
def read_root():
    return {"message": "MDQM Backend is Live"}

@app.post("/jobs/create")
def create_job(payload: JobCreate, db: Session = Depends(get_db)):
    # Notice we now use payload.job_name
    new_job = models.Job(job_name=payload.job_name, status="Pending")
    db.add(new_job)
    db.commit()
    db.refresh(new_job)
    return {"job_id": new_job.job_id, "message": "Job Created"}

# 1. FIX: Changed the URL to match the frontend exactly
@app.post("/jobs/{job_id}/upload")
async def upload_file(job_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Clean the table name upfront by removing any extension
    table_name = file.filename.replace(".csv", "").replace(".xlsx", "").replace(".xls", "")
    
    # Force the final saved file to ALWAYS be a .csv so your orchestrator can read it
    final_csv_path = f"{upload_dir}/{table_name}.csv"
    temp_file_path = f"{upload_dir}/{file.filename}"
    
    # Save the uploaded file temporarily
    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    max_id = db.query(func.max(models.TableMetadata.table_id)).filter(models.TableMetadata.job_id == job_id).scalar()
    next_table_id = 1 if max_id is None else max_id + 1

    try:
        # 2. FIX: Handle both Excel and CSV formats
        if file.filename.endswith(".xlsx") or file.filename.endswith(".xls"):
            # Read the Excel file and instantly save it as our standardized CSV
            df = pd.read_excel(temp_file_path)
            df.to_csv(final_csv_path, index=False)
            
            # Delete the original Excel file to save space
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
        else:
            df = pd.read_csv(final_csv_path)
            
        # ==========================================================
        # 3. FIX: THE MIXED-FORMAT DATE DETECTION MAGIC GOES HERE
        # ==========================================================
        for col in df.columns:
            if df[col].dtype == 'object':  # If Pandas thinks it's a generic String
                try:
                    # format='mixed' handles changing formats in the same column!
                    converted = pd.to_datetime(df[col], format='mixed', dayfirst=True, errors='coerce')
                    
                    # If it successfully found real dates (not just empty/NaT), apply it!
                    if not converted.isna().all():
                        df[col] = converted
                except Exception:
                    pass
        # ==========================================================

        row_count = len(df)
        columns = df.dtypes.items()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid File format: {str(e)}")

    new_table = models.TableMetadata(
        job_id=job_id,
        table_id=next_table_id,
        table_name=table_name,
        row_count=row_count 
    )
    db.add(new_table)
    db.commit()

    for col_name, dtype in columns:
        str_type = "String"
        if "int" in str(dtype): str_type = "Integer"
        elif "float" in str(dtype): str_type = "Float"
        elif "datetime" in str(dtype): str_type = "Date"
        elif "bool" in str(dtype): str_type = "Boolean"

        col_meta = models.ColumnMetadata(
            job_id=job_id,
            table_id=next_table_id,
            column_name=col_name,
            data_type=str_type
        )
        db.add(col_meta)
    db.commit()
    
    return {"job_id": job_id, "message": "File Uploaded and Processed Successfully"}

@app.post("/jobs/{job_id}/run")
def run_job(job_id: int, db: Session = Depends(get_db)):
    # 1. Check if the job actually exists
    job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # 2. Trigger the Python Engine!
    try:
        run_data_quality_job(job_id, db)
        return {"message": f"Job {job_id} executed successfully!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Engine failed: {str(e)}")

# --- SMART GETTERS (WITH STATS) ---

# --- SMART GETTERS (WITH STATS) ---

@app.get("/jobs")
def get_all_jobs(db: Session = Depends(get_db)):
    jobs = db.query(models.Job).all()
    result = []
    
    for job in jobs:
        tables = db.query(models.TableMetadata).filter(models.TableMetadata.job_id == job.job_id).all()
        
        total_rows = 0
        good_rows = 0
        error_rows = 0
        
        for t in tables:
            stat = db.query(models.TableStats).filter(
                models.TableStats.job_id == job.job_id, 
                models.TableStats.table_id == t.table_id
            ).order_by(models.TableStats.stat_id.desc()).first()
            
            if stat:
                total_rows += (stat.total_rows or 0)
                good_rows += (stat.good_rows or 0)
                error_rows += ((stat.total_rows or 0) - (stat.good_rows or 0))

        covered_cols = db.query(distinct(models.Rule.column_name)).filter(models.Rule.job_id == job.job_id).count()

        # --- NEW: Calculate Job Duration in ms ---
        job_duration_str = "0ms"
        if getattr(job, 'start_time', None) and getattr(job, 'end_time', None):
            try:
                duration_ms = (job.end_time - job.start_time).total_seconds() * 1000
                job_duration_str = f"{duration_ms:.0f}ms"
            except Exception:
                pass
        # -----------------------------------------

        result.append({
            "job_id": job.job_id,
            "job_name": job.job_name,
            "start_time": job.start_time.isoformat() if getattr(job, 'start_time', None) else None,
            "end_time": job.end_time.isoformat() if getattr(job, 'end_time', None) else None,
            "duration": job_duration_str, # <--- Now sending the ms duration
            "status": job.status,
            "total_tables": len(tables),
            "columns_covered": covered_cols, 
            "total_columns": db.query(models.ColumnMetadata).filter(models.ColumnMetadata.job_id == job.job_id).count(),
            "total_rules": db.query(models.Rule).filter(models.Rule.job_id == job.job_id, models.Rule.is_active == True).count(),
            "total_rows": total_rows,
            "good_rows": good_rows,
            "error_rows": error_rows
        })
    return result


@app.get("/jobs/{job_id}/tables")
def get_tables_for_job(job_id: int, db: Session = Depends(get_db)):
    tables = db.query(models.TableMetadata).filter(models.TableMetadata.job_id == job_id).all()
    result = []
    
    for t in tables:
        stat = db.query(models.TableStats).filter(
            models.TableStats.job_id == job_id, 
            models.TableStats.table_id == t.table_id
        ).order_by(models.TableStats.stat_id.desc()).first()
        
        rules_count = db.query(models.Rule).filter(models.Rule.table_id == t.table_id).count()
        
        col_count = db.query(models.ColumnMetadata).filter(
            models.ColumnMetadata.job_id == job_id, 
            models.ColumnMetadata.table_id == t.table_id
        ).count()
        
        # --- CHANGED: Calculate Table Duration in ms ---
        duration_str = "0ms"
        if stat and getattr(stat, 'end_time', None) and getattr(stat, 'start_time', None):
            try:
                duration_ms = (stat.end_time - stat.start_time).total_seconds() * 1000
                duration_str = f"{duration_ms:.0f}ms"
            except Exception:
                pass 
        # -----------------------------------------------
        
        g_rows = stat.good_rows if stat and getattr(stat, 'good_rows', None) else 0
        v_errs = stat.validation_errors if stat and getattr(stat, 'validation_errors', None) else 0
        f_errs = stat.fuzzy_errors if stat and getattr(stat, 'fuzzy_errors', None) else 0
        t_rows = stat.total_rows if stat and getattr(stat, 'total_rows', None) else t.row_count
        
        result.append({
            "table_id": t.table_id,
            "table_name": t.table_name,
            "row_count": t_rows, 
            "column_count": col_count,
            "rule_count": rules_count,
            "good_rows": g_rows,
            "error_rows": (t_rows - g_rows),
            "duration": duration_str
        })
    return result 

# In backend/main.py

@app.get("/tables/{job_id}/{table_id}/details") # <--- CHANGED URL
def get_table_details(job_id: int, table_id: int, db: Session = Depends(get_db)):
    # 1. Fetch specific table by BOTH Job ID and Table ID
    table = db.query(models.TableMetadata).filter(
        models.TableMetadata.job_id == job_id,
        models.TableMetadata.table_id == table_id
    ).first()

    if not table: return {"columns": [], "rules": []}
    
    # 2. Get Columns
    columns = db.query(models.ColumnMetadata).filter(
        models.ColumnMetadata.job_id == job_id,
        models.ColumnMetadata.table_id == table_id
    ).all()
    
    # 3. Get Rules
    rules = db.query(models.Rule).filter(
        models.Rule.job_id == job_id,
        models.Rule.table_id == table_id
    ).all()
    
    return {"columns": columns, "rules": rules}

# --- RULE MANAGEMENT ---

@app.post("/rules/add")
def add_new_rule(rule: RuleCreate, db: Session = Depends(get_db)):
    new_rule = models.Rule(
        job_id=rule.job_id,
        table_id=rule.table_id,
        column_name=rule.column_name,
        rule_type=rule.rule_type,
        data_type=rule.data_type,
        rule_value=rule.rule_value,
        is_active=rule.is_active
    )
    db.add(new_rule)
    
    if rule.rule_type == "fuzzy_match" and rule.master_data:
        table = db.query(models.TableMetadata).filter(
            models.TableMetadata.job_id == rule.job_id,
            models.TableMetadata.table_id == rule.table_id
        ).first()
        if table:
            for val in rule.master_data:
                db.add(models.MasterTable(
                    job_id=rule.job_id,
                    table_id=rule.table_id,
                    table_name=table.table_name,
                    master_value=val
                ))
    db.commit()
    return {"message": "Rule Added"}

@app.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    db.query(models.Rule).filter(models.Rule.rule_id == rule_id).delete()
    db.commit()
    return {"status": "deleted"}

@app.put("/rules/{rule_id}/toggle")
def toggle_rule(rule_id: int, payload: RuleToggle, db: Session = Depends(get_db)):
    rule = db.query(models.Rule).filter(models.Rule.rule_id == rule_id).first()
    if rule:
        rule.is_active = payload.is_active
        db.commit()
    return {"status": "updated"}

@app.put("/rules/{rule_id}")
def update_rule(rule_id: int, payload: RuleUpdate, db: Session = Depends(get_db)):
    # 1. Get the Rule
    rule = db.query(models.Rule).filter(models.Rule.rule_id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    # 2. Update Basic Fields
    rule.rule_type = payload.rule_type
    rule.rule_value = payload.rule_value
    rule.is_active = payload.is_active
    
    # 3. Handle Master Data Update (If Fuzzy Match)
    if payload.rule_type == "fuzzy_match":
        # Delete old master entries for this table
        db.query(models.MasterTable).filter(
            models.MasterTable.job_id == rule.job_id,
            models.MasterTable.table_id == rule.table_id
        ).delete()
        
        # Add new entries
        table = db.query(models.TableMetadata).filter(models.TableMetadata.table_id == rule.table_id).first()
        if table and payload.master_data:
            for val in payload.master_data:
                db.add(models.MasterTable(
                    job_id=rule.job_id,
                    table_id=rule.table_id,
                    table_name=table.table_name,
                    master_value=val
                ))
    
    db.commit()
    return {"message": "Rule Updated Successfully"}

@app.get("/master-data/{job_id}/{table_id}")
def get_master_data(job_id: int, table_id: int, db: Session = Depends(get_db)):
    """ Fetches the master list for a specific table (for editing) """
    masters = db.query(models.MasterTable).filter(
        models.MasterTable.job_id == job_id,
        models.MasterTable.table_id == table_id
    ).all()
    return [m.master_value for m in masters]

@app.put("/jobs/{job_id}/rename")
def rename_job(job_id: int, payload: RenamePayload, db: Session = Depends(get_db)):
    job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not job: raise HTTPException(status_code=404, detail="Job not found")
    job.job_name = payload.name
    db.commit()
    return {"message": "Job renamed successfully"}

@app.put("/tables/{table_id}/rename")
def rename_table(table_id: int, payload: dict, db: Session = Depends(get_db)):
    table = db.query(models.TableMetadata).filter(models.TableMetadata.table_id == table_id).first()
    if not table: 
        raise HTTPException(status_code=404, detail="Table not found")
    
    # FIX: Use .get() safely to find the name in the dictionary
    new_name = payload.get("name") or payload.get("new_name")
    
    if not new_name:
        raise HTTPException(status_code=400, detail="New name is required in payload")
    
    try:
        # --- SAFE PHYSICAL RENAME ---
        old_file_path = f"uploads/{table.table_name}.csv"
        new_file_path = f"uploads/{new_name}.csv"
        
        if os.path.exists(old_file_path):
            try:
                os.rename(old_file_path, new_file_path)
            except Exception as e:
                print(f"Warning: File locked or inaccessible: {e}")
        
        # --- UPDATE DATABASE ---
        table.table_name = new_name
        db.commit()
        return {"message": "Table renamed successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.delete("/jobs/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not job: 
        raise HTTPException(status_code=404, detail="Job not found")
    
    try:
        # 1. Delete the "Leaf" nodes first (the newest tables we added)
        db.query(models.QuarantineLog).filter(models.QuarantineLog.job_id == job_id).delete()
        db.query(models.MasterTable).filter(models.MasterTable.job_id == job_id).delete()
        
        # 2. Delete the rest of the child records
        db.query(models.ColumnMetadata).filter(models.ColumnMetadata.job_id == job_id).delete()
        db.query(models.Rule).filter(models.Rule.job_id == job_id).delete()
        db.query(models.TableStats).filter(models.TableStats.job_id == job_id).delete()
        
        # 3. Delete the intermediate parent (Tables)
        db.query(models.TableMetadata).filter(models.TableMetadata.job_id == job_id).delete()
        
        # 4. Finally, it is safe to delete the root Job
        db.delete(job)
        db.commit()
        
        return {"message": "Job and all associated data deleted completely"}
        
    except Exception as e:
        db.rollback() # Instantly undo everything if it hits a snag
        raise HTTPException(status_code=500, detail=f"Failed to delete job: {str(e)}")

@app.delete("/tables/{table_id}")
def delete_table(table_id: int, db: Session = Depends(get_db)):
    table = db.query(models.TableMetadata).filter(models.TableMetadata.table_id == table_id).first()
    if not table: 
        raise HTTPException(status_code=404, detail="Table not found")
    
    try:
        # 1. Sweep away ALL associated child data first
        # Note: QuarantineLog tracks by job_id and table_name, so we use those here
        db.query(models.QuarantineLog).filter(
            models.QuarantineLog.job_id == table.job_id,
            models.QuarantineLog.table_name == table.table_name
        ).delete()
        
        db.query(models.MasterTable).filter(models.MasterTable.table_id == table_id).delete()
        db.query(models.ColumnMetadata).filter(models.ColumnMetadata.table_id == table_id).delete()
        db.query(models.Rule).filter(models.Rule.table_id == table_id).delete()
        db.query(models.TableStats).filter(models.TableStats.table_id == table_id).delete()
        
        # 2. Safely delete the parent table now that the children are gone
        db.delete(table)
        db.commit()
        return {"message": "Table and all associated data deleted completely"}
        
    except Exception as e:
        db.rollback() # Abort the transaction instantly if anything fails
        raise HTTPException(status_code=500, detail=f"Failed to delete table: {str(e)}")

# --- DOWNLOAD ENDPOINTS (EXCEL WITH RED ERROR ROWS) ---

def generate_formatted_excel(db: Session, table_name: str, job_id: int):
    # 1. Inspect the 'app_data' schema specifically!
    inspector = inspect(db.bind)
    all_tables = inspector.get_table_names(schema="app_data") 
    
    t_name_lower = table_name.lower()
    j_id_str = str(job_id)
    
    actual_clean = None
    actual_error = None
    
    # 2. Fuzzy Match the tables inside app_data
    for t in all_tables:
        t_lower = t.lower()
        if t_name_lower in t_lower and (f"job{j_id_str}" in t_lower or f"_{j_id_str}_" in t_lower):
            if "clean" in t_lower:
                actual_clean = t
            elif "error" in t_lower or "quarantine" in t_lower or "bad" in t_lower:
                actual_error = t

    if not actual_clean and not actual_error:
        raise Exception(f"Tables missing in 'app_data'. Looked for '{t_name_lower}' + 'job{j_id_str}'. Exists in app_data: {all_tables}")

    df_clean = pd.DataFrame()
    df_error = pd.DataFrame()
    
    # 3. Read the data from the 'app_data' schema!
    if actual_clean:
        try: df_clean = pd.read_sql_table(actual_clean, db.bind, schema="app_data")
        except Exception: pass
        
    if actual_error:
        try: df_error = pd.read_sql_table(actual_error, db.bind, schema="app_data")
        except Exception: pass
        
    if df_clean.empty and df_error.empty:
        raise Exception(f"Found the tables ({actual_clean}, {actual_error}) in app_data, but they are completely empty.")
        
    # 4. Combine and Tag rows
    df_clean['__is_error__'] = False
    if not df_error.empty:
        df_error['__is_error__'] = True
        df_combined = pd.concat([df_clean, df_error], ignore_index=True)
    else:
        df_combined = df_clean
        
    # 5. Create Excel File
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_combined.drop(columns=['__is_error__']).to_excel(writer, index=False, sheet_name='Data')
        worksheet = writer.sheets['Data']
        
        red_fill = PatternFill(start_color='FF9999', end_color='FF9999', fill_type='solid')
        
        for r_idx, is_error in enumerate(df_combined['__is_error__'], start=2):
            if is_error:
                for cell in worksheet[r_idx]:
                    cell.fill = red_fill
                    
    output.seek(0)
    return output


@app.get("/tables/{table_id}/download")
def download_table_excel(table_id: int, db: Session = Depends(get_db)):
    table = db.query(models.TableMetadata).filter(models.TableMetadata.table_id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
        
    try:
        excel_io = generate_formatted_excel(db, table.table_name, table.job_id)
        
        response = StreamingResponse(iter([excel_io.getvalue()]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        response.headers["Content-Disposition"] = f"attachment; filename={table.table_name}_Results.xlsx"
        return response
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/jobs/{job_id}/download")
def download_job_zip(job_id: int, db: Session = Depends(get_db)):
    tables = db.query(models.TableMetadata).filter(models.TableMetadata.job_id == job_id).all()
    
    zip_buffer = io.BytesIO()
    added_files = False
    error_logs = [] # Keep track of errors for debugging
    
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for t in tables:
            try:
                excel_io = generate_formatted_excel(db, t.table_name, job_id)
                zip_file.writestr(f"{t.table_name}_Results.xlsx", excel_io.getvalue())
                added_files = True
            except Exception as e:
                error_logs.append(f"{t.table_name}: {str(e)}") 

    if not added_files:
        # If it fails now, it will tell you exactly WHY it failed in the browser error!
        raise HTTPException(status_code=404, detail=f"Download failed. Reasons: {error_logs}")

    zip_buffer.seek(0)
    response = StreamingResponse(iter([zip_buffer.getvalue()]), media_type="application/x-zip-compressed")
    response.headers["Content-Disposition"] = f"attachment; filename=Job_{job_id}_Results.zip"
    return response

# --- QUARANTINE DASHBOARD ENDPOINTS ---

@app.get("/quarantine/jobs")
def get_quarantine_jobs(db: Session = Depends(get_db)):
    jobs = db.query(models.Job).all()
    result = []
    
    for job in jobs:
        tables = db.query(models.TableMetadata).filter(models.TableMetadata.job_id == job.job_id).all()
        
        val_errors_total = 0
        fuzzy_errors_total = 0
        
        for t in tables:
            stat = db.query(models.TableStats).filter(
                models.TableStats.job_id == job.job_id, 
                models.TableStats.table_id == t.table_id
            ).order_by(models.TableStats.stat_id.desc()).first()
            
            if stat:
                val_errors_total += (stat.validation_errors or 0)
                fuzzy_errors_total += (stat.fuzzy_errors or 0)

        # Only show jobs that actually have errors
        total_errors = val_errors_total + fuzzy_errors_total
        if total_errors > 0:
            result.append({
                "job_id": job.job_id,
                "job_name": job.job_name,
                "total_tables": len(tables),
                "total_errors": total_errors,
                "validation_errors": val_errors_total,
                "fuzzy_errors": fuzzy_errors_total
            })
            
    return result

@app.get("/quarantine/jobs/{job_id}/tables")
def get_quarantine_tables(job_id: int, db: Session = Depends(get_db)):
    tables = db.query(models.TableMetadata).filter(models.TableMetadata.job_id == job_id).all()
    result = []
    
    for t in tables:
        stat = db.query(models.TableStats).filter(
            models.TableStats.job_id == job_id, 
            models.TableStats.table_id == t.table_id
        ).order_by(models.TableStats.stat_id.desc()).first()
        
        col_count = db.query(models.ColumnMetadata).filter(
            models.ColumnMetadata.job_id == job_id, 
            models.ColumnMetadata.table_id == t.table_id
        ).count()
        
        v_errs = stat.validation_errors if stat and getattr(stat, 'validation_errors', None) else 0
        f_errs = stat.fuzzy_errors if stat and getattr(stat, 'fuzzy_errors', None) else 0
        t_rows = stat.total_rows if stat and getattr(stat, 'total_rows', None) else t.row_count
        
        # Only show tables that have errors
        if (v_errs + f_errs) > 0:
            result.append({
                "table_id": t.table_id,
                "table_name": t.table_name,
                "total_rows": t_rows,
                "total_columns": col_count,
                "validation_errors": v_errs,
                "fuzzy_errors": f_errs
            })
            
    return result

# --- VALIDATION ERROR DETAILS ENDPOINTS ---

@app.get("/quarantine/jobs/{job_id}/tables/{table_id}/validation")
def get_validation_error_details(job_id: int, table_id: int, db: Session = Depends(get_db)):
    table_meta = db.query(models.TableMetadata).filter_by(job_id=job_id, table_id=table_id).first()
    if not table_meta: raise HTTPException(status_code=404, detail="Table not found")
    
    # 1. Get all column names and data types for this table
    cols = db.query(models.ColumnMetadata).filter_by(job_id=job_id, table_id=table_id).all()
    all_columns = [c.column_name for c in cols]
    col_types = {c.column_name: c.data_type for c in cols}
    
    # 2. Get the specific Validation Quarantine Logs
    logs = db.query(models.QuarantineLog).filter_by(
        job_id=job_id, table_name=table_meta.table_name, error_type="Validation"
    ).all()
    
    # 3. Read the full rows from the _error table so we can display all columns
    error_table = f"{table_meta.table_name}_job{job_id}_error".lower()
    df_records = []
    try:
        df = pd.read_sql_table(error_table, db.bind, schema="app_data")
        df_records = df.to_dict(orient="records")
    except Exception:
        pass
        
    results = []
    for log in logs:
        # Match the log to the full row data from the _error table
        matching_row = {}
        if df_records:
            for row in df_records:
                if str(row.get(log.column_name)) == str(log.error_value):
                    matching_row = row
                    break
        
        results.append({
            "log_id": log.log_id,
            "error_column": log.column_name,
            "error_value": log.error_value,
            "data_type": col_types.get(log.column_name, "Unknown"),
            "description": log.description,
            "row_data": matching_row
        })
        
    return {
        "table_id": table_id,
        "table_name": table_meta.table_name,
        "total_errors": len(results),
        "all_columns": all_columns,
        "errors": results
    }

@app.put("/quarantine/errors/{log_id}")
def update_quarantine_error(log_id: int, payload: ErrorEdit, db: Session = Depends(get_db)):
    log = db.query(models.QuarantineLog).filter_by(log_id=log_id).first()
    if not log: raise HTTPException(status_code=404, detail="Log not found")
    
    # 1. Update the DB
    log.error_value = payload.new_value
    log.description = "Fixed Manually"
    
    # 2. Find the exact file
    file_path = os.path.join("uploads", f"{log.table_name}.csv")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Source CSV not found at {file_path}")
        
    try:
        # Read the file
        df = pd.read_csv(file_path)
        
        row_index = int(log.row_id)
        
        if row_index >= len(df):
            raise Exception(f"Row {row_index} is out of bounds for file with {len(df)} rows.")
            
        if log.column_name not in df.columns:
            raise Exception(f"Column '{log.column_name}' not found in CSV.")
            
        # --- THE SMART TYPING FIX ---
        col_dtype = df[log.column_name].dtype
        new_val = payload.new_value
        
        try:
            # Dynamically cast the string to match the column's actual data type
            if pd.api.types.is_integer_dtype(col_dtype):
                new_val = int(new_val)
            elif pd.api.types.is_float_dtype(col_dtype):
                new_val = float(new_val)
            elif pd.api.types.is_bool_dtype(col_dtype):
                new_val = str(new_val).lower() in ['true', '1', 'yes', 'y', 't']
        except ValueError:
            # If they try to type "abc" into an integer column, catch it and warn them!
            raise Exception(f"Invalid data type. Cannot save '{new_val}' into a numeric column.")
            
        # SURGERY: Overwrite the bad data safely
        df.loc[row_index, log.column_name] = new_val
        # -----------------------------
        
        # Save it back to the file
        df.to_csv(file_path, index=False)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to patch CSV: {str(e)}")

    db.commit()
    return {"message": "Error updated and source file patched successfully"}

@app.delete("/quarantine/errors/{log_id}")
def delete_quarantine_error(log_id: int, db: Session = Depends(get_db)):
    db.query(models.QuarantineLog).filter_by(log_id=log_id).delete()
    db.commit()
    return {"message": "Error deleted successfully"}

# --- FUZZY ERROR DETAILS ENDPOINTS ---

@app.get("/quarantine/jobs/{job_id}/tables/{table_id}/fuzzy")
def get_fuzzy_details(job_id: int, table_id: int, db: Session = Depends(get_db)):
    table = db.query(models.TableMetadata).filter_by(job_id=job_id, table_id=table_id).first()
    
    # 1. Find the Fuzzy Rule to get the Threshold and Column
    rule = db.query(models.Rule).filter_by(job_id=job_id, table_id=table_id, rule_type="fuzzy_match").first()
    if not rule:
        raise HTTPException(status_code=404, detail="No fuzzy rule configured for this table.")
        
    threshold = int(rule.rule_value) if rule.rule_value else 70
    col_name = rule.column_name
    
    # 2. Get the Master Data
    masters = db.query(models.MasterTable).filter_by(job_id=job_id, table_id=table_id).all()
    master_list = [m.master_value for m in masters]
    
    # 3. Read the original CSV and calculate scores live
    file_path = os.path.join("uploads", f"{table.table_name}.csv")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Source CSV not found.")
        
    df = pd.read_csv(file_path)
    results = []
    fuzzy_errors_count = 0
    
    for idx, row in df.iterrows():
        val = str(row.get(col_name, ""))
        if pd.isna(row.get(col_name)): val = ""
        
        best_match = "None"
        score = 0
        
        if master_list and val:
            match_tuple = process.extractOne(val, master_list)
            if match_tuple:
                best_match = match_tuple[0]
                score = match_tuple[1]
                
        is_error = score < threshold
        if is_error: fuzzy_errors_count += 1
        
        results.append({
            "row_id": idx,
            "original_value": val,
            "best_match": best_match,
            "score": score,
            "is_error": is_error,
            "row_data": row.fillna("").to_dict()
        })
        
    return {
        "table_name": table.table_name,
        "column_name": col_name,
        "threshold": threshold,
        "total_fuzzy_errors": fuzzy_errors_count,
        "master_list": master_list,
        "all_columns": df.columns.tolist(),
        "data": results
    }

@app.post("/quarantine/jobs/{job_id}/tables/{table_id}/master")
def add_to_master(job_id: int, table_id: int, payload: MasterAdd, db: Session = Depends(get_db)):
    table = db.query(models.TableMetadata).filter_by(table_id=table_id).first()
    # Check if it already exists to avoid duplicates
    exists = db.query(models.MasterTable).filter_by(job_id=job_id, table_id=table_id, master_value=payload.new_master).first()
    if not exists:
        db.add(models.MasterTable(job_id=job_id, table_id=table_id, table_name=table.table_name, master_value=payload.new_master))
        db.commit()
    return {"message": "Added to Master Data"}

@app.put("/quarantine/jobs/{job_id}/tables/{table_id}/fuzzy/replace")
def replace_fuzzy_value(job_id: int, table_id: int, payload: FuzzyReplace, db: Session = Depends(get_db)):
    table = db.query(models.TableMetadata).filter_by(table_id=table_id).first()
    file_path = os.path.join("uploads", f"{table.table_name}.csv")
    
    try:
        df = pd.read_csv(file_path)
        # Bypass strict typing to safely inject the string alias
        df[payload.column_name] = df[payload.column_name].astype(object)
        df.loc[payload.row_id, payload.column_name] = payload.new_value
        df.to_csv(file_path, index=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"message": "Replaced in CSV"}

# --- DASHBOARD SUMMARY ENDPOINT ---

@app.get("/dashboard/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    # 1. System Overviews
    total_jobs = db.query(models.Job).count()
    total_tables = db.query(models.TableMetadata).count()
    total_rules = db.query(models.Rule).filter_by(is_active=True).count()

    # 2. Data Volume & Health (Calculated from the most recent run of every table)
    tables = db.query(models.TableMetadata).all()
    
    total_rows_processed = 0
    total_clean_rows = 0
    total_validation_errors = 0
    total_fuzzy_errors = 0

    for t in tables:
        # Get the absolute latest stat for this specific table
        latest_stat = db.query(models.TableStats).filter_by(table_id=t.table_id).order_by(models.TableStats.stat_id.desc()).first()
        
        if latest_stat:
            total_rows_processed += (latest_stat.total_rows or 0)
            total_clean_rows += (latest_stat.good_rows or 0)
            total_validation_errors += (latest_stat.validation_errors or 0)
            total_fuzzy_errors += (latest_stat.fuzzy_errors or 0)

    # 3. Calculate Overall Data Quality Score
    dq_score = 0.0
    if total_rows_processed > 0:
        dq_score = round((total_clean_rows / total_rows_processed) * 100, 2)

    return {
        "system_metrics": {
            "total_jobs": total_jobs,
            "total_tables": total_tables,
            "active_rules": total_rules
        },
        "data_health": {
            "overall_score": dq_score,
            "rows_processed": total_rows_processed,
            "clean_rows": total_clean_rows,
            "validation_errors": total_validation_errors,
            "fuzzy_errors": total_fuzzy_errors
        }
    }
    
@app.delete("/master-data/remove")
def remove_master_value(payload: dict, db: Session = Depends(get_db)):
    jid = payload.get("job_id")
    tid = payload.get("table_id")
    val = payload.get("value")

    # Find the specific entry
    item = db.query(models.MasterTable).filter(
        models.MasterTable.job_id == jid,
        models.MasterTable.table_id == tid,
        models.MasterTable.master_value == val
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Master value not found")

    db.delete(item)
    db.commit()
    return {"message": "Value removed from Master Data successfully"}


@app.get("/tables/{table_id}/columns/stats")
def get_table_column_stats(table_id: int, db: Session = Depends(get_db)):
    # 1. Get Table Metadata
    table = db.query(models.TableMetadata).filter(models.TableMetadata.table_id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    # 2. Read the Physical CSV to get the current headers
    file_path = f"uploads/{table.table_name}.csv"
    if not os.path.exists(file_path):
        return [] # Or handle error
    
    df = pd.read_csv(file_path)
    all_columns = df.columns.tolist()
    total_rows = len(df)

    # 3. Query QuarantineLog for error counts per column
    # Group by column_name and count the IDs
    error_counts = db.query(
        models.QuarantineLog.column_name, 
        func.count(models.QuarantineLog.log_id)
    ).filter(
        models.QuarantineLog.job_id == table.job_id,
        models.QuarantineLog.table_name == table.table_name
    ).group_by(models.QuarantineLog.column_name).all()

    # Convert list of tuples [(col, count)] to a dictionary {col: count}
    error_map = {row[0]: row[1] for row in error_counts}

    # 4. Construct the final response
    stats = []
    for col in all_columns:
        errors = error_map.get(col, 0)
        stats.append({
            "column_name": col,
            "total": total_rows,
            "good": total_rows - errors,
            "errors": errors,
            "quality_pct": round(((total_rows - errors) / total_rows * 100), 2) if total_rows > 0 else 0
        })

    return stats

@app.put("/tables/{table_id}/columns/rename")
def rename_column(table_id: int, payload: dict, db: Session = Depends(get_db)):
    old_name = payload.get("old_name").strip()
    new_name = payload.get("new_name").strip()
    
    table = db.query(models.TableMetadata).filter(models.TableMetadata.table_id == table_id).first()
    if not table: raise HTTPException(status_code=404)

    try:
        # --- 1. DATABASE METADATA SYNC ---
        col_record = db.query(models.ColumnMetadata).filter(
            models.ColumnMetadata.job_id == table.job_id,
            models.ColumnMetadata.table_id == table_id,
            func.lower(models.ColumnMetadata.column_name) == old_name.lower()
        ).first()

        # Emergency Fallback if string mismatch
        if not col_record:
            all_cols = db.query(models.ColumnMetadata).filter(
                models.ColumnMetadata.job_id == table.job_id,
                models.ColumnMetadata.table_id == table_id
            ).all()
            col_record = next((c for c in all_cols if c.column_name.lower() in [old_name.lower(), "s. no.", "count", "list", "no"]), None)

        if col_record:
            actual_old_name = col_record.column_name
            col_record.column_name = new_name
            
            # Update Rules & Logs using the exact DB name
            db.query(models.Rule).filter(
                models.Rule.job_id == table.job_id,
                models.Rule.table_id == table_id,
                models.Rule.column_name == actual_old_name
            ).update({"column_name": new_name}, synchronize_session=False)

            db.query(models.QuarantineLog).filter(
                models.QuarantineLog.job_id == table.job_id,
                models.QuarantineLog.column_name == actual_old_name
            ).update({"column_name": new_name}, synchronize_session=False)
            
            print(f"DB SYNC: {actual_old_name} -> {new_name}")

        # --- 2. PHYSICAL FILE SYNC ---
        file_path = f"uploads/{table.table_name}.csv"
        if os.path.exists(file_path):
            df = pd.read_csv(file_path)
            
            # Identify the column in CSV (case-insensitive)
            csv_target = next((c for c in df.columns if c.lower() == old_name.lower()), None)
            
            if csv_target:
                df.rename(columns={csv_target: new_name}, inplace=True)
                
                # REFINEMENT: Explicitly drop any garbage columns before saving
                # This removes 'job_id', 'table_id', and any 'Unnamed' columns created by index=True
                cols_to_keep = [
                    c for c in df.columns 
                    if c not in ['job_id', 'table_id'] 
                    and not c.startswith('Unnamed')
                ]
                
                # Save only the legitimate data columns without index
                df[cols_to_keep].to_csv(file_path, index=False)
                print(f"FILE SYNC: {csv_target} -> {new_name} (Cleaned)")

        db.commit()
        return {"message": "Sync complete", "new_name": new_name}

    except Exception as e:
        db.rollback()
        print(f"CRITICAL ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/tables/{table_id}/standardize-dates")
def standardize_table_dates(table_id: int, payload: dict, db: Session = Depends(get_db)):
    column_name = payload.get("column_name")
    
    table = db.query(models.TableMetadata).filter(models.TableMetadata.table_id == table_id).first()
    rule = db.query(models.Rule).filter(
        models.Rule.table_id == table_id,
        models.Rule.column_name == column_name,
        models.Rule.rule_type == "date_format_check"
    ).first()

    if not rule:
        raise HTTPException(status_code=400, detail="No active date rule")

    try:
        file_path = f"uploads/{table.table_name}.csv"
        
        # 1. READ AS PURE TEXT (Prevents 00:00:00 on import)
        df = pd.read_csv(file_path, dtype=str, keep_default_na=False)

        def fix_date(val):
            if not val or pd.isna(val): return val
            
            # 2. CHOP OFF EXISTING TIMESTAMPS
            clean_val = str(val).split(" ")[0]
            
            # Clean separators
            clean_val = clean_val.replace("/", "-").replace(".", "-").replace("\\", "-")
            
            try:
                # Try to parse the messy date
                # We try a few formats if the primary one fails
                for fmt in [rule.rule_value, "%Y-%m-%d", "%m-%d-%Y", "%d-%m-%y"]:
                    try:
                        date_obj = datetime.strptime(clean_val, fmt)
                        return date_obj.strftime(rule.rule_value)
                    except:
                        continue
                return val
            except:
                return val

        df[column_name] = df[column_name].apply(fix_date)

        # 3. SAVE WITHOUT INDEX (Prevents row jumbling/ID columns)
        # Only save columns that belong in the CSV
        original_cols = [c for c in df.columns if c not in ['job_id', 'table_id']]
        df[original_cols].to_csv(file_path, index=False)

        return {"message": "Dates standardized successfully"}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
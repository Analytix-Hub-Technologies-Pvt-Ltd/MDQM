"""Job uploads, schedules, downloads, and table maintenance routes."""
from __future__ import annotations

import base64
import io
import json
import os
import shutil
from datetime import datetime
from typing import Optional
from urllib import parse as urlparse
from urllib import request as urlrequest

import pandas as pd
from apscheduler.triggers.cron import CronTrigger
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

import models
from core.deps import get_db
from core.scheduler import run_scheduled_job, scheduler, scheduler_job_key, serialize_schedule_job
from engine.orchestrator import run_data_quality_job
from engine.validation import strip_time_from_date_string
from schemas.jobs_and_rules import JobCreate, RenamePayload, TableEmailPayload
from services.source_paths import normalize_local_path, save_table_source_path
from services.table_outputs import build_job_zip_response, build_table_output_bytes, resolve_table_for_job_and_table
from services.table_refresh import refresh_table_csv_from_source_path

router = APIRouter()

@router.post("/jobs/create")
def create_job(payload: JobCreate, db: Session = Depends(get_db)):
    # Notice we now use payload.job_name
    new_job = models.Job(job_name=payload.job_name, status="Pending")
    db.add(new_job)
    db.commit()
    db.refresh(new_job)
    return {"job_id": new_job.job_id, "message": "Job Created"}

# 1. FIX: Changed the URL to match the frontend exactly
@router.post("/jobs/{job_id}/upload")
async def upload_file(
    job_id: int,
    file: UploadFile = File(...),
    source_path: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
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
            df = pd.read_csv(temp_file_path)
            df.to_csv(final_csv_path, index=False)
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

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
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except OSError:
                pass
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

    normalized_source_path = normalize_local_path(source_path or "")
    if normalized_source_path and os.path.isfile(normalized_source_path):
        save_table_source_path(job_id, next_table_id, normalized_source_path)

    return {"job_id": job_id, "message": "File Uploaded and Processed Successfully"}


@router.post("/jobs/{job_id}/upload-from-path")
def upload_file_from_path(job_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    file_path = normalize_local_path(payload.get("file_path"))
    if not file_path:
        raise HTTPException(status_code=400, detail="file_path is required")
    if not os.path.isfile(file_path):
        raise HTTPException(
            status_code=400,
            detail=f"File path not found. Use a full path like C:\\Downloads\\data.csv. Received: {file_path}",
        )

    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)

    file_name = os.path.basename(file_path)
    table_name = file_name.replace(".csv", "").replace(".xlsx", "").replace(".xls", "")
    final_csv_path = os.path.join(upload_dir, f"{table_name}.csv")

    max_id = db.query(func.max(models.TableMetadata.table_id)).filter(models.TableMetadata.job_id == job_id).scalar()
    next_table_id = 1 if max_id is None else max_id + 1

    try:
        if file_name.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(file_path)
        else:
            df = pd.read_csv(file_path)

        # Normalize to CSV in uploads for downstream engine.
        df.to_csv(final_csv_path, index=False)

        for col in df.columns:
            if df[col].dtype == "object":
                try:
                    converted = pd.to_datetime(df[col], format="mixed", dayfirst=True, errors="coerce")
                    if not converted.isna().all():
                        df[col] = converted
                except Exception:
                    pass

        row_count = len(df)
        columns = df.dtypes.items()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid file format: {str(e)}")

    new_table = models.TableMetadata(
        job_id=job_id,
        table_id=next_table_id,
        table_name=table_name,
        row_count=row_count,
    )
    db.add(new_table)
    db.commit()

    for col_name, dtype in columns:
        str_type = "String"
        if "int" in str(dtype):
            str_type = "Integer"
        elif "float" in str(dtype):
            str_type = "Float"
        elif "datetime" in str(dtype):
            str_type = "Date"
        elif "bool" in str(dtype):
            str_type = "Boolean"

        col_meta = models.ColumnMetadata(
            job_id=job_id,
            table_id=next_table_id,
            column_name=col_name,
            data_type=str_type,
        )
        db.add(col_meta)
    db.commit()
    save_table_source_path(job_id, next_table_id, file_path)

    return {"job_id": job_id, "message": "File Uploaded from path and Processed Successfully"}

@router.post("/jobs/{job_id}/tables/{table_id}/replace-from-path")
def replace_table_file_from_path(job_id: int, table_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    file_path = normalize_local_path(payload.get("file_path"))
    if not file_path:
        raise HTTPException(status_code=400, detail="file_path is required")
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=400, detail=f"File path not found: {file_path}")

    table = db.query(models.TableMetadata).filter(
        models.TableMetadata.job_id == job_id,
        models.TableMetadata.table_id == table_id,
    ).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found for this job")

    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    final_csv_path = os.path.join(upload_dir, f"{table.table_name}.csv")

    try:
        if file_path.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(file_path)
        else:
            df = pd.read_csv(file_path)
        df.to_csv(final_csv_path, index=False)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid file format: {str(e)}")

    # Refresh table metadata and columns to match replaced source.
    table.row_count = int(len(df))
    db.query(models.ColumnMetadata).filter(
        models.ColumnMetadata.job_id == job_id,
        models.ColumnMetadata.table_id == table_id,
    ).delete(synchronize_session=False)

    for col_name, dtype in df.dtypes.items():
        str_type = "String"
        if "int" in str(dtype):
            str_type = "Integer"
        elif "float" in str(dtype):
            str_type = "Float"
        elif "datetime" in str(dtype):
            str_type = "Date"
        elif "bool" in str(dtype):
            str_type = "Boolean"
        db.add(models.ColumnMetadata(
            job_id=job_id,
            table_id=table_id,
            column_name=col_name,
            data_type=str_type,
        ))

    # Clear old computed stats so UI doesn't keep old totals before next run.
    db.query(models.TableStats).filter(
        models.TableStats.job_id == job_id,
        models.TableStats.table_id == table_id,
    ).delete(synchronize_session=False)

    db.commit()
    save_table_source_path(job_id, table_id, file_path)
    return {
        "message": "Table source file replaced successfully",
        "job_id": job_id,
        "table_id": table_id,
        "row_count": int(len(df)),
    }

@router.post("/jobs/{job_id}/tables/{table_id}/replace-file")
async def replace_table_file_upload(
    job_id: int,
    table_id: int,
    file: UploadFile = File(...),
    source_path: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    table = db.query(models.TableMetadata).filter(
        models.TableMetadata.job_id == job_id,
        models.TableMetadata.table_id == table_id,
    ).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found for this job")

    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    temp_file_path = os.path.join(upload_dir, f"tmp_{file.filename}")
    final_csv_path = os.path.join(upload_dir, f"{table.table_name}.csv")

    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        if file.filename.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(temp_file_path)
        else:
            df = pd.read_csv(temp_file_path)
        df.to_csv(final_csv_path, index=False)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid file format: {str(e)}")
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

    table.row_count = int(len(df))
    db.query(models.ColumnMetadata).filter(
        models.ColumnMetadata.job_id == job_id,
        models.ColumnMetadata.table_id == table_id,
    ).delete(synchronize_session=False)

    for col_name, dtype in df.dtypes.items():
        str_type = "String"
        if "int" in str(dtype):
            str_type = "Integer"
        elif "float" in str(dtype):
            str_type = "Float"
        elif "datetime" in str(dtype):
            str_type = "Date"
        elif "bool" in str(dtype):
            str_type = "Boolean"
        db.add(models.ColumnMetadata(
            job_id=job_id,
            table_id=table_id,
            column_name=col_name,
            data_type=str_type,
        ))

    db.query(models.TableStats).filter(
        models.TableStats.job_id == job_id,
        models.TableStats.table_id == table_id,
    ).delete(synchronize_session=False)

    normalized_source_path = normalize_local_path(source_path or "")
    if normalized_source_path and os.path.isfile(normalized_source_path):
        save_table_source_path(job_id, table_id, normalized_source_path)

    db.commit()
    return {
        "message": "Table source file replaced successfully",
        "job_id": job_id,
        "table_id": table_id,
        "row_count": int(len(df)),
    }

@router.post("/jobs/{job_id}/run")
def run_job(job_id: int, db: Session = Depends(get_db)):
    # 1. Check if the job actually exists
    job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # 2. Trigger the Python Engine!
    try:
        tables = db.query(models.TableMetadata).filter(models.TableMetadata.job_id == job_id).all()
        for t in tables:
            refresh_table_csv_from_source_path(job_id, t.table_id, db)
        run_data_quality_job(job_id, db)
        return {"message": f"Job {job_id} executed successfully!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Engine failed: {str(e)}")


@router.post("/schedule-job/{job_id}")
def schedule_job(job_id: int, data: dict = Body(...), db: Session = Depends(get_db)):
    job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    schedule_type = str(data.get("type", "")).strip().lower()
    if not schedule_type:
        raise HTTPException(status_code=400, detail="type is required")

    job_key = scheduler_job_key(job_id)
    try:
        scheduler.remove_job(job_key)
    except Exception:
        pass

    try:
        if schedule_type == "daily":
            hour, minute = map(int, str(data.get("time", "")).split(":"))
            scheduler.add_job(
                run_scheduled_job,
                "cron",
                id=job_key,
                replace_existing=True,
                hour=hour,
                minute=minute,
                args=[job_id],
            )

        elif schedule_type == "weekly":
            hour, minute = map(int, str(data.get("time", "")).split(":"))
            scheduler.add_job(
                run_scheduled_job,
                "cron",
                id=job_key,
                replace_existing=True,
                day_of_week=str(data.get("day", "0")),
                hour=hour,
                minute=minute,
                args=[job_id],
            )

        elif schedule_type == "hourly":
            interval = max(int(data.get("interval", 1)), 1)
            scheduler.add_job(
                run_scheduled_job,
                "interval",
                id=job_key,
                replace_existing=True,
                hours=interval,
                args=[job_id],
            )

        elif schedule_type == "once":
            date_value = str(data.get("date", "")).strip()
            time_value = str(data.get("time", "")).strip()
            run_date = date_value
            if date_value and time_value and "T" not in date_value:
                run_date = f"{date_value}T{time_value}:00"
            if not run_date:
                raise HTTPException(status_code=400, detail="date is required for once schedule")
            scheduler.add_job(
                run_scheduled_job,
                "date",
                id=job_key,
                replace_existing=True,
                run_date=run_date,
                args=[job_id],
            )

        elif schedule_type == "monthly":
            day_of_month = int(data.get("date", 1))
            hour, minute = map(int, str(data.get("time", "")).split(":"))
            scheduler.add_job(
                run_scheduled_job,
                "cron",
                id=job_key,
                replace_existing=True,
                day=day_of_month,
                hour=hour,
                minute=minute,
                args=[job_id],
            )

        elif schedule_type == "cron":
            expr = str(data.get("cron", "")).strip()
            if not expr:
                raise HTTPException(status_code=400, detail="cron is required for cron schedule")
            scheduler.add_job(
                run_scheduled_job,
                trigger=CronTrigger.from_crontab(expr),
                id=job_key,
                replace_existing=True,
                args=[job_id],
            )
        else:
            raise HTTPException(status_code=400, detail="Unsupported schedule type")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to schedule job: {str(e)}")

    return {"message": "Scheduled successfully"}


@router.get("/schedules")
def list_schedules():
    jobs = []
    for j in scheduler.get_jobs():
        if str(getattr(j, "id", "")).startswith("scheduled_job_"):
            jobs.append(serialize_schedule_job(j))
    return {"items": jobs}


@router.get("/schedules/{job_id}")
def get_schedule(job_id: int):
    j = scheduler.get_job(scheduler_job_key(job_id))
    if not j:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return serialize_schedule_job(j)


@router.post("/schedules/{job_id}/pause")
def pause_schedule(job_id: int):
    j = scheduler.get_job(scheduler_job_key(job_id))
    if not j:
        raise HTTPException(status_code=404, detail="Schedule not found")
    scheduler.pause_job(scheduler_job_key(job_id))
    j = scheduler.get_job(scheduler_job_key(job_id))
    return {"message": "Schedule paused", "schedule": serialize_schedule_job(j)}


@router.post("/schedules/{job_id}/resume")
def resume_schedule(job_id: int):
    j = scheduler.get_job(scheduler_job_key(job_id))
    if not j:
        raise HTTPException(status_code=404, detail="Schedule not found")
    scheduler.resume_job(scheduler_job_key(job_id))
    j = scheduler.get_job(scheduler_job_key(job_id))
    return {"message": "Schedule resumed", "schedule": serialize_schedule_job(j)}


@router.delete("/schedules/{job_id}")
def delete_schedule(job_id: int):
    j = scheduler.get_job(scheduler_job_key(job_id))
    if not j:
        raise HTTPException(status_code=404, detail="Schedule not found")
    scheduler.remove_job(scheduler_job_key(job_id))
    return {"message": "Schedule deleted", "job_id": job_id}
    return {"message": "Schedule deleted", "job_id": job_id}

# --- SMART GETTERS (WITH STATS) ---

# --- SMART GETTERS (WITH STATS) ---

@router.get("/jobs")
def get_all_jobs(db: Session = Depends(get_db)):
    # Keep newest jobs first so recent inserts are visible at the top in UI.
    jobs = db.query(models.Job).order_by(models.Job.job_id.desc()).all()
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
            else:
                # Fallback for newly created jobs/tables before first run:
                # show uploaded row_count from metadata instead of 0.
                total_rows += (t.row_count or 0)

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


@router.get("/jobs/{job_id}/tables")
def get_tables_for_job(job_id: int, db: Session = Depends(get_db)):
    tables = db.query(models.TableMetadata).filter(models.TableMetadata.job_id == job_id).all()
    result = []
    
    for t in tables:
        stat = db.query(models.TableStats).filter(
            models.TableStats.job_id == job_id, 
            models.TableStats.table_id == t.table_id
        ).order_by(models.TableStats.stat_id.desc()).first()
        
        rules_count = (
            db.query(models.Rule)
            .filter(
                models.Rule.job_id == job_id,
                models.Rule.table_id == t.table_id,
                models.Rule.is_active.is_(True),
            )
            .count()
        )
        
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

@router.get("/tables/{job_id}/{table_id}/details") # <--- CHANGED URL
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

@router.put("/jobs/{job_id}/rename")
def rename_job(job_id: int, payload: RenamePayload, db: Session = Depends(get_db)):
    job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not job: raise HTTPException(status_code=404, detail="Job not found")
    job.job_name = payload.name
    db.commit()
    return {"message": "Job renamed successfully"}

@router.put("/tables/{table_id}/rename")
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

@router.delete("/jobs/{job_id}")
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

@router.delete("/tables/{table_id}")
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

def load_result_dataframes(db: Session, table_name: str, job_id: int):
    """Load clean/error result tables for a job; fallback to latest table-name match."""
    inspector = inspect(db.bind)
    all_tables = inspector.get_table_names(schema="app_data")

    t_name_lower = table_name.lower()
    j_id_str = str(job_id)

    exact_clean = []
    exact_error = []
    fallback_clean = []
    fallback_error = []

    for t in all_tables:
        t_lower = t.lower()
        if t_name_lower not in t_lower:
            continue

        is_exact_job = (f"job{j_id_str}" in t_lower) or (f"_{j_id_str}_" in t_lower)
        if "clean" in t_lower:
            (exact_clean if is_exact_job else fallback_clean).append(t)
        elif "error" in t_lower or "quarantine" in t_lower or "bad" in t_lower:
            (exact_error if is_exact_job else fallback_error).append(t)

    # Prefer exact job match; if missing, use latest lexical match for same table name.
    actual_clean = sorted(exact_clean)[-1] if exact_clean else (sorted(fallback_clean)[-1] if fallback_clean else None)
    actual_error = sorted(exact_error)[-1] if exact_error else (sorted(fallback_error)[-1] if fallback_error else None)

    if not actual_clean and not actual_error:
        raise Exception(
            f"Tables missing in 'app_data'. Looked for '{t_name_lower}' + 'job{j_id_str}'. Exists in app_data: {all_tables}"
        )

    df_clean = pd.DataFrame()
    df_error = pd.DataFrame()
    if actual_clean:
        try:
            df_clean = pd.read_sql_table(actual_clean, db.bind, schema="app_data")
        except Exception:
            pass
    if actual_error:
        try:
            df_error = pd.read_sql_table(actual_error, db.bind, schema="app_data")
        except Exception:
            pass

    if df_clean.empty and df_error.empty:
        raise Exception(f"Found the tables ({actual_clean}, {actual_error}) in app_data, but they are completely empty.")
    return df_clean, df_error


def generate_formatted_excel(db: Session, table_name: str, job_id: int):
    df_clean, df_error = load_result_dataframes(db, table_name, job_id)

    # Combine and tag rows
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


def generate_output_dataframe(db: Session, table_name: str, job_id: int):
    """Return combined clean+error rows as a dataframe."""
    df_clean, df_error = load_result_dataframes(db, table_name, job_id)
    if not df_error.empty:
        return pd.concat([df_clean, df_error], ignore_index=True)
    return df_clean



@router.get("/tables/{table_id}/download")
def download_table_excel(table_id: int, db: Session = Depends(get_db)):
    table = db.query(models.TableMetadata).filter(models.TableMetadata.table_id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
        
    try:
        file_bytes, filename, mime_type = build_table_output_bytes(db, table, "excel")
        response = StreamingResponse(iter([file_bytes]), media_type=mime_type)
        response.headers["Content-Disposition"] = f"attachment; filename={filename}"
        return response
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/tables/{table_id}/download-csv")
def download_table_csv(table_id: int, db: Session = Depends(get_db)):
    table = db.query(models.TableMetadata).filter(models.TableMetadata.table_id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    try:
        file_bytes, filename, mime_type = build_table_output_bytes(db, table, "csv")
        response = StreamingResponse(iter([file_bytes]), media_type=mime_type)
        response.headers["Content-Disposition"] = f"attachment; filename={filename}"
        return response
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))



@router.post("/tables/{table_id}/email")
def email_table_output(table_id: int, payload: TableEmailPayload, db: Session = Depends(get_db)):
    table = (
        db.query(models.TableMetadata)
        .filter(models.TableMetadata.table_id == table_id)
        .order_by(models.TableMetadata.job_id.desc())
        .first()
    )
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    to_email = (payload.to_email or "").strip()
    if not to_email:
        raise HTTPException(status_code=400, detail="to_email is required")

    tenant_id = os.getenv("MS_GRAPH_TENANT_ID", "").strip()
    client_id = os.getenv("MS_GRAPH_CLIENT_ID", "").strip()
    client_secret = os.getenv("MS_GRAPH_CLIENT_SECRET", "").strip()
    sender_email = os.getenv("MS_GRAPH_SENDER_EMAIL", "").strip()

    if not tenant_id or not client_id or not client_secret or not sender_email:
        raise HTTPException(
            status_code=400,
            detail=(
                "Email is not configured. Set MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, "
                "MS_GRAPH_CLIENT_SECRET, and MS_GRAPH_SENDER_EMAIL in backend .env."
            ),
        )

    fmt = (payload.format or "csv").strip().lower()
    file_bytes, filename, mime_type = build_table_output_bytes(db, table, fmt)

    subject = (
        payload.subject.strip()
        if payload.subject and payload.subject.strip()
        else f"MDQM Results - {table.table_name}"
    )
    body = (
        payload.body
        if payload.body is not None
        else (
            f"Hello,\n\n"
            f"Please find attached the MDQM output for table '{table.table_name}'.\n\n"
            f"Regards,\nMDQM"
        )
    )

    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    token_body = urlparse.urlencode(
        {
            "client_id": client_id,
            "scope": "https://graph.microsoft.com/.default",
            "client_secret": client_secret,
            "grant_type": "client_credentials",
        }
    ).encode("utf-8")
    token_req = urlrequest.Request(
        token_url,
        data=token_body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urlrequest.urlopen(token_req, timeout=20) as resp:
            token_payload = json.loads(resp.read().decode("utf-8"))
            access_token = token_payload.get("access_token")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get Graph token: {str(e)}")

    if not access_token:
        raise HTTPException(status_code=400, detail="Graph token response missing access_token")

    graph_mail_url = f"https://graph.microsoft.com/v1.0/users/{sender_email}/sendMail"
    mail_payload = {
        "message": {
            "subject": subject,
            "body": {
                "contentType": "HTML",
                "content": body.replace("\n", "<br/>"),
            },
            "toRecipients": [
                {
                    "emailAddress": {
                        "address": to_email,
                    }
                }
            ],
            "attachments": [
                {
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    "name": filename,
                    "contentType": mime_type,
                    "contentBytes": base64.b64encode(file_bytes).decode("utf-8"),
                }
            ],
        },
        "saveToSentItems": "true",
    }
    mail_req = urlrequest.Request(
        graph_mail_url,
        data=json.dumps(mail_payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlrequest.urlopen(mail_req, timeout=30):
            pass
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to send email via Graph API: {str(e)}")

    return {
        "message": "Email sent successfully",
        "to_email": to_email,
        "filename": filename,
    }


@router.post("/tables/{table_id}/sharepoint-upload")
def upload_table_to_sharepoint(table_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    """
    Upload table output file (csv/excel) to SharePoint via Microsoft Graph.
    Required env vars:
      SP_TENANT_ID, SP_CLIENT_ID, SP_CLIENT_SECRET, SP_DRIVE_ID
    Optional env vars:
      SP_FOLDER_PATH (default: MDQM-Exports)
    """
    table = (
        db.query(models.TableMetadata)
        .filter(models.TableMetadata.table_id == table_id)
        .order_by(models.TableMetadata.job_id.desc())
        .first()
    )
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    tenant_id = os.getenv("SP_TENANT_ID")
    client_id = os.getenv("SP_CLIENT_ID")
    client_secret = os.getenv("SP_CLIENT_SECRET")
    drive_id = os.getenv("SP_DRIVE_ID")
    payload_folder = (payload.get("folder_path") or "").strip().strip("/")
    env_folder = (os.getenv("SP_FOLDER_PATH", "MDQM-Exports") or "MDQM-Exports").strip("/")
    folder_path = payload_folder or env_folder

    if not tenant_id or not client_id or not client_secret or not drive_id:
        raise HTTPException(
            status_code=400,
            detail="SharePoint is not configured. Set SP_TENANT_ID, SP_CLIENT_ID, SP_CLIENT_SECRET, SP_DRIVE_ID.",
        )

    fmt = (payload.get("format") or "csv").strip().lower()
    file_bytes, filename, _mime = build_table_output_bytes(db, table, fmt)

    # 1) Acquire app-only token
    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    token_body = urlparse.urlencode(
        {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
        }
    ).encode("utf-8")
    token_req = urlrequest.Request(
        token_url,
        data=token_body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urlrequest.urlopen(token_req, timeout=20) as resp:
            token_payload = json.loads(resp.read().decode("utf-8"))
            access_token = token_payload.get("access_token")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get SharePoint token: {str(e)}")

    if not access_token:
        raise HTTPException(status_code=400, detail="SharePoint token is missing access_token")

    # 2) Upload bytes to drive root:/folder/file:/content
    graph_path = f"{folder_path}/{filename}" if folder_path else filename
    upload_url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root:/{graph_path}:/content"
    upload_req = urlrequest.Request(
        upload_url,
        data=file_bytes,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/octet-stream",
        },
        method="PUT",
    )

    try:
        with urlrequest.urlopen(upload_req, timeout=60) as resp:
            item_payload = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to upload to SharePoint: {str(e)}")

    return {
        "message": "Uploaded to SharePoint successfully",
        "filename": filename,
        "file_id": item_payload.get("id"),
        "web_url": item_payload.get("webUrl"),
    }



@router.get("/jobs/{job_id}/download")
def download_job_zip(job_id: int, db: Session = Depends(get_db)):
    return build_job_zip_response(db, job_id)
@router.get("/tables/{table_id}/columns/stats")
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

@router.put("/tables/{table_id}/columns/rename")
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
    
@router.post("/tables/{table_id}/standardize-dates")
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
            
            # 2. CHOP OFF EXISTING TIMESTAMPS (space or ISO "T")
            clean_val = strip_time_from_date_string(val)
            
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

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func # Needed for counts
from database import get_db
import models

router = APIRouter()

# 1. Get Job Stats (e.g. "3/10 columns covered")
@router.get("/jobs/{job_id}/stats")
def get_job_validation_stats(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Calculate Total Columns across all tables in this job
    # We can query ColumnMetadata directly since we added job_id to it
    total_columns = db.query(models.ColumnMetadata)\
        .filter(models.ColumnMetadata.job_id == job_id).count()

    # Calculate Columns that have at least one rule
    columns_with_rules = db.query(models.Rule.column_name)\
        .filter(models.Rule.job_id == job_id)\
        .distinct().count()

    # Total Rules Count
    total_rules = db.query(models.Rule).filter(models.Rule.job_id == job_id).count()

    return {
        "job_id": job.job_id,
        "job_name": job.job_name,
        "total_tables": len(job.tables),
        "column_coverage": f"{columns_with_rules}/{total_columns}", 
        "total_rules": total_rules
    }

# 2. Get Rules for a specific Table (FIXED: Added job_id context)
@router.get("/jobs/{job_id}/tables/{table_id}/rules")
def get_table_rules(job_id: int, table_id: int, db: Session = Depends(get_db)):
    """
    Fetches rules for a specific table within a specific job.
    """
    rules = db.query(models.Rule).filter(
        models.Rule.job_id == job_id,       # <--- Added Filter
        models.Rule.table_id == table_id    # <--- Added Filter
    ).all()
    return rules

# 3. Toggle Rule (Active/Disable Switch)
@router.patch("/rules/{rule_id}/toggle")
def toggle_rule(rule_id: int, db: Session = Depends(get_db)):
    # rule_id is Globally Unique (Serial), so we don't need job_id here
    rule = db.query(models.Rule).filter(models.Rule.rule_id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    rule.is_active = not rule.is_active 
    db.commit()
    return {"status": "success", "new_state": rule.is_active}
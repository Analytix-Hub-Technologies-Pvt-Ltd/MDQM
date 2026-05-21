"""Enterprise dashboard data access — pagination, filters, persistence."""

from __future__ import annotations

import csv
import io
import json
import os
import re
from datetime import datetime
from typing import Any

import pandas as pd

from sqlalchemy import func, or_, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

import models


def _page_bounds(page: int, page_size: int) -> tuple[int, int]:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    offset = (page - 1) * page_size
    return offset, page_size


def paginated_response(items: list, total: int, page: int, page_size: int) -> dict[str, Any]:
    return {"items": items, "total": total, "page": page, "page_size": page_size}


# --- Scheduler ---


def list_schedule_history(db: Session, page: int, page_size: int, job_id: int | None, status: str | None, q: str | None):
    offset, page_size = _page_bounds(page, page_size)
    query = db.query(models.EnterpriseScheduleRun).order_by(models.EnterpriseScheduleRun.id.desc())
    if job_id is not None:
        query = query.filter(models.EnterpriseScheduleRun.job_id == job_id)
    if status:
        query = query.filter(models.EnterpriseScheduleRun.status == status)
    if q:
        query = query.filter(models.EnterpriseScheduleRun.message.ilike(f"%{q}%"))
    total = query.count()
    rows = query.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "schedule_id": r.schedule_id,
            "job_id": r.job_id,
            "status": r.status,
            "message": r.message,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


def list_schedules(db: Session, page: int, page_size: int, active_only: bool | None):
    offset, page_size = _page_bounds(page, page_size)
    q = db.query(models.EnterpriseSchedule, models.Job).join(models.Job, models.Job.job_id == models.EnterpriseSchedule.job_id).order_by(models.EnterpriseSchedule.id.desc())
    if active_only:
        q = q.filter(models.EnterpriseSchedule.is_active.is_(True))
    total = q.count()
    rows = q.offset(offset).limit(page_size).all()
    items = []
    for sched, job in rows:
        items.append(
            {
                "id": sched.id,
                "job_id": sched.job_id,
                "job_name": job.job_name,
                "name": sched.name,
                "schedule_type": sched.schedule_type,
                "cron_expression": sched.cron_expression,
                "interval_minutes": sched.interval_minutes,
                "is_active": sched.is_active,
                "created_at": sched.created_at.isoformat() if sched.created_at else None,
            }
        )
    return paginated_response(items, total, page, page_size)


def append_schedule_run(
    db: Session,
    *,
    schedule_id: int | None,
    job_id: int,
    status: str,
    message: str | None,
) -> models.EnterpriseScheduleRun:
    now = datetime.utcnow()
    row = models.EnterpriseScheduleRun(
        schedule_id=schedule_id,
        job_id=job_id,
        status=status,
        message=message,
        started_at=now,
        finished_at=now if status in ("success", "failed", "skipped") else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def create_schedule(
    db: Session,
    *,
    job_id: int,
    name: str,
    schedule_type: str,
    cron_expression: str | None,
    interval_minutes: int | None,
    user_id: int | None,
) -> models.EnterpriseSchedule:
    row = models.EnterpriseSchedule(
        job_id=job_id,
        name=name,
        schedule_type=schedule_type,
        cron_expression=cron_expression,
        interval_minutes=interval_minutes,
        is_active=True,
        created_by_user_id=user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def set_schedule_active(db: Session, schedule_id: int, active: bool) -> models.EnterpriseSchedule | None:
    row = db.query(models.EnterpriseSchedule).filter(models.EnterpriseSchedule.id == schedule_id).first()
    if not row:
        return None
    row.is_active = active
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


# --- Monitoring ---


def monitoring_health(db: Session) -> dict[str, Any]:
    jobs = db.query(func.count(models.Job.job_id)).scalar() or 0
    failed = db.query(func.count(models.Job.job_id)).filter(models.Job.status.ilike("%fail%")).scalar() or 0
    return {
        "status": "degraded" if failed else "healthy",
        "jobs_total": int(jobs),
        "jobs_failed": int(failed),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


def list_api_logs(db: Session, page: int, page_size: int, path_q: str | None):
    offset, page_size = _page_bounds(page, page_size)
    q = db.query(models.EnterpriseApiLog).order_by(models.EnterpriseApiLog.id.desc())
    if path_q:
        q = q.filter(models.EnterpriseApiLog.path.ilike(f"%{path_q}%"))
    total = q.count()
    rows = q.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "method": r.method,
            "path": r.path,
            "status_code": r.status_code,
            "duration_ms": r.duration_ms,
            "user_id": r.user_id,
            "correlation_id": r.correlation_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


def monitoring_metrics(db: Session) -> dict[str, Any]:
    api_hits = db.query(func.count(models.EnterpriseApiLog.id)).scalar() or 0
    val_runs = db.query(func.count(models.EnterpriseValidationResult.id)).scalar() or 0
    return {"api_requests_logged": int(api_hits), "validation_runs_recorded": int(val_runs)}


# --- Validation ---


def record_validation_result(
    db: Session,
    *,
    job_id: int,
    table_id: int | None,
    passed: bool,
    summary: str,
    details: dict | None,
    user_id: int | None,
) -> models.EnterpriseValidationResult:
    row = models.EnterpriseValidationResult(
        job_id=job_id,
        table_id=table_id,
        passed=passed,
        summary=summary,
        details=details,
        created_by_user_id=user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_validation_results(db: Session, page: int, page_size: int, job_id: int | None, q: str | None = None):
    offset, page_size = _page_bounds(page, page_size)
    query = db.query(models.EnterpriseValidationResult).order_by(models.EnterpriseValidationResult.id.desc())
    if job_id is not None:
        query = query.filter(models.EnterpriseValidationResult.job_id == job_id)
    if q:
        query = query.filter(models.EnterpriseValidationResult.summary.ilike(f"%{q}%"))
    total = query.count()
    rows = query.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "job_id": r.job_id,
            "table_id": r.table_id,
            "passed": r.passed,
            "summary": r.summary,
            "details": r.details,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


# --- Quarantine summaries ---


def refresh_quarantine_summaries(db: Session) -> int:
    """Aggregate quarantine logs into enterprise.quarantine_records for dashboard tables."""
    try:
        rows = db.execute(
            text(
                """
                SELECT job_id, table_name, COUNT(*) AS cnt,
                       MAX(error_type) AS last_err
                FROM quarantine.logs
                GROUP BY job_id, table_name
                """
            )
        ).fetchall()
    except ProgrammingError:
        db.rollback()
        return 0
    updated = 0
    for job_id, table_name, cnt, last_err in rows:
        existing = (
            db.query(models.EnterpriseQuarantineRecord)
            .filter(
                models.EnterpriseQuarantineRecord.job_id == job_id,
                models.EnterpriseQuarantineRecord.table_name == table_name,
            )
            .first()
        )
        if existing:
            existing.open_issues = int(cnt or 0)
            existing.last_error_type = last_err
            existing.updated_at = datetime.utcnow()
        else:
            db.add(
                models.EnterpriseQuarantineRecord(
                    job_id=job_id,
                    table_name=table_name,
                    open_issues=int(cnt or 0),
                    last_error_type=last_err,
                )
            )
        updated += 1
    db.commit()
    return updated


def list_quarantine_records(db: Session, page: int, page_size: int, job_id: int | None, table_q: str | None = None):
    offset, page_size = _page_bounds(page, page_size)
    q = db.query(models.EnterpriseQuarantineRecord).order_by(models.EnterpriseQuarantineRecord.updated_at.desc())
    if job_id is not None:
        q = q.filter(models.EnterpriseQuarantineRecord.job_id == job_id)
    if table_q:
        q = q.filter(models.EnterpriseQuarantineRecord.table_name.ilike(f"%{table_q}%"))
    total = q.count()
    rows = q.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "job_id": r.job_id,
            "table_name": r.table_name,
            "open_issues": r.open_issues,
            "last_error_type": r.last_error_type,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


# --- Access / audit extensions ---


def log_access(db: Session, *, user_id: int | None, resource: str, action: str, ip: str | None, meta: dict | None):
    row = models.EnterpriseAccessLog(user_id=user_id, resource=resource, action=action, ip_address=ip, meta=meta)
    db.add(row)
    db.commit()
    return row


def list_access_logs(db: Session, page: int, page_size: int, resource_q: str | None):
    offset, page_size = _page_bounds(page, page_size)
    q = db.query(models.EnterpriseAccessLog).order_by(models.EnterpriseAccessLog.id.desc())
    if resource_q:
        q = q.filter(models.EnterpriseAccessLog.resource.ilike(f"%{resource_q}%"))
    total = q.count()
    rows = q.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "user_id": r.user_id,
            "resource": r.resource,
            "action": r.action,
            "ip_address": r.ip_address,
            "meta": r.meta,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


def list_security_events(db: Session, page: int, page_size: int):
    offset, page_size = _page_bounds(page, page_size)
    q = (
        db.query(models.EnterpriseAccessLog)
        .filter(or_(models.EnterpriseAccessLog.action.ilike("security%"), models.EnterpriseAccessLog.action == "login.failed"))
        .order_by(models.EnterpriseAccessLog.id.desc())
    )
    total = q.count()
    rows = q.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "user_id": r.user_id,
            "resource": r.resource,
            "action": r.action,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


# --- Governance ---


def list_policies(db: Session, page: int, page_size: int, domain: str | None, name_q: str | None):
    offset, page_size = _page_bounds(page, page_size)
    q = db.query(models.EnterprisePolicy).order_by(models.EnterprisePolicy.id.desc())
    if domain:
        q = q.filter(models.EnterprisePolicy.domain == domain)
    if name_q:
        q = q.filter(models.EnterprisePolicy.policy_name.ilike(f"%{name_q}%"))
    total = q.count()
    rows = q.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "policy_name": r.policy_name,
            "domain": r.domain,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


def _ellipsis_text(text: str | None, max_len: int = 280) -> str:
    s = text or ""
    if len(s) <= max_len:
        return s
    return s[:max_len] + "…"


def create_policy(db: Session, *, policy_name: str, domain: str | None, content: str | None, owner_user_id: int | None):
    row = models.EnterprisePolicy(policy_name=policy_name, domain=domain, content=content, owner_user_id=owner_user_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def create_dataset(
    db: Session,
    *,
    name: str,
    domain: str | None,
    classification: str | None,
    description: str | None,
    owner_user_id: int | None,
    job_id: int | None = None,
) -> models.EnterpriseDataset:
    row = models.EnterpriseDataset(
        name=name.strip(),
        domain=domain,
        classification=classification,
        description=description,
        owner_user_id=owner_user_id,
        job_id=job_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def compute_dataset_scores(db: Session, row: models.EnterpriseDataset) -> dict[str, Any]:
    """
    EDA score: exploratory profile of ingested CSVs (column completeness / null rate).
    DQ score: validation outcomes from the latest TableStats per table on the linked job.
    """
    from services import business_user_service as busvc

    job_id = busvc._resolve_job_id(db, row)
    out: dict[str, Any] = {
        "job_id": job_id,
        "eda_score": None,
        "eda_score_source": "none",
        "dq_score": None,
        "dq_score_source": "none",
        "dq_job_linked": bool(job_id),
        "has_dq_run": False,
    }

    if row.quality_score is not None:
        out["dq_score"] = int(row.quality_score)
        out["dq_score_source"] = "manual"
        out["has_dq_run"] = True

    if job_id:
        from utils.upload_paths import resolve_table_csv_path

        tables = (
            db.query(models.TableMetadata)
            .filter(models.TableMetadata.job_id == job_id)
            .order_by(models.TableMetadata.table_id.asc())
            .all()
        )

        eda_parts: list[float] = []
        eda_weights: list[int] = []
        for t in tables:
            csv_path = resolve_table_csv_path(job_id, t.table_name)
            if not csv_path:
                continue
            try:
                df = pd.read_csv(csv_path)
            except Exception:
                continue
            if df.empty or len(df.columns) == 0:
                continue
            col_completeness = [float(df[c].notna().mean()) * 100.0 for c in df.columns]
            table_eda = sum(col_completeness) / len(col_completeness)
            eda_parts.append(table_eda)
            eda_weights.append(len(df))

        if eda_parts:
            if sum(eda_weights) > 0:
                out["eda_score"] = round(
                    sum(s * w for s, w in zip(eda_parts, eda_weights)) / sum(eda_weights), 1
                )
            else:
                out["eda_score"] = round(sum(eda_parts) / len(eda_parts), 1)
            out["eda_score_source"] = "csv_profile"
        elif tables:
            out["eda_score_source"] = "no_csv"

        if out["dq_score"] is None:
            total_rows = 0
            good_rows = 0
            has_run = False
            for t in tables:
                st = (
                    db.query(models.TableStats)
                    .filter(
                        models.TableStats.job_id == job_id,
                        models.TableStats.table_id == t.table_id,
                    )
                    .order_by(models.TableStats.stat_id.desc())
                    .first()
                )
                if not st or not (st.total_rows or 0):
                    continue
                has_run = True
                total_rows += int(st.total_rows or 0)
                good_rows += int(st.good_rows or 0)
            if has_run and total_rows > 0:
                out["dq_score"] = round((good_rows / total_rows) * 100.0, 1)
                out["dq_score_source"] = "job_stats"
                out["has_dq_run"] = True
            elif tables:
                out["dq_score_source"] = "pending"

    return out


def list_datasets(db: Session, page: int, page_size: int, name_q: str | None = None):
    offset, page_size = _page_bounds(page, page_size)
    q = db.query(models.EnterpriseDataset).order_by(models.EnterpriseDataset.id.desc())
    if name_q:
        q = q.filter(models.EnterpriseDataset.name.ilike(f"%{name_q}%"))
    total = q.count()
    rows = q.offset(offset).limit(page_size).all()
    items = []
    for r in rows:
        scores = compute_dataset_scores(db, r)
        items.append(
            {
                "id": r.id,
                "name": r.name,
                "domain": r.domain,
                "owner_user_id": r.owner_user_id,
                "job_id": scores.get("job_id") or r.job_id,
                "classification": r.classification,
                "description": _ellipsis_text(r.description),
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "eda_score": scores.get("eda_score"),
                "eda_score_source": scores.get("eda_score_source"),
                "dq_score": scores.get("dq_score"),
                "dq_score_source": scores.get("dq_score_source"),
                "dq_job_linked": scores.get("dq_job_linked"),
                "has_dq_run": scores.get("has_dq_run"),
            }
        )
    return paginated_response(items, total, page, page_size)


def _dataset_refresh_meta(job_row: models.Job | None) -> dict[str, Any]:
    if not job_row:
        return {
            "available": False,
            "kind": None,
            "manual_connection": False,
            "stored_password_available": False,
            "encryption_configured": False,
        }
    cfg = getattr(job_row, "db_source_config", None) or {}
    if not isinstance(cfg, dict) or cfg.get("kind") != "postgres_tables":
        return {
            "available": False,
            "kind": cfg.get("kind") if isinstance(cfg, dict) else None,
            "manual_connection": False,
            "stored_password_available": False,
            "encryption_configured": False,
        }
    has_blob = bool(cfg.get("encrypted_db_pass"))
    try:
        from utils.source_secret_crypto import encryption_available

        enc_avail = encryption_available()
    except Exception:
        enc_avail = False

    cid_raw = cfg.get("connection_id")
    has_saved_conn = False
    if cid_raw is not None:
        crs = str(cid_raw).strip()
        if crs and crs.lower() not in ("null", "nan"):
            try:
                int(float(crs))
                has_saved_conn = True
            except (ValueError, TypeError):
                has_saved_conn = False

    stored_ok = bool(enc_avail and has_blob)
    # Manual password in UI only when neither encrypted job secret nor saved connection id applies.
    manual_connection = not stored_ok and not has_saved_conn

    return {
        "available": True,
        "kind": "postgres_tables",
        "manual_connection": manual_connection,
        "stored_password_available": stored_ok,
        "encryption_configured": bool(enc_avail),
    }


def build_dataset_inventory_preview(
    db: Session, dataset_id: int, *, sample_rows: int = 15
) -> dict[str, Any] | None:
    """
    Catalog dataset + linked DQ job: column metadata and a small CSV sample per table.
    """
    row = db.query(models.EnterpriseDataset).filter(models.EnterpriseDataset.id == dataset_id).first()
    if not row:
        return None

    from services import business_user_service as busvc

    job_id = row.job_id or busvc._resolve_job_id(db, row)
    score_meta = compute_dataset_scores(db, row)
    base = {
        "dataset": {
            "id": row.id,
            "name": row.name,
            "domain": row.domain,
            "classification": row.classification,
            "description": row.description,
            "catalog_job_id": row.job_id,
            "eda_score": score_meta.get("eda_score"),
            "dq_score": score_meta.get("dq_score"),
            "eda_score_source": score_meta.get("eda_score_source"),
            "dq_score_source": score_meta.get("dq_score_source"),
        },
    }
    if not job_id:
        return {
            **base,
            "linked_job": None,
            "tables": [],
            "hint": "No MDQM job is linked to this catalog entry. Create again from Data Owner (links automatically) or ensure the dataset name matches the job name.",
            "refresh": {
                "available": False,
                "kind": None,
                "manual_connection": False,
                "stored_password_available": False,
                "encryption_configured": False,
            },
        }

    job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    tables_meta = (
        db.query(models.TableMetadata)
        .filter(models.TableMetadata.job_id == job_id)
        .order_by(models.TableMetadata.table_id.asc())
        .all()
    )
    from utils.upload_paths import resolve_table_csv_path

    out_tables: list[dict[str, Any]] = []
    for t in tables_meta:
        cols = (
            db.query(models.ColumnMetadata)
            .filter(
                models.ColumnMetadata.job_id == job_id,
                models.ColumnMetadata.table_id == t.table_id,
            )
            .order_by(models.ColumnMetadata.column_name.asc())
            .all()
        )
        col_list = [{"name": c.column_name, "data_type": c.data_type} for c in cols]
        sample: list[dict[str, Any]] = []
        csv_path = resolve_table_csv_path(job_id, t.table_name)
        if csv_path:
            try:
                df = pd.read_csv(csv_path, nrows=sample_rows)
                sample = df.fillna("").astype(str).to_dict(orient="records")
            except Exception:
                sample = []
        rel_source = None
        if csv_path:
            rel_source = os.path.relpath(csv_path, "uploads").replace("\\", "/")
        out_tables.append(
            {
                "table_id": t.table_id,
                "table_name": t.table_name,
                "row_count": t.row_count,
                "columns": col_list,
                "sample_rows": sample,
                "source_file": rel_source,
            }
        )

    return {
        **base,
        "linked_job": {
            "job_id": job_id,
            "job_name": job.job_name if job else None,
            "status": job.status if job else None,
        },
        "refresh": _dataset_refresh_meta(job),
        "tables": out_tables,
    }


def list_glossary(db: Session, page: int, page_size: int, q: str | None):
    offset, page_size = _page_bounds(page, page_size)
    query = db.query(models.EnterpriseGlossaryTerm).order_by(models.EnterpriseGlossaryTerm.term.asc())
    if q:
        query = query.filter(models.EnterpriseGlossaryTerm.term.ilike(f"%{q}%"))
    total = query.count()
    rows = query.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "term": r.term,
            "definition": r.definition,
            "domain": r.domain,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


def create_glossary_term(db: Session, *, term: str, definition: str, domain: str | None, status: str = "draft"):
    row = models.EnterpriseGlossaryTerm(term=term, definition=definition, domain=domain, status=status)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# --- Compliance reports ---


def list_compliance_reports(db: Session, page: int, page_size: int):
    offset, page_size = _page_bounds(page, page_size)
    q = db.query(models.EnterpriseComplianceReport).order_by(models.EnterpriseComplianceReport.id.desc())
    total = q.count()
    rows = q.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "title": r.title,
            "framework": r.framework,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


def create_compliance_report(db: Session, *, title: str, framework: str, body: str | None, user_id: int | None):
    row = models.EnterpriseComplianceReport(title=title, framework=framework, body=body, created_by_user_id=user_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# --- Analytics ---


def list_analytics_metrics(db: Session, page: int, page_size: int, domain: str | None):
    offset, page_size = _page_bounds(page, page_size)
    q = db.query(models.EnterpriseAnalyticsMetric).order_by(models.EnterpriseAnalyticsMetric.captured_at.desc())
    if domain:
        q = q.filter(models.EnterpriseAnalyticsMetric.domain == domain)
    total = q.count()
    rows = q.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "metric_key": r.metric_key,
            "metric_value": r.metric_value,
            "domain": r.domain,
            "captured_at": r.captured_at.isoformat() if r.captured_at else None,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


def upsert_analytics_metric(db: Session, *, metric_key: str, metric_value: dict, domain: str | None):
    row = models.EnterpriseAnalyticsMetric(metric_key=metric_key, metric_value=metric_value, domain=domain)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# --- Notifications ---


def list_notifications(db: Session, user_id: int | None, page: int, page_size: int, unread_only: bool):
    offset, page_size = _page_bounds(page, page_size)
    q = db.query(models.EnterpriseNotification).order_by(models.EnterpriseNotification.id.desc())
    if user_id is not None:
        q = q.filter(or_(models.EnterpriseNotification.user_id == user_id, models.EnterpriseNotification.user_id.is_(None)))
    if unread_only:
        q = q.filter(models.EnterpriseNotification.read_at.is_(None))
    total = q.count()
    rows = q.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "subject": r.subject,
            "body": r.body,
            "severity": r.severity,
            "read_at": r.read_at.isoformat() if r.read_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


def mark_notification_read(db: Session, notif_id: int, user_id: int | None) -> bool:
    row = db.query(models.EnterpriseNotification).filter(models.EnterpriseNotification.id == notif_id).first()
    if not row:
        return False
    if user_id is not None and row.user_id not in (None, user_id):
        return False
    row.read_at = datetime.utcnow()
    db.commit()
    return True


def create_notification(db: Session, *, user_id: int | None, subject: str, body: str | None, severity: str = "info"):
    row = models.EnterpriseNotification(user_id=user_id, subject=subject, body=body, severity=severity)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# --- Report exports ---


def list_report_exports(db: Session, page: int, page_size: int, created_by_user_id: int | None = None):
    offset, page_size = _page_bounds(page, page_size)
    q = db.query(models.EnterpriseReportExport).order_by(models.EnterpriseReportExport.id.desc())
    if created_by_user_id is not None:
        q = q.filter(models.EnterpriseReportExport.created_by_user_id == created_by_user_id)
    total = q.count()
    rows = q.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "report_type": r.report_type,
            "format": r.format,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


def create_report_export(db: Session, *, report_type: str, format: str, payload: dict | None, user_id: int | None):
    row = models.EnterpriseReportExport(report_type=report_type, format=format, payload=payload, created_by_user_id=user_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def export_report_payload(report_type: str, payload: dict | None, export_format: str = "json") -> str:
    """Return downloadable CSV or JSON for a business report card."""
    data = dict(payload or {})
    data.setdefault("report_type", report_type)
    data["exported_at"] = datetime.utcnow().isoformat() + "Z"

    if export_format == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["field", "value"])
        for key in (
            "report_id",
            "title",
            "report_type",
            "dataset_name",
            "status",
            "quality_score",
            "last_refreshed",
            "external_url",
            "exported_at",
        ):
            if key in data and data[key] is not None and data[key] != "":
                writer.writerow([key, data[key]])
        return buf.getvalue()

    return json.dumps(data, indent=2)


def report_export_filename(payload: dict | None, export_format: str) -> str:
    title = (payload or {}).get("title") or "report"
    safe = re.sub(r"[^\w\-]+", "_", str(title).strip())[:80] or "report"
    ext = "csv" if export_format == "csv" else "json"
    return f"{safe}.{ext}"


def list_access_requests(db: Session, page: int, page_size: int, status: str | None):
    offset, page_size = _page_bounds(page, page_size)
    q = db.query(models.WorkflowApproval).order_by(models.WorkflowApproval.id.desc())
    if status:
        q = q.filter(models.WorkflowApproval.status == status)
    total = q.count()
    rows = q.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "request_type": r.request_type,
            "request_ref": r.request_ref,
            "owner_user_id": r.owner_user_id,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


def list_stewardship_tasks(db: Session, page: int, page_size: int, q: str | None = None):
    offset, page_size = _page_bounds(page, page_size)
    query = db.query(models.StewardshipTask).order_by(models.StewardshipTask.id.desc())
    if q:
        query = query.filter(models.StewardshipTask.dataset_name.ilike(f"%{q}%"))
    total = query.count()
    rows = query.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "dataset_name": r.dataset_name,
            "status": r.status,
            "severity": r.severity,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


def list_my_auth_access_requests(db: Session, email: str, page: int, page_size: int, q: str | None = None):
    """Rows from auth.access_requests for the signed-in user's email (self-service history)."""
    offset, page_size = _page_bounds(page, page_size)
    em = (email or "").strip().lower()
    query = db.query(models.AccessRequest).filter(models.AccessRequest.email == em)
    if q and str(q).strip():
        term = f"%{str(q).strip()}%"
        query = query.filter(
            (models.AccessRequest.reason.ilike(term))
            | (models.AccessRequest.dataset_name.ilike(term))
            | (models.AccessRequest.department.ilike(term))
        )
    query = query.order_by(models.AccessRequest.requested_at.desc())
    total = query.count()
    rows = query.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "full_name": r.full_name,
            "username": r.username,
            "email": r.email,
            "department": r.department,
            "reason": r.reason,
            "status": r.status,
            "requested_at": r.requested_at.isoformat() if r.requested_at else None,
            "dataset_name": r.dataset_name,
            "access_type": r.access_type,
            "duration": r.duration,
            "approver_name": r.approver_name,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


def count_my_auth_access_requests_by_status(db: Session, email: str) -> dict:
    em = (email or "").strip().lower()
    rows = db.query(models.AccessRequest.status, func.count()).filter(models.AccessRequest.email == em).group_by(models.AccessRequest.status).all()
    counts = {str(s or "").lower(): int(n) for s, n in rows}
    pending = counts.get("pending", 0)
    approved = counts.get("approved", 0)
    rejected = counts.get("rejected", 0)
    total = sum(counts.values())
    return {"total": total, "pending": pending, "approved": approved, "rejected": rejected}


def create_auth_access_request(
    db: Session,
    *,
    full_name: str,
    email: str,
    department: str | None,
    reason: str | None,
    username: str | None = None,
    dataset_name: str | None = None,
    access_type: str | None = None,
    duration: str | None = None,
) -> models.AccessRequest:
    row = models.AccessRequest(
        full_name=full_name.strip(),
        username=(username or "").strip() or None,
        email=email.strip().lower(),
        department=(department or "").strip() or None,
        reason=(reason or "").strip() or None,
        status="pending",
        dataset_name=(dataset_name or "").strip() or None,
        access_type=(access_type or "read").strip().lower() or "read",
        duration=(duration or "").strip() or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    notify_owners_new_data_access_request(db, row)
    return row


def _stamp_access_request_approver(req: models.AccessRequest, reviewer: models.User) -> None:
    req.approver_name = (reviewer.full_name or reviewer.username or reviewer.email or "Reviewer").strip()[:255]


def list_governance_auth_data_access_requests(
    db: Session,
    page: int,
    page_size: int,
    status: str | None = None,
    q: str | None = None,
    *,
    history: bool = False,
):
    """Business-user dataset access requests (auth.access_requests with dataset_name)."""
    from sqlalchemy import or_

    offset, page_size = _page_bounds(page, page_size)
    query = db.query(models.AccessRequest).filter(
        models.AccessRequest.dataset_name.isnot(None),
        models.AccessRequest.dataset_name != "",
    )
    if history:
        query = query.filter(func.lower(models.AccessRequest.status) != "pending")
    elif status and str(status).strip():
        query = query.filter(func.lower(models.AccessRequest.status) == str(status).strip().lower())
    if q and str(q).strip():
        term = f"%{str(q).strip()}%"
        query = query.filter(
            or_(
                models.AccessRequest.dataset_name.ilike(term),
                models.AccessRequest.email.ilike(term),
                models.AccessRequest.full_name.ilike(term),
                models.AccessRequest.reason.ilike(term),
            )
        )
    query = query.order_by(models.AccessRequest.requested_at.desc())
    total = query.count()
    rows = query.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "requester": r.full_name,
            "email": r.email,
            "dataset_name": r.dataset_name,
            "access_type": r.access_type,
            "duration": r.duration,
            "reason": r.reason,
            "department": r.department,
            "status": r.status,
            "requested_at": r.requested_at.isoformat() if r.requested_at else None,
            "approver_name": r.approver_name,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


def notify_owners_new_data_access_request(db: Session, row: models.AccessRequest) -> None:
    """Alert data owners that a business user submitted a dataset access request."""
    if not row.dataset_name:
        return
    owners = (
        db.query(models.User)
        .filter(models.User.is_active.is_(True), func.upper(models.User.role) == "DATA_OWNER")
        .all()
    )
    subject = f"Data access request: {row.dataset_name}"
    body = (
        f"{row.full_name} ({row.email}) requested {row.access_type or 'read'} access "
        f"for {row.duration or 'unspecified duration'}.\n\nPurpose: {row.reason or '—'}"
    )
    for owner in owners:
        try:
            create_notification(db, user_id=owner.id, subject=subject, body=body, severity="info")
        except Exception:
            pass


def approve_governance_data_access_request(
    db: Session, request_id: int, reviewer: models.User
) -> models.AccessRequest:
    req = db.query(models.AccessRequest).filter(models.AccessRequest.id == request_id).first()
    if not req or req.status != "pending":
        raise ValueError("pending_not_found")
    if not (req.dataset_name or "").strip():
        raise ValueError("not_data_request")
    em = (req.email or "").strip().lower()
    user = db.query(models.User).filter(func.lower(models.User.email) == em).first()
    if not user:
        raise ValueError("no_user_account")
    req.status = "approved"
    _stamp_access_request_approver(req, reviewer)
    db.add(req)
    db.commit()
    db.refresh(req)
    try:
        create_notification(
            db,
            user_id=user.id,
            subject="Data access request approved",
            body=f"Access to {req.dataset_name} was approved.",
            severity="info",
        )
    except Exception:
        pass
    return req


def reject_governance_data_access_request(
    db: Session, request_id: int, reviewer: models.User
) -> models.AccessRequest:
    req = db.query(models.AccessRequest).filter(models.AccessRequest.id == request_id).first()
    if not req or req.status != "pending":
        raise ValueError("pending_not_found")
    if not (req.dataset_name or "").strip():
        raise ValueError("not_data_request")
    req.status = "rejected"
    _stamp_access_request_approver(req, reviewer)
    db.add(req)
    db.commit()
    db.refresh(req)
    em = (req.email or "").strip().lower()
    user = db.query(models.User).filter(func.lower(models.User.email) == em).first()
    if user:
        try:
            create_notification(
                db,
                user_id=user.id,
                subject="Data access request denied",
                body=f"Access to {req.dataset_name or 'dataset'} was not approved.",
                severity="warning",
            )
        except Exception:
            pass
    return req

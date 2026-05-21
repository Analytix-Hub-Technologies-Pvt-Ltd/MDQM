"""Enterprise dashboard APIs — scheduler, monitoring, validation, governance, reports."""

from __future__ import annotations

import time

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from auth.deps import get_current_user
from database import SessionLocal
from engine.orchestrator import run_data_quality_job
from permissions.access_control import require_any_permission, require_permission
from permissions.permissions import Permissions
from permissions.role_map import Roles, normalize_role
from services import business_user_service as busvc
from services import enterprise_service as esvc
from services.lineage_service import lineage_graph_payload, seed_lineage_from_datasets
from utils.audit import write_audit_log

router = APIRouter(prefix="/api/enterprise", tags=["enterprise"])


def _db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _role(request: Request) -> str:
    return getattr(request.state, "user_role", "BUSINESS_USER")


# --- Developer: scheduler ---


class ScheduleCreateBody(BaseModel):
    job_id: int
    name: str
    schedule_type: Literal["interval", "cron", "once"] = "interval"
    cron_expression: str | None = None
    interval_minutes: int | None = None


class ScheduleIdBody(BaseModel):
    schedule_id: int


@router.get("/scheduler/history")
def scheduler_history(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    job_id: int | None = None,
    status: str | None = None,
    q: str | None = None,
):
    require_any_permission(_role(request), Permissions.DASHBOARD_DEVELOPER, Permissions.ADMIN_VIEW)
    return esvc.list_schedule_history(db, page, page_size, job_id, status, q)


@router.get("/scheduler/schedules")
def scheduler_schedules(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    active_only: bool = False,
):
    require_any_permission(_role(request), Permissions.DASHBOARD_DEVELOPER, Permissions.ADMIN_VIEW)
    return esvc.list_schedules(db, page, page_size, active_only if active_only else None)


@router.post("/scheduler/create")
def scheduler_create(
    request: Request,
    body: ScheduleCreateBody,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
):
    require_any_permission(_role(request), Permissions.DASHBOARD_DEVELOPER, Permissions.ADMIN_VIEW)
    require_permission(_role(request), Permissions.JOBS_VIEW)
    job = db.query(models.Job).filter(models.Job.job_id == body.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    row = esvc.create_schedule(
        db,
        job_id=body.job_id,
        name=body.name,
        schedule_type=body.schedule_type,
        cron_expression=body.cron_expression,
        interval_minutes=body.interval_minutes,
        user_id=user.id,
    )
    esvc.log_access(
        db,
        user_id=user.id,
        resource=f"enterprise.schedule:{row.id}",
        action="scheduler.create",
        ip=request.client.host if request.client else None,
        meta={"job_id": body.job_id},
    )
    write_audit_log(
        db,
        user_id=user.id,
        action="enterprise_schedule_created",
        entity_type="enterprise_schedule",
        entity_id=str(row.id),
        ip_address=request.client.host if request.client else None,
        new_values={"job_id": row.job_id, "name": row.name},
    )
    return {"id": row.id, "job_id": row.job_id, "name": row.name, "is_active": row.is_active}


@router.post("/scheduler/pause")
def scheduler_pause(request: Request, body: ScheduleIdBody, db: Session = Depends(_db), user: models.User = Depends(get_current_user)):
    require_any_permission(_role(request), Permissions.DASHBOARD_DEVELOPER, Permissions.ADMIN_VIEW)
    row = esvc.set_schedule_active(db, body.schedule_id, False)
    if not row:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"id": row.id, "is_active": row.is_active}


@router.post("/scheduler/resume")
def scheduler_resume(request: Request, body: ScheduleIdBody, db: Session = Depends(_db), user: models.User = Depends(get_current_user)):
    require_any_permission(_role(request), Permissions.DASHBOARD_DEVELOPER, Permissions.ADMIN_VIEW)
    row = esvc.set_schedule_active(db, body.schedule_id, True)
    if not row:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"id": row.id, "is_active": row.is_active}


# --- Monitoring ---


@router.get("/monitoring/health")
def monitoring_health(request: Request, db: Session = Depends(_db), user: models.User = Depends(get_current_user)):
    require_any_permission(
        _role(request),
        Permissions.DASHBOARD_DEVELOPER,
        Permissions.DASHBOARD_STEWARD,
        Permissions.DASHBOARD_AUDITOR,
        Permissions.DASHBOARD_BUSINESS_USER,
        Permissions.ADMIN_VIEW,
    )
    return esvc.monitoring_health(db)


@router.get("/monitoring/logs")
def monitoring_logs(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    path: str | None = None,
):
    require_any_permission(_role(request), Permissions.DASHBOARD_DEVELOPER, Permissions.ADMIN_VIEW)
    return esvc.list_api_logs(db, page, page_size, path)


@router.get("/monitoring/metrics")
def monitoring_metrics(request: Request, db: Session = Depends(_db), user: models.User = Depends(get_current_user)):
    require_any_permission(_role(request), Permissions.DASHBOARD_DEVELOPER, Permissions.ADMIN_VIEW)
    return esvc.monitoring_metrics(db)


# --- Validation ---


class ValidationRunBody(BaseModel):
    job_id: int


@router.post("/validation/run")
def validation_run(request: Request, body: ValidationRunBody, db: Session = Depends(_db), user: models.User = Depends(get_current_user)):
    require_any_permission(_role(request), Permissions.DASHBOARD_STEWARD, Permissions.JOBS_VIEW, Permissions.ADMIN_VIEW)
    job = db.query(models.Job).filter(models.Job.job_id == body.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    t0 = time.perf_counter()
    try:
        run_data_quality_job(body.job_id, db)
        ok = True
        msg = "Validation engine completed"
    except Exception as exc:
        ok = False
        msg = str(exc)
    duration_ms = int((time.perf_counter() - t0) * 1000)
    rec = esvc.record_validation_result(
        db,
        job_id=body.job_id,
        table_id=None,
        passed=ok,
        summary=msg,
        details={"duration_ms": duration_ms},
        user_id=user.id,
    )
    esvc.append_schedule_run(
        db,
        schedule_id=None,
        job_id=body.job_id,
        status="success" if ok else "failed",
        message=(msg or "")[:4000],
    )
    write_audit_log(
        db,
        user_id=user.id,
        action="enterprise_validation_run",
        entity_type="job",
        entity_id=str(body.job_id),
        ip_address=request.client.host if request.client else None,
        new_values={"result_id": rec.id, "passed": ok},
    )
    return {"result_id": rec.id, "passed": ok, "summary": msg}


@router.get("/validation/results")
def validation_results(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    job_id: int | None = None,
    q: str | None = None,
):
    require_any_permission(
        _role(request),
        Permissions.DASHBOARD_STEWARD,
        Permissions.DASHBOARD_BUSINESS_USER,
        Permissions.JOBS_VIEW,
        Permissions.ADMIN_VIEW,
    )
    return esvc.list_validation_results(db, page, page_size, job_id, q)


# --- Quarantine (steward) ---


@router.post("/quarantine/refresh-summaries")
def quarantine_refresh(request: Request, db: Session = Depends(_db), user: models.User = Depends(get_current_user)):
    require_any_permission(_role(request), Permissions.DASHBOARD_STEWARD, Permissions.QUARANTINE_VIEW, Permissions.ADMIN_VIEW)
    n = esvc.refresh_quarantine_summaries(db)
    return {"updated_rows": n}


@router.get("/quarantine/records")
def quarantine_records(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    job_id: int | None = None,
    table: str | None = None,
):
    require_any_permission(_role(request), Permissions.DASHBOARD_STEWARD, Permissions.QUARANTINE_VIEW, Permissions.ADMIN_VIEW)
    return esvc.list_quarantine_records(db, page, page_size, job_id, table)


# --- Audit / access (auditor) ---


@router.get("/audit/access")
def audit_access_logs(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    resource: str | None = None,
):
    require_any_permission(_role(request), Permissions.DASHBOARD_AUDITOR, Permissions.AUDIT_VIEW, Permissions.ADMIN_VIEW)
    return esvc.list_access_logs(db, page, page_size, resource)


@router.get("/audit/security-events")
def audit_security_events(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
):
    require_any_permission(_role(request), Permissions.DASHBOARD_AUDITOR, Permissions.AUDIT_VIEW, Permissions.ADMIN_VIEW)
    return esvc.list_security_events(db, page, page_size)


# --- Governance (owner / CDO) ---


@router.get("/governance/policies")
def governance_policies(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    domain: str | None = None,
    q: str | None = None,
):
    require_any_permission(
        _role(request),
        Permissions.DASHBOARD_OWNER,
        Permissions.DASHBOARD_CDO,
        Permissions.DASHBOARD_BUSINESS_USER,
        Permissions.GOVERNANCE_VIEW,
        Permissions.ADMIN_VIEW,
    )
    return esvc.list_policies(db, page, page_size, domain, q)


class PolicyCreateBody(BaseModel):
    policy_name: str
    domain: str | None = None
    content: str | None = None


@router.post("/governance/policies")
def governance_policy_create(request: Request, body: PolicyCreateBody, db: Session = Depends(_db), user: models.User = Depends(get_current_user)):
    require_any_permission(_role(request), Permissions.DASHBOARD_OWNER, Permissions.GOVERNANCE_VIEW, Permissions.ADMIN_VIEW)
    row = esvc.create_policy(db, policy_name=body.policy_name, domain=body.domain, content=body.content, owner_user_id=user.id)
    write_audit_log(
        db,
        user_id=user.id,
        action="enterprise_policy_created",
        entity_type="enterprise_policy",
        entity_id=str(row.id),
        ip_address=request.client.host if request.client else None,
        new_values={"policy_name": row.policy_name},
    )
    return {"id": row.id, "policy_name": row.policy_name}


@router.get("/governance/datasets")
def governance_datasets(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    q: str | None = None,
):
    require_any_permission(
        _role(request),
        Permissions.DASHBOARD_OWNER,
        Permissions.DASHBOARD_CDO,
        Permissions.DASHBOARD_BUSINESS_USER,
        Permissions.GOVERNANCE_VIEW,
        Permissions.ADMIN_VIEW,
    )
    return esvc.list_datasets(db, page, page_size, q)


class DatasetCreateBody(BaseModel):
    name: str
    domain: str | None = None
    classification: str | None = None
    description: str | None = None
    job_id: int | None = Field(None, ge=1)


@router.post("/governance/datasets")
def governance_dataset_create(request: Request, body: DatasetCreateBody, db: Session = Depends(_db), user: models.User = Depends(get_current_user)):
    require_any_permission(_role(request), Permissions.DASHBOARD_OWNER, Permissions.GOVERNANCE_VIEW, Permissions.ADMIN_VIEW)
    jid = body.job_id
    if jid is not None:
        job_row = db.query(models.Job).filter(models.Job.job_id == jid).first()
        if not job_row:
            raise HTTPException(status_code=400, detail="job_id does not match an existing job.")
    try:
        row = esvc.create_dataset(
            db,
            name=body.name,
            domain=body.domain,
            classification=body.classification,
            description=body.description,
            owner_user_id=user.id,
            job_id=jid,
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Dataset name already exists")
    write_audit_log(
        db,
        user_id=user.id,
        action="enterprise_dataset_created",
        entity_type="enterprise_dataset",
        entity_id=str(row.id),
        ip_address=request.client.host if request.client else None,
        new_values={"name": row.name},
    )
    return {"id": row.id, "name": row.name, "job_id": row.job_id}


@router.get("/governance/datasets/{dataset_id}/preview")
def governance_dataset_preview(
    dataset_id: int,
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
):
    require_any_permission(
        _role(request),
        Permissions.DASHBOARD_OWNER,
        Permissions.DASHBOARD_CDO,
        Permissions.DASHBOARD_BUSINESS_USER,
        Permissions.GOVERNANCE_VIEW,
        Permissions.ADMIN_VIEW,
    )
    preview = esvc.build_dataset_inventory_preview(db, dataset_id)
    if preview is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return preview


class BusinessReportPublishBody(BaseModel):
    title: str = Field(..., min_length=1)
    report_type: str = Field(..., min_length=1)
    dataset_name: str | None = None
    status: str = "Certified"
    quality_score: int | None = Field(None, ge=0, le=100)
    last_refreshed_label: str | None = None
    external_url: str | None = None


@router.get("/governance/business-reports")
def governance_business_reports_list(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    q: str | None = None,
):
    require_any_permission(
        _role(request),
        Permissions.DASHBOARD_OWNER,
        Permissions.DASHBOARD_CDO,
        Permissions.GOVERNANCE_VIEW,
        Permissions.ADMIN_VIEW,
    )
    return busvc.list_business_reports_manage(db, page, page_size, q)


@router.post("/governance/business-reports")
def governance_business_report_publish(
    request: Request,
    body: BusinessReportPublishBody,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
):
    require_any_permission(
        _role(request),
        Permissions.DASHBOARD_OWNER,
        Permissions.DASHBOARD_CDO,
        Permissions.GOVERNANCE_VIEW,
        Permissions.ADMIN_VIEW,
    )
    row = busvc.create_business_report(
        db,
        title=body.title,
        report_type=body.report_type,
        dataset_name=body.dataset_name,
        status=body.status,
        quality_score=body.quality_score,
        last_refreshed_label=body.last_refreshed_label,
        external_url=body.external_url,
        user_id=None,
    )
    write_audit_log(
        db,
        user_id=user.id,
        action="governance.business_report_published",
        entity_type="business_report",
        entity_id=str(row.id),
        ip_address=request.client.host if request.client else None,
        new_values={"title": row.title},
    )
    return {"id": row.id, "title": row.title}


@router.delete("/governance/business-reports/{report_id}")
def governance_business_report_delete(
    request: Request,
    report_id: int,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
):
    require_any_permission(
        _role(request),
        Permissions.DASHBOARD_OWNER,
        Permissions.DASHBOARD_CDO,
        Permissions.GOVERNANCE_VIEW,
        Permissions.ADMIN_VIEW,
    )
    if not busvc.delete_business_report(db, report_id):
        raise HTTPException(status_code=404, detail="Report not found")
    write_audit_log(
        db,
        user_id=user.id,
        action="governance.business_report_deleted",
        entity_type="business_report",
        entity_id=str(report_id),
        ip_address=request.client.host if request.client else None,
    )
    return {"deleted": True}


@router.get("/governance/access-requests")
def governance_access_requests(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    status: str | None = None,
    q: str | None = None,
    history: bool = Query(False),
):
    """Business-user data access queue for data owners (auth.access_requests)."""
    require_any_permission(_role(request), Permissions.DASHBOARD_OWNER, Permissions.GOVERNANCE_VIEW, Permissions.ADMIN_VIEW)
    return esvc.list_governance_auth_data_access_requests(db, page, page_size, status, q, history=history)


@router.post("/governance/access-requests/{request_id}/approve")
def governance_approve_data_access_request(
    request_id: int,
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
):
    require_any_permission(_role(request), Permissions.DASHBOARD_OWNER, Permissions.GOVERNANCE_VIEW, Permissions.ADMIN_VIEW)
    try:
        row = esvc.approve_governance_data_access_request(db, request_id, user)
    except ValueError as exc:
        code = str(exc)
        if code == "pending_not_found":
            raise HTTPException(status_code=404, detail="Pending request not found")
        if code == "not_data_request":
            raise HTTPException(status_code=400, detail="Not a dataset access request")
        if code == "no_user_account":
            raise HTTPException(
                status_code=400,
                detail="Requester has no login yet — use Admin → Access requests to approve signup first.",
            )
        raise HTTPException(status_code=400, detail="Cannot approve request")
    write_audit_log(
        db,
        user_id=user.id,
        action="governance.approve_data_access_request",
        entity_type="access_request",
        entity_id=str(request_id),
        ip_address=request.client.host if request.client else None,
        new_values={"status": "approved", "dataset": row.dataset_name},
    )
    return {"message": "Request approved", "id": row.id, "status": row.status}


@router.post("/governance/access-requests/{request_id}/reject")
def governance_reject_data_access_request(
    request_id: int,
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
):
    require_any_permission(_role(request), Permissions.DASHBOARD_OWNER, Permissions.GOVERNANCE_VIEW, Permissions.ADMIN_VIEW)
    try:
        row = esvc.reject_governance_data_access_request(db, request_id, user)
    except ValueError as exc:
        code = str(exc)
        if code == "pending_not_found":
            raise HTTPException(status_code=404, detail="Pending request not found")
        if code == "not_data_request":
            raise HTTPException(status_code=400, detail="Not a dataset access request")
        raise HTTPException(status_code=400, detail="Cannot reject request")
    write_audit_log(
        db,
        user_id=user.id,
        action="governance.reject_data_access_request",
        entity_type="access_request",
        entity_id=str(request_id),
        ip_address=request.client.host if request.client else None,
        new_values={"status": "rejected", "dataset": row.dataset_name},
    )
    return {"message": "Request rejected", "id": row.id, "status": row.status}


@router.get("/governance/glossary")
def governance_glossary(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    q: str | None = None,
):
    require_any_permission(
        _role(request),
        Permissions.DASHBOARD_OWNER,
        Permissions.DASHBOARD_CDO,
        Permissions.DASHBOARD_BUSINESS_USER,
        Permissions.GOVERNANCE_VIEW,
        Permissions.ADMIN_VIEW,
    )
    return esvc.list_glossary(db, page, page_size, q)


class GlossaryCreateBody(BaseModel):
    term: str
    definition: str
    domain: str | None = None
    status: str = "draft"


@router.post("/governance/glossary")
def governance_glossary_create(request: Request, body: GlossaryCreateBody, db: Session = Depends(_db), user: models.User = Depends(get_current_user)):
    require_any_permission(_role(request), Permissions.DASHBOARD_OWNER, Permissions.GOVERNANCE_VIEW, Permissions.ADMIN_VIEW)
    row = esvc.create_glossary_term(db, term=body.term, definition=body.definition, domain=body.domain, status=body.status)
    return {"id": row.id, "term": row.term}


# --- Compliance ---


@router.get("/compliance/reports")
def compliance_reports_list(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
):
    require_any_permission(
        _role(request),
        Permissions.DASHBOARD_AUDITOR,
        Permissions.DASHBOARD_BUSINESS_USER,
        Permissions.COMPLIANCE_VIEW,
        Permissions.DASHBOARD_CDO,
        Permissions.ADMIN_VIEW,
    )
    return esvc.list_compliance_reports(db, page, page_size)


class ComplianceReportBody(BaseModel):
    title: str
    framework: str
    body: str | None = None


@router.post("/compliance/reports")
def compliance_reports_create(request: Request, body: ComplianceReportBody, db: Session = Depends(_db), user: models.User = Depends(get_current_user)):
    require_any_permission(_role(request), Permissions.DASHBOARD_AUDITOR, Permissions.COMPLIANCE_VIEW, Permissions.ADMIN_VIEW)
    row = esvc.create_compliance_report(db, title=body.title, framework=body.framework, body=body.body, user_id=user.id)
    return {"id": row.id, "title": row.title}


# --- Analytics (CDO) ---


@router.get("/analytics/metrics")
def analytics_metrics_list(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    domain: str | None = None,
):
    require_any_permission(_role(request), Permissions.DASHBOARD_CDO, Permissions.REPORTS_VIEW, Permissions.ADMIN_VIEW)
    return esvc.list_analytics_metrics(db, page, page_size, domain)


class AnalyticsMetricBody(BaseModel):
    metric_key: str
    metric_value: dict
    domain: str | None = None


@router.post("/analytics/metrics")
def analytics_metrics_create(request: Request, body: AnalyticsMetricBody, db: Session = Depends(_db), user: models.User = Depends(get_current_user)):
    require_any_permission(_role(request), Permissions.DASHBOARD_CDO, Permissions.ADMIN_VIEW)
    row = esvc.upsert_analytics_metric(db, metric_key=body.metric_key, metric_value=body.metric_value, domain=body.domain)
    return {"id": row.id, "metric_key": row.metric_key}


# --- Notifications ---


@router.get("/notifications")
def notifications_list(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    unread_only: bool = False,
):
    require_any_permission(
        _role(request),
        Permissions.DASHBOARD_DEVELOPER,
        Permissions.DASHBOARD_STEWARD,
        Permissions.DASHBOARD_AUDITOR,
        Permissions.DASHBOARD_OWNER,
        Permissions.DASHBOARD_CDO,
        Permissions.DASHBOARD_BUSINESS_USER,
        Permissions.ADMIN_VIEW,
    )
    return esvc.list_notifications(db, user.id, page, page_size, unread_only)


@router.post("/notifications/{notif_id}/read")
def notifications_read(request: Request, notif_id: int, db: Session = Depends(_db), user: models.User = Depends(get_current_user)):
    require_any_permission(
        _role(request),
        Permissions.DASHBOARD_DEVELOPER,
        Permissions.DASHBOARD_STEWARD,
        Permissions.DASHBOARD_AUDITOR,
        Permissions.DASHBOARD_OWNER,
        Permissions.DASHBOARD_CDO,
        Permissions.DASHBOARD_BUSINESS_USER,
        Permissions.ADMIN_VIEW,
    )
    ok = esvc.mark_notification_read(db, notif_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"id": notif_id, "read": True}


# --- Reports export ---


@router.get("/reports")
def reports_list(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
):
    rl = _role(request)
    require_permission(rl, Permissions.REPORTS_VIEW)
    scope_user_id = user.id if normalize_role(rl) == Roles.BUSINESS_USER else None
    return esvc.list_report_exports(db, page, page_size, scope_user_id)


class ReportExportBody(BaseModel):
    report_type: str
    format: Literal["json", "csv"] = "json"
    payload: dict | None = None


@router.post("/reports/export")
def reports_export(request: Request, body: ReportExportBody, db: Session = Depends(_db), user: models.User = Depends(get_current_user)):
    require_permission(_role(request), Permissions.REPORTS_VIEW)
    row = esvc.create_report_export(db, report_type=body.report_type, format=body.format, payload=body.payload, user_id=user.id)
    try:
        esvc.create_notification(
            db,
            user_id=user.id,
            subject="Report export completed",
            body=f"Export #{row.id} ({body.report_type}, {body.format}) is listed under My reports.",
            severity="info",
        )
    except Exception:
        pass
    text_body = esvc.export_report_payload(body.report_type, body.payload, body.format)
    headers = {"X-Export-Id": str(row.id)}
    if body.format == "csv":
        filename = esvc.report_export_filename(body.payload, body.format)
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return PlainTextResponse(
        content=text_body,
        media_type="text/csv" if body.format == "csv" else "application/json",
        headers=headers,
    )


# --- Business user: self-service access requests (auth.access_requests) ---


class BusinessDataRequestBody(BaseModel):
    department: str | None = None
    reason: str = Field(..., min_length=1)
    dataset_name: str = Field(..., min_length=1)
    access_type: str = "read"
    duration: str | None = "30_days"


@router.get("/business/data-requests/summary")
def business_data_requests_summary(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    return esvc.count_my_auth_access_requests_by_status(db, user.email)


@router.get("/business/data-requests")
def business_list_my_data_requests(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    q: str | None = None,
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    return esvc.list_my_auth_access_requests(db, user.email, page, page_size, q)


@router.post("/business/data-requests")
def business_create_data_request(
    request: Request,
    body: BusinessDataRequestBody,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    row = esvc.create_auth_access_request(
        db,
        full_name=user.full_name,
        email=user.email,
        department=body.department,
        reason=body.reason.strip(),
        username=user.username,
        dataset_name=body.dataset_name.strip(),
        access_type=(body.access_type or "read").strip().lower() or "read",
        duration=(body.duration or "").strip() or None,
    )
    write_audit_log(
        db,
        user_id=user.id,
        action="enterprise.business_data_request",
        entity_type="access_request",
        entity_id=str(row.id),
        ip_address=request.client.host if request.client else None,
        new_values={"email": row.email, "status": row.status},
    )
    try:
        esvc.create_notification(
            db,
            user_id=user.id,
            subject="Data access request submitted",
            body=f"Request #{row.id} is pending review. Track it under Data requests.",
            severity="info",
        )
    except Exception:
        pass
    return {"id": row.id, "status": row.status, "message": "Request submitted"}


# --- Steward issues (from stewardship_tasks) ---


@router.get("/stewardship/issues")
def stewardship_issues(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    q: str | None = None,
):
    require_any_permission(
        _role(request),
        Permissions.DASHBOARD_STEWARD,
        Permissions.DASHBOARD_BUSINESS_USER,
        Permissions.STEWARDSHIP_VIEW,
        Permissions.ADMIN_VIEW,
    )
    return esvc.list_stewardship_tasks(db, page, page_size, q)


# --- Business user workspace (catalog, quality, overview, reports, alerts) ---


@router.get("/business/overview")
def business_overview(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    return busvc.business_overview(db, user)


@router.get("/business/catalog")
def business_catalog(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    q: str | None = None,
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    return busvc.list_catalog(db, page, page_size, q, user_email=user.email)


@router.get("/business/catalog/{dataset_id}/detail")
def business_catalog_dataset_detail(
    dataset_id: int,
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    detail = busvc.build_business_catalog_dataset_detail(db, dataset_id, user_email=user.email)
    if not detail:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return detail


@router.get("/business/quality-scores")
def business_quality_scores(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    q: str | None = None,
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    return busvc.list_quality_scores(db, page, page_size, q, user_email=user.email)


@router.get("/business/glossary")
def business_glossary(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    q: str | None = None,
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    return busvc.list_glossary_business(db, page, page_size, q, approved_only=True)


@router.get("/business/reports")
def business_reports(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    return busvc.list_business_reports(db, user.id, page, page_size)


@router.get("/business/alert-subscriptions")
def business_alert_subscriptions(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    return busvc.list_alert_subscriptions(db, user.id)


class AlertSubscriptionBody(BaseModel):
    dataset_name: str = Field(..., min_length=1)
    threshold: int | None = Field(None, ge=50, le=100)


class AlertSubscriptionUpdateBody(BaseModel):
    threshold: int = Field(..., ge=50, le=100)


@router.post("/business/alert-subscriptions")
def business_alert_subscription_create(
    request: Request,
    body: AlertSubscriptionBody,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    row = busvc.create_alert_subscription(db, user.id, body.dataset_name, body.threshold)
    return {"id": row.id, "dataset_name": row.dataset_name, "threshold": row.threshold}


@router.patch("/business/alert-subscriptions/{sub_id}")
def business_alert_subscription_update(
    request: Request,
    sub_id: int,
    body: AlertSubscriptionUpdateBody,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    row = busvc.update_alert_subscription(db, user.id, sub_id, threshold=body.threshold)
    if not row:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return {"id": row.id, "dataset_name": row.dataset_name, "threshold": row.threshold}


@router.delete("/business/alert-subscriptions/{sub_id}")
def business_alert_subscription_delete(
    request: Request,
    sub_id: int,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    if not busvc.delete_alert_subscription(db, user.id, sub_id):
        raise HTTPException(status_code=404, detail="Subscription not found")
    return {"deleted": True}


@router.get("/business/lineage")
def business_lineage_graph(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    dataset: str | None = Query(None, description="Filter graph around this dataset name"),
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    require_permission(_role(request), Permissions.LINEAGE_VIEW)
    return lineage_graph_payload(db, auto_seed=True, dataset_name=dataset)


@router.post("/business/lineage/seed")
def business_lineage_seed(
    request: Request,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
    force: bool = Query(False),
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    require_permission(_role(request), Permissions.LINEAGE_VIEW)
    return seed_lineage_from_datasets(db, force=force)


@router.delete("/business/data-requests/{request_id}")
def business_cancel_data_request(
    request: Request,
    request_id: int,
    db: Session = Depends(_db),
    user: models.User = Depends(get_current_user),
):
    require_permission(_role(request), Permissions.DASHBOARD_BUSINESS_USER)
    if not busvc.cancel_data_request(db, user.email, request_id):
        raise HTTPException(status_code=404, detail="Pending request not found")
    try:
        esvc.create_notification(
            db,
            user_id=user.id,
            subject="Data access request cancelled",
            body=f"Your request #{request_id} was cancelled.",
            severity="info",
        )
    except Exception:
        pass
    return {"cancelled": True}

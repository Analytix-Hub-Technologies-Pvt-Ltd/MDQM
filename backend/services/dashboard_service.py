from sqlalchemy import func
from sqlalchemy.orm import Session

import models


def _base_kpis(db: Session):
    total_users = db.query(func.count(models.User.id)).scalar() or 0
    total_jobs = db.query(func.count(models.Job.job_id)).scalar() or 0
    failed_jobs = db.query(func.count(models.Job.job_id)).filter(models.Job.status.ilike("%fail%")).scalar() or 0
    active_rules = db.query(func.count(models.Rule.rule_id)).filter(models.Rule.is_active.is_(True)).scalar() or 0
    return total_users, total_jobs, failed_jobs, active_rules


def dashboard_payload(role_slug: str, db: Session) -> dict:
    total_users, total_jobs, failed_jobs, active_rules = _base_kpis(db)
    role_title = role_slug.upper()
    return {
        "role": role_title,
        "kpis": [
            {"title": "Total Users", "value": total_users, "subtitle": "Enterprise accounts", "tone": "default"},
            {"title": "Active Jobs", "value": total_jobs, "subtitle": "Data quality pipelines", "tone": "success"},
            {"title": "Failed Jobs", "value": failed_jobs, "subtitle": "Requires intervention", "tone": "danger"},
            {"title": "Active Rules", "value": active_rules, "subtitle": "Validation controls", "tone": "warning"},
        ],
        "trends": [
            {"label": "W1", "value": 78},
            {"label": "W2", "value": 81},
            {"label": "W3", "value": 84},
            {"label": "W4", "value": 88},
        ],
        "pipelines": [
            {"name": "Validation Engine", "status": "running"},
            {"name": "Stewardship Queue", "status": "running"},
            {"name": "Compliance Scan", "status": "queued"},
        ],
        "system_health": "Healthy" if failed_jobs == 0 else "Attention",
        "governance_score": max(0, min(100, 82 + (active_rules // 10))),
        "data_quality": {
            "completeness": 91,
            "accuracy": 88,
            "consistency": 86,
            "uniqueness": 84,
            "validity": 90,
            "timeliness": 87,
        },
        "audit_events": [
            {"action": f"{role_title} dashboard accessed", "created_at": "recent"},
            {"action": "Policy review completed", "created_at": "today"},
        ],
    }

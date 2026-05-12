from sqlalchemy import func
from sqlalchemy.orm import Session

import models


def _base_kpis(db: Session):
    total_users = db.query(func.count(models.User.id)).scalar() or 0
    total_jobs = db.query(func.count(models.Job.job_id)).scalar() or 0
    failed_jobs = db.query(func.count(models.Job.job_id)).filter(models.Job.status.ilike("%fail%")).scalar() or 0
    active_rules = db.query(func.count(models.Rule.rule_id)).filter(models.Rule.is_active.is_(True)).scalar() or 0
    return total_users, total_jobs, failed_jobs, active_rules


def _dynamic_trends(db: Session) -> list[dict]:
    """
    Build trend points from recent run stats.
    Uses latest 4 TableStats rows and computes quality percentage per run.
    """
    recent_stats = (
        db.query(models.TableStats)
        .filter(models.TableStats.total_rows.isnot(None))
        .order_by(models.TableStats.stat_id.desc())
        .limit(4)
        .all()
    )

    if not recent_stats:
        return [{"label": "N/A", "value": 0}]

    points = []
    # Reverse so chart shows oldest -> newest left to right.
    for idx, row in enumerate(reversed(recent_stats), start=1):
        total_rows = int(row.total_rows or 0)
        good_rows = int(row.good_rows or 0)
        quality_pct = round((good_rows / total_rows) * 100, 2) if total_rows > 0 else 0
        points.append({"label": f"W{idx}", "value": quality_pct})
    return points


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
        "trends": _dynamic_trends(db),
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

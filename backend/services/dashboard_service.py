from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

import models


def _pct_bounded(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    n = min(max(numerator, 0.0), float(denominator))
    return round(100.0 * n / float(denominator), 2)


def _timeliness_score(end_time) -> float:
    """Higher when the latest stats run is recent (recency of pipeline execution)."""
    if end_time is None:
        return 75.0
    try:
        et = end_time
        if getattr(et, "tzinfo", None):
            et = et.replace(tzinfo=None)
        delta_sec = (datetime.utcnow() - et).total_seconds()
    except Exception:
        return 75.0
    if delta_sec < 0:
        return 100.0
    days = delta_sec / 86400.0
    if days <= 1.0:
        return 100.0
    if days <= 14.0:
        return round(max(55.0, 100.0 - (days - 1.0) * 3.0), 2)
    return round(max(40.0, 73.0 - (days - 14.0) * 0.5), 2)


def _data_quality_from_table_stats(db: Session) -> dict[str, float]:
    """
    Aggregate latest metadata.table_stats per table (weighted by row volume).
    Formulas align with legacy /dashboard/data-quality-metrics heuristics.
    """
    tables = db.query(models.TableMetadata).all()
    if tables:
        pairs = [(t.job_id, t.table_id) for t in tables]
    else:
        rows = db.query(models.TableStats.job_id, models.TableStats.table_id).distinct().all()
        pairs = list({(int(r[0]), int(r[1])) for r in rows if r[0] is not None and r[1] is not None})

    acc = {k: 0.0 for k in ("completeness", "accuracy", "consistency", "uniqueness", "validity", "timeliness")}
    total_w = 0.0

    for job_id, table_id in pairs:
        st = (
            db.query(models.TableStats)
            .filter(models.TableStats.job_id == job_id, models.TableStats.table_id == table_id)
            .order_by(models.TableStats.stat_id.desc())
            .first()
        )
        if not st:
            continue
        tot = int(st.total_rows or 0)
        if tot <= 0:
            continue
        good = int(st.good_rows or 0)
        v_err = int(st.validation_errors or 0)
        f_err = int(st.fuzzy_errors or 0)
        w = float(tot)
        total_w += w
        completeness = _pct_bounded(good, tot)
        accuracy = _pct_bounded(tot - min(f_err, tot), tot)
        consistency = _pct_bounded(tot - min(v_err, tot), tot)
        validity = consistency
        uniqueness = accuracy
        timeliness = _timeliness_score(st.end_time)
        acc["completeness"] += completeness * w
        acc["accuracy"] += accuracy * w
        acc["consistency"] += consistency * w
        acc["uniqueness"] += uniqueness * w
        acc["validity"] += validity * w
        acc["timeliness"] += timeliness * w

    if total_w <= 0:
        return {k: 0.0 for k in acc}
    return {k: round(v / total_w, 2) for k, v in acc.items()}


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
        "data_quality": _data_quality_from_table_stats(db),
        "audit_events": [
            {"action": f"{role_title} dashboard accessed", "created_at": "recent"},
            {"action": "Policy review completed", "created_at": "today"},
        ],
    }

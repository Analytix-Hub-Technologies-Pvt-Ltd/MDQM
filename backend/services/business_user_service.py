"""Business user workspace: catalog quality enrichment, overview, reports, alert watches."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

import models
from services.enterprise_service import paginated_response, _page_bounds


def _pct(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return round((min(max(numerator, 0.0), float(denominator)) / float(denominator)) * 100.0, 2)


def _timeliness_score(end_time) -> float:
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


def _latest_stat_for_job(db: Session, job_id: int | None) -> models.TableStats | None:
    if not job_id:
        return None
    return (
        db.query(models.TableStats)
        .filter(models.TableStats.job_id == job_id)
        .order_by(models.TableStats.stat_id.desc())
        .first()
    )


def _resolve_job_id(db: Session, dataset: models.EnterpriseDataset) -> int | None:
    if dataset.job_id:
        return dataset.job_id
    name = (dataset.name or "").strip().lower()
    if not name:
        return None
    job = db.query(models.Job).filter(func.lower(models.Job.job_name) == name).first()
    if job:
        return job.job_id
    job = db.query(models.Job).filter(models.Job.job_name.ilike(f"%{dataset.name}%")).first()
    if job:
        return job.job_id
    tbl = (
        db.query(models.TableMetadata)
        .filter(func.lower(models.TableMetadata.table_name) == name)
        .first()
    )
    if tbl:
        return tbl.job_id
    return None


def _metrics_from_stat(st: models.TableStats | None) -> dict[str, Any]:
    if not st:
        return {
            "completeness": 0.0,
            "accuracy": 0.0,
            "consistency": 0.0,
            "validity": 0.0,
            "uniqueness": 0.0,
            "timeliness": 0.0,
            "issues": 0,
            "last_run": None,
            "overall_score": 0,
        }
    total = int(st.total_rows or 0)
    good = int(st.good_rows or 0)
    v_err = int(st.validation_errors or 0)
    f_err = int(st.fuzzy_errors or 0)
    completeness = _pct(good, total)
    accuracy = _pct(total - min(f_err, total), total)
    consistency = _pct(total - min(v_err, total), total)
    validity = consistency
    uniqueness = accuracy
    timeliness = _timeliness_score(st.end_time)
    overall = round((completeness + accuracy + consistency + validity + uniqueness + timeliness) / 6.0, 1)
    issues = v_err + f_err
    last_run = st.end_time.isoformat() if st.end_time else None
    return {
        "completeness": completeness,
        "validity": validity,
        "uniqueness": uniqueness,
        "timeliness": timeliness,
        "consistency": consistency,
        "accuracy": accuracy,
        "issues": issues,
        "last_run": last_run,
        "overall_score": int(round(overall)),
    }


def default_alert_threshold(tier: str | None) -> int:
    t = (tier or "").strip().lower()
    if t == "gold":
        return 85
    if t == "silver":
        return 75
    return 75


def _certification_label(score: int) -> str:
    if score >= 90:
        return "Certified"
    if score >= 80:
        return "Trusted"
    if score >= 70:
        return "Caution"
    return "Low Quality"


def _owner_display(db: Session, owner_user_id: int | None) -> str | None:
    if not owner_user_id:
        return None
    u = db.query(models.User).filter(models.User.id == owner_user_id).first()
    if not u:
        return None
    return (u.full_name or u.username or u.email or "").strip() or None


def _has_approved_access(db: Session, email: str, dataset_name: str) -> bool:
    em = (email or "").strip().lower()
    name = (dataset_name or "").strip()
    if not em or not name:
        return False
    row = (
        db.query(models.AccessRequest)
        .filter(
            func.lower(models.AccessRequest.email) == em,
            models.AccessRequest.dataset_name == name,
            func.lower(models.AccessRequest.status) == "approved",
        )
        .first()
    )
    return row is not None


def enrich_dataset(db: Session, row: models.EnterpriseDataset, *, user_email: str | None = None) -> dict[str, Any]:
    job_id = _resolve_job_id(db, row)
    st = _latest_stat_for_job(db, job_id)
    metrics = _metrics_from_stat(st)
    manual_score = row.quality_score is not None
    score = int(row.quality_score) if manual_score else metrics["overall_score"]
    has_stats = st is not None
    dq_job_linked = bool(job_id)
    if row.quality_score is None and score > 0:
        metrics["overall_score"] = score
    records = row.record_count_label
    if not records and st and st.total_rows:
        n = int(st.total_rows)
        if n >= 1_000_000:
            records = f"{n / 1_000_000:.1f}M"
        elif n >= 1_000:
            records = f"{n / 1_000:.1f}K"
        else:
            records = str(n)
    return {
        "id": row.id,
        "name": row.name,
        "domain": row.domain,
        "classification": row.classification,
        "description": row.description,
        "tier": row.tier or "Silver",
        "pii": bool(row.pii),
        "owner": _owner_display(db, row.owner_user_id) or "—",
        "steward": row.steward_name or "—",
        "record_count": records or "—",
        "job_id": job_id,
        "dq_job_linked": dq_job_linked,
        "has_dq_stats": has_stats,
        "score_source": "manual" if manual_score else ("job_stats" if has_stats else "none"),
        "access_granted": _has_approved_access(db, user_email or "", row.name) if user_email else False,
        "score": score,
        "certification": _certification_label(score) if (dq_job_linked or manual_score) else "Not assessed",
        "consistency": metrics["consistency"],
        "accuracy": metrics["accuracy"],
        "completeness": metrics["completeness"],
        "validity": metrics["validity"],
        "uniqueness": metrics["uniqueness"],
        "timeliness": metrics["timeliness"],
        "issues": metrics["issues"],
        "last_run": metrics["last_run"],
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def build_business_catalog_dataset_detail(
    db: Session, dataset_id: int, *, user_email: str | None = None
) -> dict[str, Any] | None:
    """
    Catalog dataset detail for business users: columns/samples plus validation rules and last DQ run stats.
    """
    row = db.query(models.EnterpriseDataset).filter(models.EnterpriseDataset.id == dataset_id).first()
    if not row:
        return None

    from services import enterprise_service as esvc

    preview = esvc.build_dataset_inventory_preview(db, dataset_id)
    if not preview:
        return None

    catalog = enrich_dataset(db, row, user_email=user_email)
    preview["catalog"] = catalog

    job_id = (preview.get("linked_job") or {}).get("job_id")
    if not job_id:
        preview["dq"] = {
            "rules_total": 0,
            "has_run": False,
            "message": "No data quality job is linked to this dataset yet.",
        }
        return preview

    rules_total = 0
    has_run = False
    for t in preview.get("tables") or []:
        tid = int(t["table_id"])
        tname = str(t.get("table_name") or "")
        rule_rows = (
            db.query(models.Rule)
            .filter(models.Rule.job_id == job_id, models.Rule.table_id == tid)
            .order_by(models.Rule.column_name.asc(), models.Rule.rule_id.asc())
            .all()
        )
        t["rules"] = [
            {
                "rule_id": r.rule_id,
                "column_name": r.column_name,
                "rule_type": r.rule_type,
                "rule_value": r.rule_value,
                "data_type": r.data_type,
                "is_active": bool(r.is_active),
            }
            for r in rule_rows
        ]
        rules_total += len(t["rules"])

        st = (
            db.query(models.TableStats)
            .filter(models.TableStats.job_id == job_id, models.TableStats.table_id == tid)
            .order_by(models.TableStats.stat_id.desc())
            .first()
        )
        if st:
            has_run = True
            total = int(st.total_rows or 0)
            good = int(st.good_rows or 0)
            v_err = int(st.validation_errors or 0)
            f_err = int(st.fuzzy_errors or 0)
            t["dq_run"] = {
                "total_rows": total,
                "good_rows": good,
                "validation_errors": v_err,
                "fuzzy_errors": f_err,
                "pass_rate": round((good / total) * 100.0, 1) if total > 0 else 0.0,
                "start_time": st.start_time.isoformat() if st.start_time else None,
                "end_time": st.end_time.isoformat() if st.end_time else None,
            }
        else:
            t["dq_run"] = None

        if tname:
            v_cnt = (
                db.query(func.count(models.QuarantineLog.log_id))
                .filter(
                    models.QuarantineLog.job_id == job_id,
                    models.QuarantineLog.table_name == tname,
                    models.QuarantineLog.error_type == "Validation",
                )
                .scalar()
            ) or 0
            f_cnt = (
                db.query(func.count(models.QuarantineLog.log_id))
                .filter(
                    models.QuarantineLog.job_id == job_id,
                    models.QuarantineLog.table_name == tname,
                    models.QuarantineLog.error_type == "Fuzzy",
                )
                .scalar()
            ) or 0
            t["quarantine_validation"] = int(v_cnt)
            t["quarantine_fuzzy"] = int(f_cnt)
        else:
            t["quarantine_validation"] = 0
            t["quarantine_fuzzy"] = 0

    preview["dq"] = {
        "rules_total": rules_total,
        "has_run": has_run,
        "message": None
        if has_run
        else "No DQ run recorded yet. Rules are configured; ask a steward to run the job in Jobs.",
    }
    return preview


def list_catalog(db: Session, page: int, page_size: int, q: str | None = None, user_email: str | None = None):
    offset, page_size = _page_bounds(page, page_size)
    query = db.query(models.EnterpriseDataset).order_by(models.EnterpriseDataset.name.asc())
    if q and str(q).strip():
        term = f"%{str(q).strip()}%"
        query = query.filter(
            (models.EnterpriseDataset.name.ilike(term)) | (models.EnterpriseDataset.domain.ilike(term))
        )
    total = query.count()
    rows = query.offset(offset).limit(page_size).all()
    items = [enrich_dataset(db, r, user_email=user_email) for r in rows]
    return paginated_response(items, total, page, page_size)


def list_quality_scores(db: Session, page: int, page_size: int, q: str | None = None, user_email: str | None = None):
    data = list_catalog(db, page, page_size, q, user_email=user_email)
    scores = [i.get("score", 0) for i in data["items"] if i.get("score")]
    certified = sum(1 for s in scores if s >= 90)
    caution = sum(1 for s in scores if s < 80)
    avg = round(sum(scores) / len(scores), 1) if scores else 0.0
    total_issues = sum(int(i.get("issues") or 0) for i in data["items"])
    data["summary"] = {
        "avg_score": avg,
        "certified_count": certified,
        "caution_count": caution,
        "total_issues": total_issues,
    }
    return data


def business_overview(db: Session, user: models.User) -> dict[str, Any]:
    email = (user.email or "").strip().lower()
    all_ds = db.query(models.EnterpriseDataset).all()
    enriched = [enrich_dataset(db, d, user_email=email) for d in all_ds]
    certified = sum(1 for d in enriched if (d.get("score") or 0) >= 80)

    req_counts = (
        db.query(models.AccessRequest.status, func.count())
        .filter(models.AccessRequest.email == email)
        .group_by(models.AccessRequest.status)
        .all()
    )
    rc = {str(s or "").lower(): int(n) for s, n in req_counts}
    pending_req = rc.get("pending", 0)
    total_req = sum(rc.values())

    report_count = (
        db.query(func.count(models.EnterpriseBusinessReport.id))
        .filter(or_(models.EnterpriseBusinessReport.user_id.is_(None), models.EnterpriseBusinessReport.user_id == user.id))
        .scalar()
        or 0
    )

    unread = (
        db.query(func.count(models.EnterpriseNotification.id))
        .filter(models.EnterpriseNotification.user_id == user.id, models.EnterpriseNotification.read_at.is_(None))
        .scalar()
        or 0
    )
    watch_count = (
        db.query(func.count(models.EnterpriseAlertSubscription.id))
        .filter(models.EnterpriseAlertSubscription.user_id == user.id)
        .scalar()
        or 0
    )

    top_datasets = sorted(enriched, key=lambda x: x.get("score") or 0, reverse=True)[:6]
    glossary_rows = (
        db.query(models.EnterpriseGlossaryTerm)
        .filter(func.lower(models.EnterpriseGlossaryTerm.status) == "approved")
        .order_by(models.EnterpriseGlossaryTerm.created_at.desc())
        .limit(5)
        .all()
    )
    glossary = [
        {
            "id": g.id,
            "term": g.term,
            "domain": g.domain,
            "definition": (g.definition or "")[:200],
            "status": g.status,
        }
        for g in glossary_rows
    ]

    return {
        "stats": {
            "certified_datasets": certified,
            "total_datasets": len(enriched),
            "my_requests_total": total_req,
            "my_requests_pending": pending_req,
            "my_reports": report_count,
            "watched_alerts": watch_count,
            "unread_notifications": unread,
        },
        "top_datasets": top_datasets,
        "glossary_highlights": glossary,
    }


def list_glossary_business(db: Session, page: int, page_size: int, q: str | None, approved_only: bool = True):
    offset, page_size = _page_bounds(page, page_size)
    query = db.query(models.EnterpriseGlossaryTerm).order_by(models.EnterpriseGlossaryTerm.term.asc())
    if approved_only:
        query = query.filter(func.lower(models.EnterpriseGlossaryTerm.status) == "approved")
    if q and str(q).strip():
        term = f"%{str(q).strip()}%"
        query = query.filter(
            (models.EnterpriseGlossaryTerm.term.ilike(term)) | (models.EnterpriseGlossaryTerm.domain.ilike(term))
        )
    total = query.count()
    rows = query.offset(offset).limit(page_size).all()
    items = []
    for r in rows:
        tags = r.tags if isinstance(r.tags, list) else []
        related = r.related_terms if isinstance(r.related_terms, list) else []
        items.append(
            {
                "id": r.id,
                "term": r.term,
                "definition": r.definition,
                "domain": r.domain,
                "status": r.status,
                "tags": tags,
                "related_terms": related,
                "owner": _owner_display(db, r.owner_user_id) or "—",
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return paginated_response(items, total, page, page_size)


def list_business_reports(db: Session, user_id: int, page: int, page_size: int):
    """Business user read-only catalog — no auto-seed; owner publishes via governance API."""
    offset, page_size = _page_bounds(page, page_size)
    q = (
        db.query(models.EnterpriseBusinessReport)
        .filter(or_(models.EnterpriseBusinessReport.user_id.is_(None), models.EnterpriseBusinessReport.user_id == user_id))
        .order_by(models.EnterpriseBusinessReport.id.asc())
    )
    total = q.count()
    rows = q.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "title": r.title,
            "report_type": r.report_type,
            "dataset_name": r.dataset_name,
            "status": r.status,
            "quality_score": r.quality_score,
            "last_refreshed": r.last_refreshed_label,
            "external_url": r.external_url,
        }
        for r in rows
    ]
    certified = sum(1 for i in items if str(i.get("status")).lower() == "certified")
    stale = len(items) - certified
    return {
        **paginated_response(items, total, page, page_size),
        "summary": {"total": total, "certified": certified, "stale": stale},
    }


def list_business_reports_manage(db: Session, page: int, page_size: int, q: str | None = None):
    """All published reports (data owner / admin)."""
    offset, page_size = _page_bounds(page, page_size)
    query = db.query(models.EnterpriseBusinessReport).order_by(models.EnterpriseBusinessReport.id.desc())
    if q and str(q).strip():
        term = f"%{str(q).strip()}%"
        query = query.filter(
            (models.EnterpriseBusinessReport.title.ilike(term))
            | (models.EnterpriseBusinessReport.dataset_name.ilike(term))
        )
    total = query.count()
    rows = query.offset(offset).limit(page_size).all()
    items = [
        {
            "id": r.id,
            "title": r.title,
            "report_type": r.report_type,
            "dataset_name": r.dataset_name,
            "status": r.status,
            "quality_score": r.quality_score,
            "last_refreshed": r.last_refreshed_label,
            "external_url": r.external_url,
            "user_id": r.user_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return paginated_response(items, total, page, page_size)


def create_business_report(
    db: Session,
    *,
    title: str,
    report_type: str,
    dataset_name: str | None,
    status: str,
    quality_score: int | None,
    last_refreshed_label: str | None,
    external_url: str | None,
    user_id: int | None,
) -> models.EnterpriseBusinessReport:
    row = models.EnterpriseBusinessReport(
        title=title.strip(),
        report_type=report_type.strip(),
        dataset_name=(dataset_name or "").strip() or None,
        status=(status or "Certified").strip(),
        quality_score=quality_score,
        last_refreshed_label=(last_refreshed_label or "").strip() or None,
        external_url=(external_url or "").strip() or None,
        user_id=user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_business_report(db: Session, report_id: int) -> bool:
    row = db.query(models.EnterpriseBusinessReport).filter(models.EnterpriseBusinessReport.id == report_id).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def list_alert_subscriptions(db: Session, user_id: int):
    rows = (
        db.query(models.EnterpriseAlertSubscription)
        .filter(models.EnterpriseAlertSubscription.user_id == user_id)
        .order_by(models.EnterpriseAlertSubscription.dataset_name.asc())
        .all()
    )
    all_ds = {
        d.name: enrich_dataset(db, d)
        for d in db.query(models.EnterpriseDataset).all()
    }
    items = []
    triggered = warnings = ok = 0
    for sub in rows:
        ds = all_ds.get(sub.dataset_name) or {"score": 0, "domain": "—"}
        score = int(ds.get("score") or 0)
        threshold = int(sub.threshold or 85)
        if score < 70:
            state = "Triggered"
            triggered += 1
        elif score < threshold:
            state = "Warning"
            warnings += 1
        else:
            state = "OK"
            ok += 1
        items.append(
            {
                "id": sub.id,
                "dataset_name": sub.dataset_name,
                "domain": ds.get("domain"),
                "threshold": threshold,
                "current_score": score,
                "state": state,
                "created_at": sub.created_at.isoformat() if sub.created_at else None,
            }
        )
    return {
        "items": items,
        "summary": {"active": len(items), "triggered": triggered, "warnings": warnings, "ok": ok},
    }


def update_alert_subscription(db: Session, user_id: int, sub_id: int, *, threshold: int) -> models.EnterpriseAlertSubscription | None:
    row = (
        db.query(models.EnterpriseAlertSubscription)
        .filter(models.EnterpriseAlertSubscription.id == sub_id, models.EnterpriseAlertSubscription.user_id == user_id)
        .first()
    )
    if not row:
        return None
    row.threshold = int(threshold)
    db.commit()
    db.refresh(row)
    return row


def create_alert_subscription(db: Session, user_id: int, dataset_name: str, threshold: int | None = None):
    name = dataset_name.strip()
    ds_row = db.query(models.EnterpriseDataset).filter(models.EnterpriseDataset.name == name).first()
    if threshold is None:
        threshold = default_alert_threshold(ds_row.tier if ds_row else None)
    existing = (
        db.query(models.EnterpriseAlertSubscription)
        .filter(
            models.EnterpriseAlertSubscription.user_id == user_id,
            models.EnterpriseAlertSubscription.dataset_name == name,
        )
        .first()
    )
    if existing:
        return existing
    row = models.EnterpriseAlertSubscription(user_id=user_id, dataset_name=name, threshold=int(threshold))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_alert_subscription(db: Session, user_id: int, sub_id: int) -> bool:
    row = (
        db.query(models.EnterpriseAlertSubscription)
        .filter(models.EnterpriseAlertSubscription.id == sub_id, models.EnterpriseAlertSubscription.user_id == user_id)
        .first()
    )
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def cancel_data_request(db: Session, email: str, request_id: int) -> bool:
    em = (email or "").strip().lower()
    row = db.query(models.AccessRequest).filter(models.AccessRequest.id == request_id, models.AccessRequest.email == em).first()
    if not row or str(row.status or "").lower() != "pending":
        return False
    row.status = "cancelled"
    db.commit()
    return True

"""APScheduler registration and DB persistence for dataset refresh schedules."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Callable

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

import models

REFRESH_SCHEDULE_NAME_PREFIX = "refresh:"


def refresh_schedule_storage_name(job_id: int) -> str:
    return f"{REFRESH_SCHEDULE_NAME_PREFIX}{job_id}"


def get_persisted_refresh_schedule_id(db: Session, job_id: int) -> int | None:
    name = refresh_schedule_storage_name(job_id)
    row = (
        db.query(models.EnterpriseSchedule)
        .filter(
            models.EnterpriseSchedule.job_id == job_id,
            models.EnterpriseSchedule.name == name,
        )
        .first()
    )
    return row.id if row else None


def parse_once_run_datetime(data: dict[str, Any]) -> datetime:
    date_value = str(data.get("date", "")).strip()
    time_value = str(data.get("time", "")).strip()
    if not date_value:
        raise ValueError("date is required for once schedule")
    run_date = date_value
    if date_value and time_value and "T" not in date_value:
        run_date = f"{date_value}T{time_value}:00"
    elif "T" not in date_value:
        run_date = f"{date_value}T00:00:00"
    try:
        return datetime.fromisoformat(run_date)
    except ValueError as exc:
        raise ValueError(f"Invalid date/time: {run_date}") from exc


def validate_once_in_future(data: dict[str, Any]) -> None:
    """Raise ValueError when a one-time schedule is not strictly in the future."""
    if str(data.get("type", "")).strip().lower() != "once":
        return
    run_dt = parse_once_run_datetime(data)
    now = datetime.now(run_dt.tzinfo) if run_dt.tzinfo else datetime.now()
    if run_dt <= now:
        raise ValueError(
            "Scheduled time must be in the future. Pick a later date or time."
        )


def upsert_persisted_refresh_schedule(
    db: Session,
    job_id: int,
    payload: dict[str, Any],
    user_id: int | None = None,
) -> models.EnterpriseSchedule:
    name = refresh_schedule_storage_name(job_id)
    config_json = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    if len(config_json) > 128:
        raise ValueError("Schedule configuration is too large to persist.")

    schedule_type = str(payload.get("type", "daily")).strip().lower()
    interval = None
    if schedule_type == "hourly":
        interval = max(int(payload.get("interval", 1)), 1)

    row = (
        db.query(models.EnterpriseSchedule)
        .filter(
            models.EnterpriseSchedule.job_id == job_id,
            models.EnterpriseSchedule.name == name,
        )
        .first()
    )
    if row:
        row.schedule_type = schedule_type
        row.cron_expression = config_json
        row.interval_minutes = interval
        row.is_active = True
        row.updated_at = datetime.utcnow()
    else:
        row = models.EnterpriseSchedule(
            job_id=job_id,
            name=name,
            schedule_type=schedule_type,
            cron_expression=config_json,
            interval_minutes=interval,
            is_active=True,
            created_by_user_id=user_id,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def set_persisted_refresh_active(db: Session, job_id: int, active: bool) -> None:
    name = refresh_schedule_storage_name(job_id)
    row = (
        db.query(models.EnterpriseSchedule)
        .filter(
            models.EnterpriseSchedule.job_id == job_id,
            models.EnterpriseSchedule.name == name,
        )
        .first()
    )
    if not row:
        return
    row.is_active = active
    row.updated_at = datetime.utcnow()
    db.commit()


def delete_persisted_refresh_schedule(db: Session, job_id: int) -> None:
    name = refresh_schedule_storage_name(job_id)
    (
        db.query(models.EnterpriseSchedule)
        .filter(
            models.EnterpriseSchedule.job_id == job_id,
            models.EnterpriseSchedule.name == name,
        )
        .delete(synchronize_session=False)
    )
    db.commit()


def deactivate_persisted_refresh_if_once(db: Session, job_id: int) -> None:
    name = refresh_schedule_storage_name(job_id)
    row = (
        db.query(models.EnterpriseSchedule)
        .filter(
            models.EnterpriseSchedule.job_id == job_id,
            models.EnterpriseSchedule.name == name,
        )
        .first()
    )
    if not row or row.schedule_type != "once":
        return
    row.is_active = False
    row.updated_at = datetime.utcnow()
    db.commit()


def list_active_persisted_refresh_schedules(db: Session) -> list[models.EnterpriseSchedule]:
    prefix = REFRESH_SCHEDULE_NAME_PREFIX
    return (
        db.query(models.EnterpriseSchedule)
        .filter(
            models.EnterpriseSchedule.is_active.is_(True),
            models.EnterpriseSchedule.name.like(f"{prefix}%"),
        )
        .all()
    )


def load_persisted_payload(row: models.EnterpriseSchedule) -> dict[str, Any]:
    raw = row.cron_expression or "{}"
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def apply_apscheduler_schedule(
    scheduler,
    job_id: int,
    data: dict[str, Any],
    run_fn: Callable[[int], None],
    job_key: str,
) -> None:
    """Register a schedule with APScheduler (raises ValueError on invalid input)."""
    schedule_type = str(data.get("type", "")).strip().lower()
    if not schedule_type:
        raise ValueError("type is required")

    try:
        scheduler.remove_job(job_key)
    except Exception:
        pass

    if schedule_type == "daily":
        hour, minute = map(int, str(data.get("time", "02:00")).split(":"))
        scheduler.add_job(
            run_fn,
            "cron",
            id=job_key,
            replace_existing=True,
            hour=hour,
            minute=minute,
            args=[job_id],
        )
    elif schedule_type == "weekly":
        hour, minute = map(int, str(data.get("time", "02:00")).split(":"))
        scheduler.add_job(
            run_fn,
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
            run_fn,
            "interval",
            id=job_key,
            replace_existing=True,
            hours=interval,
            args=[job_id],
        )
    elif schedule_type == "once":
        validate_once_in_future(data)
        run_date = parse_once_run_datetime(data).isoformat(timespec="seconds")
        scheduler.add_job(
            run_fn,
            "date",
            id=job_key,
            replace_existing=True,
            run_date=run_date,
            args=[job_id],
        )
    elif schedule_type == "monthly":
        day_of_month = int(data.get("date", 1))
        hour, minute = map(int, str(data.get("time", "02:00")).split(":"))
        scheduler.add_job(
            run_fn,
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
            raise ValueError("cron is required for cron schedule")
        scheduler.add_job(
            run_fn,
            trigger=CronTrigger.from_crontab(expr),
            id=job_key,
            replace_existing=True,
            args=[job_id],
        )
    else:
        raise ValueError("Unsupported schedule type")

    if schedule_type == "once":
        job = scheduler.get_job(job_key)
        if not job or not getattr(job, "next_run_time", None):
            try:
                scheduler.remove_job(job_key)
            except Exception:
                pass
            raise ValueError(
                "Scheduled time must be in the future. Pick a later date or time."
            )

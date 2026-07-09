"""Bulk rule configuration and table-level DQ run status (Y/N)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

import models


def mark_table_dq_pending(db: Session, job_id: int, table_id: int, *, commit: bool = True) -> None:
    table = (
        db.query(models.TableMetadata)
        .filter(models.TableMetadata.job_id == job_id, models.TableMetadata.table_id == table_id)
        .first()
    )
    if table:
        table.dq_run_status = "N"
        if commit:
            db.commit()


def mark_job_tables_dq_applied(db: Session, job_id: int, *, commit: bool = True) -> None:
    tables = db.query(models.TableMetadata).filter(models.TableMetadata.job_id == job_id).all()
    for table in tables:
        table.dq_run_status = "Y"
    if commit:
        db.commit()


def mark_job_tables_dq_pending(db: Session, job_id: int, *, commit: bool = True) -> None:
    tables = db.query(models.TableMetadata).filter(models.TableMetadata.job_id == job_id).all()
    for table in tables:
        table.dq_run_status = "N"
    if commit:
        db.commit()


def serialize_rule(rule: models.Rule) -> dict[str, Any]:
    return {
        "rule_id": rule.rule_id,
        "job_id": rule.job_id,
        "table_id": rule.table_id,
        "column_name": rule.column_name,
        "data_type": rule.data_type,
        "rule_type": rule.rule_type,
        "rule_value": rule.rule_value,
        "is_active": bool(rule.is_active),
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
    }


def bulk_save_table_rules(
    db: Session,
    job_id: int,
    table_id: int,
    items: list[dict[str, Any]],
) -> list[models.Rule]:
    table = (
        db.query(models.TableMetadata)
        .filter(models.TableMetadata.job_id == job_id, models.TableMetadata.table_id == table_id)
        .first()
    )
    if not table:
        raise ValueError("Table not found")

    db.query(models.Rule).filter(
        models.Rule.job_id == job_id,
        models.Rule.table_id == table_id,
    ).delete(synchronize_session=False)
    db.query(models.MasterTable).filter(
        models.MasterTable.job_id == job_id,
        models.MasterTable.table_id == table_id,
    ).delete(synchronize_session=False)

    created_pairs: list[tuple[models.Rule, dict[str, Any]]] = []
    for item in items:
        column_name = str(item.get("column_name") or "").strip()
        rule_type = str(item.get("rule_type") or "").strip()
        if not column_name or not rule_type:
            continue
        rule = models.Rule(
            job_id=job_id,
            table_id=table_id,
            column_name=column_name,
            rule_type=rule_type,
            data_type=str(item.get("data_type") or "String"),
            rule_value=item.get("rule_value"),
            is_active=bool(item.get("is_active", True)),
        )
        db.add(rule)
        created_pairs.append((rule, item))

    db.flush()

    for rule, item in created_pairs:
        if rule.rule_type != "fuzzy_match":
            continue
        master_data = item.get("master_data") or []
        if not isinstance(master_data, list):
            continue
        for val in master_data:
            text_val = str(val or "").strip()
            if not text_val:
                continue
            db.add(
                models.MasterTable(
                    job_id=job_id,
                    table_id=table_id,
                    table_name=table.table_name,
                    master_value=text_val,
                )
            )

    table.dq_run_status = "N"
    db.commit()
    created = [rule for rule, _ in created_pairs]
    for rule in created:
        db.refresh(rule)
    return created

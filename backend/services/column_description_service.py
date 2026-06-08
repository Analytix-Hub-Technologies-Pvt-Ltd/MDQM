"""Cached LLM column descriptions stored on metadata.column_metadata (1-day TTL)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    import models

logger = logging.getLogger(__name__)

DESCRIPTION_TTL = timedelta(days=1)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _is_fresh(generated_at: datetime | None, *, now: datetime | None = None) -> bool:
    if generated_at is None:
        return False
    now = now or _utc_now()
    ts = generated_at
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (now - ts) < DESCRIPTION_TTL


def _fallback_description(data_type: str | None) -> str:
    if data_type:
        return f"Field stored as {data_type} in the ingested snapshot."
    return "—"


def resolve_column_description(
    db: Session,
    *,
    job_id: int,
    table_id: int,
    column_name: str,
    data_type: str | None,
    glossary: dict[str, str],
    table_name: str | None = None,
    column_row: models.ColumnMetadata | None = None,
) -> str:
    """
    Return a business-friendly column description.
    Uses glossary first, then a DB cache (refreshed via LLM at most once per day).
    """
    key = (column_name or "").strip().lower()
    if key in glossary:
        return glossary[key]

    row = column_row
    if row is None:
        import models as m

        row = (
            db.query(m.ColumnMetadata)
            .filter(
                m.ColumnMetadata.job_id == job_id,
                m.ColumnMetadata.table_id == table_id,
                m.ColumnMetadata.column_name == column_name,
            )
            .first()
        )

    if row and row.description and _is_fresh(row.description_generated_at):
        return str(row.description).strip()

    stale = str(row.description).strip() if row and row.description else None

    try:
        from services.groq_description_service import generate_column_description

        generated = generate_column_description(column_name, data_type, table_name)
    except Exception as exc:
        logger.debug("LLM column description failed for %s: %s", column_name, exc)
        if stale:
            return stale
        return _fallback_description(data_type)

    import models as m

    if row is None:
        row = m.ColumnMetadata(
            job_id=job_id,
            table_id=table_id,
            column_name=column_name,
            data_type=data_type or "String",
        )
        db.add(row)
    elif data_type and not row.data_type:
        row.data_type = data_type

    row.description = generated
    row.description_generated_at = _utc_now()
    return generated


def flush_column_descriptions(db: Session) -> None:
    """Commit pending description updates (call once per preview/table batch)."""
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

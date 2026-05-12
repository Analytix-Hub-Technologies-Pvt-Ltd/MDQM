import json
from typing import Any

from sqlalchemy.orm import Session

import models


def write_audit_log(
    db: Session,
    user_id: int | None,
    action: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    ip_address: str | None = None,
    old_values: Any = None,
    new_values: Any = None,
):
    record = models.AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        ip_address=ip_address,
        old_values=json.dumps(old_values, ensure_ascii=True) if old_values is not None else None,
        new_values=json.dumps(new_values, ensure_ascii=True) if new_values is not None else None,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

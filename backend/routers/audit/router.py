from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

import models
from auth.deps import get_current_user
from database import get_db
from permissions.access_control import require_permission
from permissions.permissions import Permissions
from utils.audit import write_audit_log

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/logs")
def list_audit_logs(
    request: Request,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    require_permission(getattr(request.state, "user_role", user.role), Permissions.AUDIT_VIEW)
    rows = (
        db.query(models.AuditLog)
        .order_by(models.AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    user_ids = {r.user_id for r in rows if r.user_id}
    users_map = {}
    if user_ids:
        for u in db.query(models.User).filter(models.User.id.in_(user_ids)).all():
            users_map[u.id] = u
    out = []
    for row in rows:
        actor = users_map.get(row.user_id) if row.user_id else None
        out.append(
            {
                "id": row.id,
                "user_id": row.user_id,
                "actor_email": actor.email if actor else None,
                "actor_name": actor.full_name if actor else None,
                "action": row.action,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "ip_address": row.ip_address,
                "old_values": row.old_values,
                "new_values": row.new_values,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
        )
    return out


@router.post("/events")
def create_audit_event(payload: dict, request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_permission(getattr(request.state, "user_role", user.role), Permissions.AUDIT_VIEW)
    row = write_audit_log(
        db=db,
        user_id=user.id,
        action=payload.get("action", "custom.audit.event"),
        entity_type=payload.get("entity_type"),
        entity_id=str(payload.get("entity_id")) if payload.get("entity_id") is not None else None,
        ip_address=request.client.host if request.client else None,
        old_values=payload.get("old_values"),
        new_values=payload.get("new_values"),
    )
    return {"id": row.id, "status": "created"}

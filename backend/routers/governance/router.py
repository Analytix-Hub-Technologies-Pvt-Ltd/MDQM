from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

import models
from auth.deps import get_current_user
from database import get_db
from permissions.access_control import require_permission
from permissions.permissions import Permissions

router = APIRouter(prefix="/api/governance", tags=["governance"])


@router.get("/policies")
def list_policies(request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_permission(getattr(request.state, "user_role", user.role), Permissions.GOVERNANCE_VIEW)
    rows = db.query(models.GovernancePolicy).order_by(models.GovernancePolicy.created_at.desc()).all()
    return rows


@router.get("/kpis")
def governance_kpis(request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_permission(getattr(request.state, "user_role", user.role), Permissions.GOVERNANCE_VIEW)
    total = db.query(models.GovernancePolicy).count()
    active = db.query(models.GovernancePolicy).filter(models.GovernancePolicy.status == "active").count()
    return {"total_policies": total, "active_policies": active, "coverage_pct": 0 if total == 0 else round((active / total) * 100, 2)}

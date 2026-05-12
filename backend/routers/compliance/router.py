from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

import models
from auth.deps import get_current_user
from database import get_db
from permissions.access_control import require_permission
from permissions.permissions import Permissions

router = APIRouter(prefix="/api/compliance", tags=["compliance"])


@router.get("/summary")
def compliance_summary(request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_permission(getattr(request.state, "user_role", user.role), Permissions.COMPLIANCE_VIEW)
    total = db.query(models.GovernancePolicy).count()
    violations = db.query(models.GovernancePolicy).filter(models.GovernancePolicy.status == "violated").count()
    return {"total_controls": total, "violations": violations, "compliant": max(total - violations, 0)}

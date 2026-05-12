from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

import models
from auth.deps import get_current_user
from database import get_db
from permissions.access_control import require_permission
from permissions.permissions import Permissions

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/summary")
def report_summary(request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_permission(getattr(request.state, "user_role", user.role), Permissions.REPORTS_VIEW)
    return {
        "jobs": db.query(models.Job).count(),
        "rules": db.query(models.Rule).count(),
        "quarantine_records": db.query(models.QuarantineLog).count(),
    }

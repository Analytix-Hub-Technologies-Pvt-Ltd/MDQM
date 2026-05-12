from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

import models
from auth.deps import get_current_user
from database import get_db
from permissions.access_control import require_permission
from permissions.permissions import Permissions

router = APIRouter(prefix="/api/stewardship", tags=["stewardship"])


@router.get("/tasks")
def stewardship_tasks(request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_permission(getattr(request.state, "user_role", user.role), Permissions.STEWARDSHIP_VIEW)
    rows = db.query(models.StewardshipTask).order_by(models.StewardshipTask.created_at.desc()).all()
    return rows

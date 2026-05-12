from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

import models
from auth.deps import get_current_user
from database import get_db
from permissions.access_control import require_permission
from permissions.permissions import Permissions

router = APIRouter(prefix="/api/platform-admin", tags=["platform-admin"])


@router.get("/overview")
def admin_overview(request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_permission(getattr(request.state, "user_role", user.role), Permissions.ADMIN_VIEW)
    return {
        "users": db.query(models.User).count(),
        "roles": db.query(models.Role).count(),
        "permissions": db.query(models.Permission).count(),
        "dataset_access_rules": db.query(models.DatasetAccess).count(),
    }

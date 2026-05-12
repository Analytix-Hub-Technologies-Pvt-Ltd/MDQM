from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from auth.deps import get_current_user
from database import get_db
from permissions.access_control import require_permission
from permissions.permissions import Permissions
from services.dashboard_service import dashboard_payload

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _get_dashboard(request: Request, db: Session, permission: str, slug: str):
    role = getattr(request.state, "user_role", "VIEWER")
    require_permission(role, permission)
    return dashboard_payload(slug, db)


@router.get("/admin")
def admin_dashboard(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return _get_dashboard(request, db, Permissions.DASHBOARD_ADMIN, "admin")


@router.get("/cdo")
def cdo_dashboard(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return _get_dashboard(request, db, Permissions.DASHBOARD_CDO, "cdo")


@router.get("/steward")
def steward_dashboard(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return _get_dashboard(request, db, Permissions.DASHBOARD_STEWARD, "steward")


@router.get("/owner")
def owner_dashboard(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return _get_dashboard(request, db, Permissions.DASHBOARD_OWNER, "owner")


@router.get("/developer")
def developer_dashboard(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return _get_dashboard(request, db, Permissions.DASHBOARD_DEVELOPER, "developer")


@router.get("/auditor")
def auditor_dashboard(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return _get_dashboard(request, db, Permissions.DASHBOARD_AUDITOR, "auditor")


@router.get("/analyst")
def analyst_dashboard(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return _get_dashboard(request, db, Permissions.DASHBOARD_ANALYST, "analyst")


@router.get("/viewer")
def viewer_dashboard(request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return _get_dashboard(request, db, Permissions.DASHBOARD_VIEWER, "viewer")

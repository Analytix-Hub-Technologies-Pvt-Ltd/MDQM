from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

import models
from auth.deps import get_current_user
from database import get_db
from permissions.access_control import require_permission
from permissions.permissions import Permissions
from services.lineage_service import lineage_graph_payload

router = APIRouter(prefix="/api/lineage", tags=["lineage"])


@router.get("/graph")
def get_lineage_graph(request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_permission(getattr(request.state, "user_role", user.role), Permissions.LINEAGE_VIEW)
    return lineage_graph_payload(db, auto_seed=True)

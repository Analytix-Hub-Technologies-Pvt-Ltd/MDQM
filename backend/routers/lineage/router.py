from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

import models
from auth.deps import get_current_user
from database import get_db
from permissions.access_control import require_permission
from permissions.permissions import Permissions

router = APIRouter(prefix="/api/lineage", tags=["lineage"])


@router.get("/graph")
def get_lineage_graph(request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_permission(getattr(request.state, "user_role", user.role), Permissions.LINEAGE_VIEW)
    nodes = db.query(models.LineageNode).all()
    edges = db.query(models.LineageEdge).all()
    return {
        "nodes": [{"id": n.id, "key": n.node_key, "type": n.node_type, "domain": n.domain} for n in nodes],
        "edges": [{"id": e.id, "from": e.from_node_id, "to": e.to_node_id, "relation": e.relation_type} for e in edges],
    }

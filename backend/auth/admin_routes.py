from datetime import datetime, timedelta
import json
import os
from urllib import parse as urlparse
from urllib import request as urlrequest

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

import models
from auth.config import FRONTEND_BASE_URL, INVITE_EXPIRE_HOURS
from auth.deps import require_admin
from auth.email_invite import build_invite_payload
from auth.security import generate_invite_token, hash_invite_token, hash_password
from database import get_db

router = APIRouter(prefix="/admin", tags=["admin"])
VALID_ROLES = {"admin", "user", "viewer"}


class CreateUserBody(BaseModel):
    full_name: str
    email: EmailStr
    username: str | None = None
    role: str = "user"
    password: str | None = None


class ApproveBody(BaseModel):
    role: str = "user"


class RoleUpdateBody(BaseModel):
    role: str


def _send_graph_email(to_emails: list[str], subject: str, body_html: str) -> tuple[bool, str | None]:
    tenant_id = os.getenv("MS_GRAPH_TENANT_ID", "").strip()
    client_id = os.getenv("MS_GRAPH_CLIENT_ID", "").strip()
    client_secret = os.getenv("MS_GRAPH_CLIENT_SECRET", "").strip()
    sender_email = os.getenv("MS_GRAPH_SENDER_EMAIL", "").strip()
    if not tenant_id or not client_id or not client_secret or not sender_email:
        return (False, "Graph mail env vars are missing")

    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    token_body = urlparse.urlencode(
        {
            "client_id": client_id,
            "scope": "https://graph.microsoft.com/.default",
            "client_secret": client_secret,
            "grant_type": "client_credentials",
        }
    ).encode("utf-8")
    token_req = urlrequest.Request(
        token_url,
        data=token_body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urlrequest.urlopen(token_req, timeout=20) as resp:
            token_payload = json.loads(resp.read().decode("utf-8"))
            access_token = token_payload.get("access_token")
    except Exception as e:
        return (False, f"Graph token failed: {str(e)}")
    if not access_token:
        return (False, "Graph token missing access_token")

    graph_mail_url = f"https://graph.microsoft.com/v1.0/users/{sender_email}/sendMail"
    mail_payload = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": body_html},
            "toRecipients": [{"emailAddress": {"address": e}} for e in to_emails],
        },
        "saveToSentItems": "true",
    }
    mail_req = urlrequest.Request(
        graph_mail_url,
        data=json.dumps(mail_payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlrequest.urlopen(mail_req, timeout=30):
            pass
    except Exception as e:
        return (False, f"Graph sendMail failed: {str(e)}")
    return (True, None)


def _sanitize_username(value: str) -> str:
    allowed = "".join(ch for ch in value.lower() if ch.isalnum() or ch in "._")
    return allowed.strip("._")[:64] or "user"


def _build_unique_username(db: Session, seed: str) -> str:
    base = _sanitize_username(seed)
    candidate = base
    i = 1
    while db.query(models.User).filter(models.User.username == candidate).first():
        suffix = f".{i}"
        candidate = f"{base[: max(1, 64 - len(suffix))]}{suffix}"
        i += 1
    return candidate


@router.get("/users")
def list_users(_: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(models.User).order_by(models.User.id.asc()).all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "username": u.username,
            "email": u.email,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "created_by": u.created_by,
            "password_configured": u.password_configured,
        }
        for u in rows
    ]


@router.get("/access-requests")
def list_access_requests(_: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(models.AccessRequest).order_by(models.AccessRequest.requested_at.desc()).all()
    return [
        {
            "id": r.id,
            "full_name": r.full_name,
            "email": r.email,
            "department": r.department,
            "reason": r.reason,
            "status": r.status,
            "requested_at": r.requested_at.isoformat() if r.requested_at else None,
        }
        for r in rows
    ]


@router.get("/roles")
def list_roles(_: models.User = Depends(require_admin)):
    return {"roles": ["admin", "user", "viewer"]}


@router.post("/create-user")
def create_user(body: CreateUserBody, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    role = body.role.strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    email = body.email.strip().lower()
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already exists")
    username_seed = (body.username or "").strip() or email.split("@")[0]
    username = _build_unique_username(db, username_seed)

    invitation = None
    if body.password:
        pwd_hash = hash_password(body.password)
        configured = True
        token_hash = None
        expires_at = None
    else:
        token = generate_invite_token()
        pwd_hash = hash_password(generate_invite_token())
        configured = False
        token_hash = hash_invite_token(token)
        expires_at = datetime.utcnow() + timedelta(hours=INVITE_EXPIRE_HOURS)
        invitation = build_invite_payload(email, body.full_name, token, FRONTEND_BASE_URL, INVITE_EXPIRE_HOURS)

    user = models.User(
        full_name=body.full_name.strip(),
        username=username,
        email=email,
        password_hash=pwd_hash,
        role=role,
        is_active=True,
        created_by=admin.id,
        password_configured=configured,
        invite_token_hash=token_hash,
        invite_expires_at=expires_at,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"message": "User created", "user_id": user.id, "invitation": invitation}


@router.post("/approve-request/{request_id}")
def approve_request(
    request_id: int,
    body: ApproveBody,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    role = body.role.strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    req = db.query(models.AccessRequest).filter(models.AccessRequest.id == request_id).first()
    if not req or req.status != "pending":
        raise HTTPException(status_code=404, detail="Pending request not found")
    if db.query(models.User).filter(models.User.email == req.email.lower()).first():
        raise HTTPException(status_code=400, detail="User already exists")

    token = generate_invite_token()
    expires_at = datetime.utcnow() + timedelta(hours=INVITE_EXPIRE_HOURS)
    user = models.User(
        full_name=req.full_name,
        username=_build_unique_username(db, req.email.split("@")[0]),
        email=req.email.lower(),
        password_hash=hash_password(generate_invite_token()),
        role=role,
        is_active=True,
        created_by=admin.id,
        password_configured=False,
        invite_token_hash=hash_invite_token(token),
        invite_expires_at=expires_at,
    )
    req.status = "approved"
    db.add(user)
    db.add(req)
    db.commit()
    invitation = build_invite_payload(req.email, req.full_name, token, FRONTEND_BASE_URL, INVITE_EXPIRE_HOURS)
    body_html = (
        f"<p>Hello {req.full_name},</p>"
        "<p>Your MDQM access request has been approved.</p>"
        f"<p>Please set your password using this link: <a href=\"{invitation['setup_url']}\">{invitation['setup_url']}</a></p>"
        f"<p><small>This link expires in {INVITE_EXPIRE_HOURS} hours.</small></p>"
    )
    mail_sent, mail_error = _send_graph_email([req.email], invitation["subject"], body_html)
    return {
        "message": "Request approved",
        "invitation": invitation,
        "mail_sent": mail_sent,
        "mail_error": mail_error,
    }


@router.post("/reject-request/{request_id}")
def reject_request(request_id: int, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    req = db.query(models.AccessRequest).filter(models.AccessRequest.id == request_id).first()
    if not req or req.status != "pending":
        raise HTTPException(status_code=404, detail="Pending request not found")
    req.status = "rejected"
    db.commit()
    return {"message": "Request rejected"}


@router.post("/disable-user/{user_id}")
def disable_user(
    user_id: int,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot disable your own account")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
    return {"message": "User disabled"}


@router.post("/update-user-role/{user_id}")
def update_user_role(
    user_id: int,
    body: RoleUpdateBody,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    role = body.role.strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_id == admin.id and role != "admin":
        raise HTTPException(status_code=400, detail="You cannot remove your own admin role")

    if user.role == "admin" and role != "admin":
        active_admin_count = (
            db.query(models.User)
            .filter(models.User.role == "admin", models.User.is_active == True)  # noqa: E712
            .count()
        )
        if active_admin_count <= 1:
            raise HTTPException(status_code=400, detail="At least one active admin is required")

    user.role = role
    db.commit()
    return {"message": "User role updated", "user_id": user.id, "role": user.role}

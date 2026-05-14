from datetime import datetime, timedelta
import json
import os
from urllib import parse as urlparse
from urllib import request as urlrequest

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, text
from sqlalchemy.orm import Session

import models
from auth.config import FRONTEND_BASE_URL, INVITE_EXPIRE_HOURS
from auth.deps import require_admin
from auth.email_invite import build_invite_payload
from auth.security import generate_invite_token, hash_invite_token, hash_password
from auth.username_utils import build_unique_username
from database import get_db
from utils.audit import write_audit_log

router = APIRouter(prefix="/admin", tags=["admin"])

ENTERPRISE_ROLES = [
    "ADMIN",
    "CDO",
    "DATA_STEWARD",
    "DATA_OWNER",
    "DEVELOPER",
    "AUDITOR",
    "ANALYST",
    "BUSINESS_USER",
]
VALID_ROLES = set(ENTERPRISE_ROLES)
ROLE_ALIASES = {
    "admin": "ADMIN",
    "cdo": "CDO",
    "data_steward": "DATA_STEWARD",
    "steward": "DATA_STEWARD",
    "data_owner": "DATA_OWNER",
    "owner": "DATA_OWNER",
    "developer": "DEVELOPER",
    "auditor": "AUDITOR",
    "analyst": "ANALYST",
    "viewer": "BUSINESS_USER",
    "business_user": "BUSINESS_USER",
    "business": "BUSINESS_USER",
    "bu": "BUSINESS_USER",
    "user": "ANALYST",
}


def _stamp_access_request_approver(req: models.AccessRequest, admin: models.User) -> None:
    req.approver_name = (admin.full_name or admin.username or admin.email or "Admin").strip()[:255]


class CreateUserBody(BaseModel):
    full_name: str
    email: EmailStr
    username: str | None = None
    role: str = "ANALYST"
    password: str | None = None


class ApproveBody(BaseModel):
    role: str = "ANALYST"


class RoleUpdateBody(BaseModel):
    role: str


def _normalize_role_input(role: str) -> str:
    raw = (role or "").strip()
    if not raw:
        return "ANALYST"
    key = raw.upper()
    if key in VALID_ROLES:
        return key
    return ROLE_ALIASES.get(raw.strip().lower(), key)


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


@router.get("/users")
def list_users(
    response: Response,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    List users via raw SQL so the result always matches `SELECT ... FROM auth.users`
    (avoids any ORM/session edge case that could omit rows visible in psql).
    """
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    result = db.execute(
        text(
            """
            SELECT id, full_name, username, email, role, is_active, created_at, created_by, password_configured
            FROM auth.users
            ORDER BY id ASC
            """
        )
    )
    rows = result.fetchall()
    out = []
    for r in rows:
        created_at = r[6]
        pwd_cfg = r[8]
        out.append(
            {
                "id": r[0],
                "full_name": r[1],
                "username": r[2],
                "email": r[3],
                "role": r[4],
                "is_active": bool(r[5]) if r[5] is not None else True,
                "created_at": created_at.isoformat() if created_at else None,
                "created_by": r[7],
                "password_configured": bool(pwd_cfg) if pwd_cfg is not None else True,
            }
        )
    return out


@router.get("/access-requests")
def list_access_requests(_: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(models.AccessRequest).order_by(models.AccessRequest.requested_at.desc()).all()
    out = []
    for r in rows:
        em = (r.email or "").strip().lower()
        has_user = (
            db.query(models.User.id).filter(func.lower(models.User.email) == em).first() is not None
        )
        out.append(
            {
                "id": r.id,
                "full_name": r.full_name,
                "username": r.username,
                "email": r.email,
                "department": r.department,
                "reason": r.reason,
                "status": r.status,
                "requested_at": r.requested_at.isoformat() if r.requested_at else None,
                "has_user": has_user,
                "dataset_name": getattr(r, "dataset_name", None),
                "access_type": getattr(r, "access_type", None),
                "duration": getattr(r, "duration", None),
                "approver_name": getattr(r, "approver_name", None),
            }
        )
    return out


@router.get("/roles")
def list_roles(_: models.User = Depends(require_admin)):
    return {"roles": ENTERPRISE_ROLES}


@router.post("/create-user")
def create_user(body: CreateUserBody, request: Request, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    role = _normalize_role_input(body.role)
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    email = body.email.strip().lower()
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already exists")
    username_seed = (body.username or "").strip() or email.split("@")[0]
    username = build_unique_username(db, username_seed)

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
    write_audit_log(
        db=db,
        user_id=admin.id,
        action="admin.create_user",
        entity_type="user",
        entity_id=str(user.id),
        ip_address=request.client.host if request.client else None,
        new_values={"email": user.email, "role": user.role, "username": user.username},
    )
    return {"message": "User created", "user_id": user.id, "invitation": invitation}


@router.post("/approve-request/{request_id}")
def approve_request(
    request_id: int,
    body: ApproveBody,
    request: Request,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    role = _normalize_role_input(body.role)
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    req = db.query(models.AccessRequest).filter(models.AccessRequest.id == request_id).first()
    if not req or req.status != "pending":
        raise HTTPException(status_code=404, detail="Pending request not found")
    if db.query(models.User).filter(models.User.email == req.email.lower()).first():
        raise HTTPException(status_code=400, detail="User already exists")

    if req.username:
        final_username = req.username
        if db.query(models.User).filter(models.User.username == final_username).first():
            raise HTTPException(status_code=400, detail="Username is no longer available")
    else:
        final_username = build_unique_username(db, req.email.split("@")[0])

    token = generate_invite_token()
    expires_at = datetime.utcnow() + timedelta(hours=INVITE_EXPIRE_HOURS)
    user = models.User(
        full_name=req.full_name,
        username=final_username,
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
    _stamp_access_request_approver(req, admin)
    db.add(user)
    db.add(req)
    db.commit()
    write_audit_log(
        db=db,
        user_id=admin.id,
        action="admin.approve_access_request",
        entity_type="access_request",
        entity_id=str(request_id),
        ip_address=request.client.host if request.client else None,
        old_values={"status": "pending"},
        new_values={"status": "approved", "role": role, "created_user_email": req.email.lower()},
    )
    invitation = build_invite_payload(req.email, req.full_name, token, FRONTEND_BASE_URL, INVITE_EXPIRE_HOURS)
    body_html = (
        f"<p>Hello {req.full_name},</p>"
        "<p>Your MDQM access request has been approved.</p>"
        f"<p>You can sign in with username <b>{final_username}</b> or your company email.</p>"
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


@router.post("/complete-data-access-request/{request_id}")
def complete_data_access_request(
    request_id: int,
    request: Request,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """For pending auth.access_requests where the email already has a login (e.g. business user data request)."""
    req = db.query(models.AccessRequest).filter(models.AccessRequest.id == request_id).first()
    if not req or req.status != "pending":
        raise HTTPException(status_code=404, detail="Pending request not found")
    em = (req.email or "").strip().lower()
    user = db.query(models.User).filter(func.lower(models.User.email) == em).first()
    if not user:
        raise HTTPException(
            status_code=400,
            detail="No account for this email yet — use Approve to create a user and send an invite.",
        )
    req.status = "approved"
    _stamp_access_request_approver(req, admin)
    db.add(req)
    db.commit()
    write_audit_log(
        db=db,
        user_id=admin.id,
        action="admin.complete_data_access_request",
        entity_type="access_request",
        entity_id=str(request_id),
        ip_address=request.client.host if request.client else None,
        old_values={"status": "pending"},
        new_values={"status": "approved", "email": em},
    )
    try:
        from services import enterprise_service as esvc

        esvc.create_notification(
            db,
            user_id=user.id,
            subject="Data access request approved",
            body=f"Your data access request #{req.id} was approved.",
            severity="info",
        )
    except Exception:
        pass
    return {"message": "Request marked approved", "id": request_id}


@router.post("/reject-request/{request_id}")
def reject_request(request_id: int, request: Request, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    req = db.query(models.AccessRequest).filter(models.AccessRequest.id == request_id).first()
    if not req or req.status != "pending":
        raise HTTPException(status_code=404, detail="Pending request not found")
    req.status = "rejected"
    _stamp_access_request_approver(req, admin)
    db.add(req)
    db.commit()
    write_audit_log(
        db=db,
        user_id=admin.id,
        action="admin.reject_access_request",
        entity_type="access_request",
        entity_id=str(request_id),
        ip_address=request.client.host if request.client else None,
        old_values={"status": "pending"},
        new_values={"status": "rejected"},
    )
    return {"message": "Request rejected"}


@router.post("/disable-user/{user_id}")
def disable_user(
    user_id: int,
    request: Request,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot disable your own account")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    prev_active = bool(user.is_active)
    user.is_active = False
    db.commit()
    write_audit_log(
        db=db,
        user_id=admin.id,
        action="admin.disable_user",
        entity_type="user",
        entity_id=str(user.id),
        ip_address=request.client.host if request.client else None,
        old_values={"is_active": prev_active},
        new_values={"is_active": False},
    )
    return {"message": "User disabled"}


@router.post("/update-user-role/{user_id}")
def update_user_role(
    user_id: int,
    body: RoleUpdateBody,
    request: Request,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    role = _normalize_role_input(body.role)
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_id == admin.id and role != "ADMIN":
        raise HTTPException(status_code=400, detail="You cannot remove your own admin role")

    if str(user.role or "").upper() == "ADMIN" and role != "ADMIN":
        active_admin_count = (
            db.query(models.User)
            .filter(func.upper(models.User.role) == "ADMIN", models.User.is_active == True)  # noqa: E712
            .count()
        )
        if active_admin_count <= 1:
            raise HTTPException(status_code=400, detail="At least one active admin is required")

    previous_role = user.role
    user.role = role
    db.commit()
    write_audit_log(
        db=db,
        user_id=admin.id,
        action="admin.update_user_role",
        entity_type="user",
        entity_id=str(user.id),
        ip_address=request.client.host if request.client else None,
        old_values={"role": previous_role},
        new_values={"role": user.role},
    )
    return {"message": "User role updated", "user_id": user.id, "role": user.role}


@router.post("/delete-user/{user_id}")
def delete_user(
    user_id: int,
    request: Request,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.role or "").upper() == "ADMIN" and user.is_active:
        active_admin_count = (
            db.query(models.User)
            .filter(func.upper(models.User.role) == "ADMIN", models.User.is_active == True)  # noqa: E712
            .count()
        )
        if active_admin_count <= 1:
            raise HTTPException(status_code=400, detail="At least one active admin is required")

    snapshot = {"email": user.email, "role": user.role, "username": user.username, "is_active": bool(user.is_active)}
    db.query(models.User).filter(models.User.created_by == user_id).update(
        {"created_by": None},
        synchronize_session=False,
    )
    db.delete(user)
    db.commit()
    write_audit_log(
        db=db,
        user_id=admin.id,
        action="admin.delete_user",
        entity_type="user",
        entity_id=str(user_id),
        ip_address=request.client.host if request.client else None,
        old_values=snapshot,
        new_values={"deleted": True},
    )
    return {"message": "User deleted"}

import json
import os
from urllib import parse as urlparse
from urllib import request as urlrequest

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

import models
from database import get_db

router = APIRouter(tags=["access"])


class AccessRequestBody(BaseModel):
    full_name: str
    email: EmailStr
    department: str = ""
    reason: str = ""


def _send_access_request_email(row: models.AccessRequest) -> tuple[bool, str | None]:
    notify_raw = os.getenv("ACCESS_REQUEST_NOTIFY_EMAIL", "").strip()
    notify_emails = [e.strip() for e in notify_raw.split(",") if e.strip()]
    if not notify_emails:
        return (False, "ACCESS_REQUEST_NOTIFY_EMAIL is not configured")

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

    subject = f"New Access Request - {row.full_name}"
    reason = row.reason or "-"
    department = row.department or "-"
    requested_at = row.requested_at.isoformat() if row.requested_at else "-"
    body_html = (
        "<p>A new access request was submitted in MDQM.</p>"
        "<ul>"
        f"<li><b>Name:</b> {row.full_name}</li>"
        f"<li><b>Email:</b> {row.email}</li>"
        f"<li><b>Department:</b> {department}</li>"
        f"<li><b>Reason:</b> {reason}</li>"
        f"<li><b>Requested at:</b> {requested_at}</li>"
        "</ul>"
        "<p>Review in Admin Panel.</p>"
    )
    graph_mail_url = f"https://graph.microsoft.com/v1.0/users/{sender_email}/sendMail"
    mail_payload = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": body_html},
            "toRecipients": [{"emailAddress": {"address": e}} for e in notify_emails],
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


@router.post("/access-request")
def request_access(body: AccessRequestBody, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(status_code=400, detail="User already exists")
    row = models.AccessRequest(
        full_name=body.full_name.strip(),
        email=email,
        department=body.department.strip() or None,
        reason=body.reason.strip() or None,
        status="pending",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    mail_sent, mail_error = _send_access_request_email(row)
    return {
        "id": row.id,
        "message": "Access request submitted",
        "mail_sent": mail_sent,
        "mail_error": mail_error,
    }

from datetime import datetime
import os
import smtplib
from email.mime.text import MIMEText
from typing import Optional
from fastapi import BackgroundTasks

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import text

import models
from auth.deps import get_current_user
from database import get_db

router = APIRouter(prefix="/api/tickets", tags=["tickets"])

ADMIN = "ADMIN"
CDO = "CDO"
DATA_STEWARD = "DATA_STEWARD"
DATA_OWNER = "DATA_OWNER"
DEVELOPER = "DEVELOPER"
AUDITOR = "AUDITOR"
ANALYST = "ANALYST"
BUSINESS_USER = "BUSINESS_USER"

ALL_ROLES = {
    ADMIN,
    CDO,
    DATA_STEWARD,
    DATA_OWNER,
    DEVELOPER,
    AUDITOR,
    ANALYST,
    BUSINESS_USER,
}

TICKET_CREATORS = ALL_ROLES
TICKET_ASSIGNERS = ALL_ROLES
TICKET_FIXERS = ALL_ROLES
TICKET_VERIFIERS = ALL_ROLES
TICKET_CLOSERS = ALL_ROLES
TICKET_VIEW_ALL = ALL_ROLES
DATA_TICKET_CATEGORIES = {"Bug Issue", "Data Quality Issue", "Governance Issue", "Validation", "Metadata", "Data Correction"}


def current_db_timestamp(db: Session):
    """Return PostgreSQL server timestamp so verified/closed/fixed times match created_at format."""
    return db.execute(text("SELECT CURRENT_TIMESTAMP")).scalar()


def normalize_role(role: str) -> str:
    value = str(role or BUSINESS_USER).strip().upper()
    aliases = {
        "STEWARD": DATA_STEWARD,
        "OWNER": DATA_OWNER,
        "BUSINESS": BUSINESS_USER,
        "BU": BUSINESS_USER,
        "USER": BUSINESS_USER,
    }
    return aliases.get(value, value)


def can_raise_ticket(role: str) -> bool:
    return normalize_role(role) in TICKET_CREATORS


def can_assign_ticket(role: str) -> bool:
    return normalize_role(role) in TICKET_ASSIGNERS


def can_fix_ticket(role: str) -> bool:
    return normalize_role(role) in TICKET_FIXERS


def can_verify_ticket(role: str) -> bool:
    return normalize_role(role) in TICKET_VERIFIERS


def can_close_ticket(role: str) -> bool:
    return normalize_role(role) in TICKET_CLOSERS


def can_view_all_tickets(role: str) -> bool:
    return normalize_role(role) in TICKET_VIEW_ALL


def can_see_ticket(user: models.User, ticket: models.EnterpriseTicket) -> bool:
    return True


class TicketCreate(BaseModel):
    title: str
    description: str
    category: str = "Bug Issue"
    priority: str = "Medium"
    assignment_type: Optional[str] = "ROLE"
    assigned_role: Optional[str] = None
    user_email: Optional[str] = None
    dataset_id: Optional[int] = None
    dataset_name: Optional[str] = None
    dataset_owner: Optional[str] = None


class TicketAssign(BaseModel):
    user_email: str


class TicketStatusUpdate(BaseModel):
    status: str
    comment: Optional[str] = None
    fix_note: Optional[str] = None


class TicketCommentCreate(BaseModel):
    comment: str


class TicketPriorityUpdate(BaseModel):
    priority: str


def send_ticket_closed_email(receiver_email: str, ticket: models.EnterpriseTicket):
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM", smtp_user or "")

    subject = f"Ticket #{ticket.id} Closed"
    body = f"""Hello,

Your ticket has been completed and closed.

Ticket ID: {ticket.id}
Title: {ticket.title}
Status: {ticket.status}

Please verify the fix.

Thank you.
"""

    if not (smtp_host and smtp_user and smtp_password and smtp_from and receiver_email):
        print(f"[ticket-email] SMTP not configured. Would send to {receiver_email}: {subject}")
        return False

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = smtp_from
    msg["To"] = receiver_email

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(msg)
    return True

def send_ticket_assigned_email(receiver_email: str, ticket: models.EnterpriseTicket):
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM", smtp_user or "")

    subject = f"Ticket #{ticket.id} Assigned"
    body = f"""Hello,

A ticket has been assigned to you.

Ticket ID: {ticket.id}
Title: {ticket.title}
Priority: {ticket.priority}
Status: {ticket.status}

Please check and take necessary action.

Thank you.
"""

    if not (smtp_host and smtp_user and smtp_password and smtp_from and receiver_email):
        print(f"[ticket-email] SMTP not configured. Would send to {receiver_email}: {subject}")
        return False

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = smtp_from
    msg["To"] = receiver_email

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(msg)

    return True

@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):

    users = (
    db.query(models.User)
    .filter(models.User.is_active == True)
    .order_by(models.User.full_name.asc())
    .all()
)
    return [
        {
            "id": dev.id,
            "full_name": dev.full_name,
            "username": dev.username,
            "email": dev.email,
            "role": dev.role,
        }
        for dev in users
    ]


@router.post("")
def create_ticket(
    body: TicketCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    ticket = models.EnterpriseTicket(
        title=body.title,
        description=body.description,
        category=body.category,
        priority=body.priority,
        status="Open",
        created_by_user_id=user.id,
        created_by_role=body.assigned_role or normalize_role(user.role),
        
        
    )

    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    mail_sent = False

    if body.user_email:
        assigned_user = db.query(models.User).filter(
            models.User.email == body.user_email,
            models.User.is_active == True
        ).first()

        if not assigned_user:
            raise HTTPException(status_code=404, detail="Assigned user email not found")

        ticket.assigned_to_user_id = assigned_user.id
        ticket.status = "Assigned"
        ticket.updated_at = current_db_timestamp(db)

        try:
            background_tasks.add_task(send_ticket_assigned_email,assigned_user.email,ticket)
            mail_sent = True

        except Exception as e:
            print("Assignment email failed:", e)
            mail_sent = False

        db.add(models.EnterpriseTicketComment(
            ticket_id=ticket.id,
            user_id=user.id,
            comment=f"Assigned to {assigned_user.full_name} ({assigned_user.email})"
        ))

        db.commit()
        db.refresh(ticket)

    return {
    "message": "Ticket created successfully",
    "mail_sent": mail_sent,
    "ticket": serialize_ticket(db, ticket),
    }
@router.get("/datasets")
def list_ticket_datasets(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    datasets = db.query(models.EnterpriseDataset).all()
    result = []

    for d in datasets:
        owner = None

        if d.owner_user_id:
            owner = db.query(models.User).filter(
                models.User.id == d.owner_user_id
            ).first()

        result.append({
            "id": d.id,
            "name": d.name,
            "created_by_name": owner.full_name if owner else None,
            "created_by_email": owner.email if owner else None,
        })

    return result


@router.get("")
def list_tickets(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    tickets = (
    db.query(models.EnterpriseTicket)
    .order_by(models.EnterpriseTicket.id.desc())
    .all()
)

    return [serialize_ticket(db, t) for t in tickets]


@router.put("/{ticket_id}/assign")
def assign_ticket(
    ticket_id: int,
    body: TicketAssign,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):

    ticket = db.query(models.EnterpriseTicket).filter(
        models.EnterpriseTicket.id == ticket_id
    ).first()

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    assigned_user = (
        db.query(models.User)
        .filter(
            models.User.email == body.user_email,
            models.User.is_active == True
        )
        .first()
    )

    if not assigned_user:
        raise HTTPException(
            status_code=404,
            detail="User not found. Check user email"
        )

    ticket.assigned_to_user_id = assigned_user.id
    ticket.status = "Assigned"
    ticket.updated_at = current_db_timestamp(db)
    try:
        background_tasks.add_task(send_ticket_assigned_email,assigned_user.email,ticket)
    except Exception as e:
        print("Assignment email failed:", e)

    db.add(
        models.EnterpriseTicketComment(
            ticket_id=ticket.id,
            user_id=user.id,
            comment=f"Assigned to {assigned_user.full_name} ({assigned_user.email})"
        )
    )

    db.commit()
    db.refresh(ticket)

    return {
        "message": "Ticket assigned successfully",
        "ticket": serialize_ticket(db, ticket)
    }


@router.put("/{ticket_id}/status")
def update_ticket_status(
    ticket_id: int,
    body: TicketStatusUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    ticket = db.query(models.EnterpriseTicket).filter(models.EnterpriseTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if not can_see_ticket(user, ticket):
        raise HTTPException(status_code=403, detail="You cannot update this ticket")

    role = normalize_role(user.role)

    is_admin = role == ADMIN
    is_assigned_user = ticket.assigned_to_user_id == user.id

    if not is_admin and not is_assigned_user:
      raise HTTPException(
        status_code=403,
        detail="Only Admin or assigned user can update this ticket"
    )

    new_status = body.status

    if new_status in {"In Progress", "Fixed"}:
     if new_status == "Fixed":
        ticket.fixed_by_user_id = user.id
        ticket.fixed_at = current_db_timestamp(db)
        if body.fix_note:
            ticket.fix_note = body.fix_note

    elif new_status == "Verified":
        ticket.verified_by_user_id = user.id
        ticket.verified_at = current_db_timestamp(db)

    elif new_status == "Closed":
        ticket.closed_by_user_id = user.id
        ticket.closed_at = current_db_timestamp(db)
    elif new_status in {"Open", "Assigned"}:
        pass

    else:
        raise HTTPException(status_code=400, detail="Invalid ticket status")

    ticket.status = new_status
    ticket.updated_at = current_db_timestamp(db)

    if body.comment:
        db.add(models.EnterpriseTicketComment(ticket_id=ticket.id, user_id=user.id, comment=body.comment))

    db.commit()
    db.refresh(ticket)

    mail_sent = False
    if ticket.status == "Closed":
        creator = db.query(models.User).filter(models.User.id == ticket.created_by_user_id).first()
        if creator:
            mail_sent = send_ticket_closed_email(creator.email, ticket)

    return {"message": "Ticket status updated successfully", "mail_sent": mail_sent, "ticket": serialize_ticket(db, ticket)}


@router.put("/{ticket_id}")
def update_ticket_legacy(
    ticket_id: int,
    body: TicketStatusUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    return update_ticket_status(ticket_id, body, db, user)


@router.post("/{ticket_id}/comments")
def add_ticket_comment(
    ticket_id: int,
    body: TicketCommentCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    ticket = db.query(models.EnterpriseTicket).filter(models.EnterpriseTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if not can_see_ticket(user, ticket):
        raise HTTPException(status_code=403, detail="You cannot comment on this ticket")

    db.add(models.EnterpriseTicketComment(ticket_id=ticket.id, user_id=user.id, comment=body.comment))
    ticket.updated_at = current_db_timestamp(db)
    db.commit()
    db.refresh(ticket)
    return {"message": "Comment added", "ticket": serialize_ticket(db, ticket)}


def serialize_ticket(db: Session, ticket: models.EnterpriseTicket):
    creator = db.query(models.User).filter(models.User.id == ticket.created_by_user_id).first()
    assignee = None
    fixed_by = None
    verified_by = None
    closed_by = None

    if ticket.assigned_to_user_id:
        assignee = db.query(models.User).filter(models.User.id == ticket.assigned_to_user_id).first()
    if getattr(ticket, "fixed_by_user_id", None):
        fixed_by = db.query(models.User).filter(models.User.id == ticket.fixed_by_user_id).first()
    if getattr(ticket, "verified_by_user_id", None):
        verified_by = db.query(models.User).filter(models.User.id == ticket.verified_by_user_id).first()
    if getattr(ticket, "closed_by_user_id", None):
        closed_by = db.query(models.User).filter(models.User.id == ticket.closed_by_user_id).first()

    comments = (
        db.query(models.EnterpriseTicketComment)
        .filter(models.EnterpriseTicketComment.ticket_id == ticket.id)
        .order_by(models.EnterpriseTicketComment.id.asc())
        .all()
    )
    return {
        "id": ticket.id,
        "title": ticket.title,
        "description": ticket.description,
        "category": ticket.category,
        "priority": ticket.priority,
        "status": ticket.status,
        "created_by_user_id": ticket.created_by_user_id,
        "created_by_role": getattr(ticket, "created_by_role", None),
        "created_by_name": creator.full_name if creator else None,
        "created_by_email": creator.email if creator else None,
        "assigned_to_user_id": ticket.assigned_to_user_id,
        "assigned_to_name": assignee.full_name if assignee else None,
        "assigned_to_email": assignee.email if assignee else None,
        "fix_note": getattr(ticket, "fix_note", None),
        "fixed_by_name": fixed_by.full_name if fixed_by else None,
        "verified_by_name": verified_by.full_name if verified_by else None,
        "closed_by_name": closed_by.full_name if closed_by else None,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
        "fixed_at": ticket.fixed_at.isoformat() if getattr(ticket, "fixed_at", None) else None,
        "verified_at": ticket.verified_at.isoformat() if getattr(ticket, "verified_at", None) else None,
        "closed_at": ticket.closed_at.isoformat() if ticket.closed_at else None,
        "comments": [
            {"id": c.id, "user_id": c.user_id, "comment": c.comment, "created_at": c.created_at.isoformat() if c.created_at else None}
            for c in comments
        ],
    }

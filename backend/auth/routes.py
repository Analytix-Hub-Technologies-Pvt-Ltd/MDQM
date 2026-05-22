from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
from auth.config import BOOTSTRAP_SECRET, INVITE_EXPIRE_HOURS
from auth.deps import get_current_user
from auth.security import (
    create_access_token,
    hash_invite_token,
    hash_password,
    verify_password,
)
from database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    login: str
    password: str


class BootstrapBody(BaseModel):
    secret: str
    full_name: str
    email: EmailStr
    password: str


class BootstrapSetPasswordBody(BaseModel):
    """Reset password on production when DB was empty / migrated separately from local."""

    secret: str
    email: EmailStr
    password: str


class CompleteInviteBody(BaseModel):
    token: str
    password: str


class UpdateProfileBody(BaseModel):
    full_name: str | None = None
    username: str | None = None
    email: EmailStr | None = None


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


def _user_out(user: models.User):
    return {
        "id": user.id,
        "full_name": user.full_name,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
    }


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


@router.post("/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    identifier = body.login.strip().lower()
    user = (
        db.query(models.User)
        .filter(or_(models.User.email == identifier, models.User.username == identifier))
        .first()
    )
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid username/email or password")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username/email or password")
    if not user.password_configured:
        raise HTTPException(status_code=403, detail="Password setup required")
    return {
        "access_token": create_access_token(user.id, user.role),
        "token_type": "bearer",
        "user": _user_out(user),
    }


@router.get("/me")
def me(user: models.User = Depends(get_current_user)):
    return {"user": _user_out(user)}


@router.post("/bootstrap")
def bootstrap_admin(body: BootstrapBody, db: Session = Depends(get_db)):
    if not BOOTSTRAP_SECRET or body.secret != BOOTSTRAP_SECRET:
        raise HTTPException(status_code=403, detail="Invalid bootstrap secret")
    if db.query(models.User).count() > 0:
        raise HTTPException(status_code=400, detail="Users already exist")
    user = models.User(
        full_name=body.full_name.strip(),
        username=_build_unique_username(db, body.email.split("@")[0]),
        email=body.email.strip().lower(),
        password_hash=hash_password(body.password),
        role="admin",
        is_active=True,
        password_configured=True,
        created_by=None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "access_token": create_access_token(user.id, user.role),
        "token_type": "bearer",
        "user": _user_out(user),
    }


@router.post("/bootstrap-set-password")
def bootstrap_set_password(body: BootstrapSetPasswordBody, db: Session = Depends(get_db)):
    if not BOOTSTRAP_SECRET or body.secret != BOOTSTRAP_SECRET:
        raise HTTPException(status_code=403, detail="Invalid bootstrap secret")
    email = body.email.strip().lower()
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found for this email")
    user.password_hash = hash_password(body.password)
    user.password_configured = True
    db.commit()
    return {"message": "Password updated", "email": user.email}


@router.post("/complete-invite")
def complete_invite(body: CompleteInviteBody, db: Session = Depends(get_db)):
    token_hash = hash_invite_token(body.token.strip())
    user = (
        db.query(models.User)
        .filter(
            models.User.invite_token_hash == token_hash,
            models.User.invite_expires_at > datetime.utcnow(),
        )
        .first()
    )
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    user.password_hash = hash_password(body.password)
    user.password_configured = True
    user.invite_token_hash = None
    user.invite_expires_at = None
    db.commit()
    return {
        "access_token": create_access_token(user.id, user.role),
        "token_type": "bearer",
        "user": _user_out(user),
    }


@router.get("/profile")
def get_profile(user: models.User = Depends(get_current_user)):
    """Get the current user's profile details."""
    return {"user": _user_out(user)}


@router.put("/profile")
def update_profile(
    body: UpdateProfileBody,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's profile (full_name, username, email)."""
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    
    if body.email is not None:
        email = body.email.strip().lower()
        # Check if email is already used by another user
        existing_user = (
            db.query(models.User)
            .filter(models.User.email == email, models.User.id != user.id)
            .first()
        )
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = email
    
    if body.username is not None:
        username = _sanitize_username(body.username)
        if not username:
            raise HTTPException(status_code=400, detail="Invalid username")
        # Check if username is already used by another user
        existing_user = (
            db.query(models.User)
            .filter(models.User.username == username, models.User.id != user.id)
            .first()
        )
        if existing_user:
            raise HTTPException(status_code=400, detail="Username already in use")
        user.username = username
    
    db.commit()
    db.refresh(user)
    return {"message": "Profile updated", "user": _user_out(user)}


@router.put("/change-password")
def change_password(
    body: ChangePasswordBody,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the current user's password."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"message": "Password changed successfully"}

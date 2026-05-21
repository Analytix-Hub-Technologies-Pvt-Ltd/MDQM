"""First-run database seeding (default admin user)."""

from __future__ import annotations

import os
import sys

from sqlalchemy.orm import Session

import models
from auth.security import hash_password
from auth.username_utils import build_unique_username
from settings import is_production


def ensure_default_admin(db: Session) -> None:
    """Create a default ADMIN user when the auth.users table is empty."""
    if db.query(models.User).count() > 0:
        return

    password = (os.getenv("MDQM_DEFAULT_ADMIN_PASSWORD") or "").strip()
    if is_production() and not password:
        print(
            "[mdqm] No users in database. Set MDQM_DEFAULT_ADMIN_EMAIL, MDQM_DEFAULT_ADMIN_USERNAME, "
            "and MDQM_DEFAULT_ADMIN_PASSWORD in the environment, or call POST /auth/bootstrap.",
            file=sys.stderr,
            flush=True,
        )
        return

    if not password:
        password = "changeme"

    email = (os.getenv("MDQM_DEFAULT_ADMIN_EMAIL") or "admin@mdqm.local").strip().lower()
    full_name = (os.getenv("MDQM_DEFAULT_ADMIN_FULL_NAME") or "MDQM Administrator").strip()
    username_seed = (os.getenv("MDQM_DEFAULT_ADMIN_USERNAME") or "admin").strip()

    username = build_unique_username(db, username_seed)
    user = models.User(
        full_name=full_name,
        username=username,
        email=email,
        password_hash=hash_password(password),
        role="ADMIN",
        is_active=True,
        password_configured=True,
        created_by=None,
    )
    db.add(user)
    db.commit()
    print(
        f"[mdqm] Created default admin user (email={email}, username={username}). "
        "Sign in and change the password after first login.",
        file=sys.stderr,
        flush=True,
    )
    if not is_production():
        print(
            "[mdqm] Default password comes from MDQM_DEFAULT_ADMIN_PASSWORD in .env "
            '(falls back to "changeme" when unset).',
            file=sys.stderr,
            flush=True,
        )

"""Database seeding: default admin (empty DB) or Analytix Hub demo test accounts."""

from __future__ import annotations

import os
import sys

from sqlalchemy.orm import Session

import models
from auth.demo_users import DEMO_USERS
from auth.security import hash_password
from auth.username_utils import build_unique_username
from settings import demo_users_seed_enabled, is_production


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


def sync_demo_user_passwords(db: Session) -> None:
    """
    Update passwords (bcrypt) for existing users matched by email only.
    Does not create users or change username / full_name.
    """
    updated = 0
    skipped = 0
    for spec in DEMO_USERS:
        email = spec["email"].strip().lower()
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            skipped += 1
            print(
                f"[mdqm] Demo password sync skipped (no user for {email}).",
                file=sys.stderr,
                flush=True,
            )
            continue
        user.password_hash = hash_password(spec["password"])
        user.is_active = True
        user.password_configured = True
        updated += 1
    db.commit()
    print(
        f"[mdqm] Demo passwords updated for {updated} existing user(s) "
        f"(skipped {skipped} missing email(s)). Stored as bcrypt in auth.users.",
        file=sys.stderr,
        flush=True,
    )


# Backwards-compatible alias for scripts
ensure_demo_users = sync_demo_user_passwords


def seed_users_on_startup(db: Session) -> None:
    """Sync demo passwords when enabled; otherwise legacy single-admin seed on empty DB."""
    if demo_users_seed_enabled():
        sync_demo_user_passwords(db)
        return
    ensure_default_admin(db)

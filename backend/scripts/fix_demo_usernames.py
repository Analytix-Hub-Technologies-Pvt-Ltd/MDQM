#!/usr/bin/env python3
"""
Fix .1 usernames on existing @analytixhub.ai test users.

When demo users were first created, base names (e.g. steward.test) were already
taken by older @mdqm.local accounts, so usernames became steward.test.1.
This script reclaims the clean username on the analytixhub user and deactivates
the legacy @mdqm.local duplicate (does not delete rows).
"""

from __future__ import annotations

import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from settings import load_env  # noqa: E402

load_env()

from auth.demo_users import DEMO_USERS  # noqa: E402
from auth.username_utils import sanitize_username  # noqa: E402
from database import SessionLocal  # noqa: E402
import models  # noqa: E402


def main() -> int:
    db = SessionLocal()
    fixed = 0
    try:
        for spec in DEMO_USERS:
            email = spec["email"].strip().lower()
            desired = sanitize_username(email.split("@")[0])
            user = db.query(models.User).filter(models.User.email == email).first()
            if not user:
                print(f"skip (no user): {email}")
                continue
            if user.username == desired:
                print(f"ok: {email} -> {desired}")
                continue

            blocker = (
                db.query(models.User)
                .filter(models.User.username == desired, models.User.id != user.id)
                .first()
            )
            if blocker:
                if blocker.email.endswith("@mdqm.local"):
                    legacy = f"{desired}.legacy"
                    n = 1
                    while (
                        db.query(models.User)
                        .filter(models.User.username == legacy, models.User.id != blocker.id)
                        .first()
                    ):
                        n += 1
                        legacy = f"{desired}.legacy{n}"
                    blocker.username = legacy
                    blocker.is_active = False
                    print(f"archived legacy: {blocker.email} -> {legacy}")
                else:
                    print(
                        f"manual review needed: cannot set {email} to {desired} "
                        f"(blocked by id={blocker.id} {blocker.email})",
                    )
                    continue

            old = user.username
            user.username = desired
            fixed += 1
            print(f"renamed: {email} {old} -> {desired}")

        db.commit()
    finally:
        db.close()

    print(f"Done. Usernames fixed: {fixed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

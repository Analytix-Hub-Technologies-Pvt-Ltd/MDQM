#!/usr/bin/env python3
"""Set bcrypt passwords on existing Analytix Hub users (matched by email; never creates users)."""

from __future__ import annotations

import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from settings import load_env  # noqa: E402

load_env()

from auth.seed import sync_demo_user_passwords  # noqa: E402
from database import SessionLocal  # noqa: E402


def main() -> int:
    db = SessionLocal()
    try:
        sync_demo_user_passwords(db)
    finally:
        db.close()
    print("Done. Sign in with the email + password from auth/demo_users.py.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

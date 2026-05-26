#!/usr/bin/env python3
"""Verify all Analytix Hub demo accounts can log in (local API or BASE_URL env)."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from auth.demo_users import DEMO_USERS  # noqa: E402

BASE_URL = os.getenv("MDQM_API_URL", "http://127.0.0.1:8000").rstrip("/")


def try_login(email: str, password: str) -> tuple[bool, str]:
    body = json.dumps({"login": email, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/auth/login",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            role = data.get("user", {}).get("role", "?")
            username = data.get("user", {}).get("username", "?")
            return True, f"OK role={role} username={username}"
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        return False, f"HTTP {exc.code} {detail[:120]}"
    except Exception as exc:
        return False, str(exc)


def main() -> int:
    print(f"API: {BASE_URL}\n")
    failed = 0
    for spec in DEMO_USERS:
        email = spec["email"]
        ok, msg = try_login(email, spec["password"])
        status = "PASS" if ok else "FAIL"
        if not ok:
            failed += 1
        print(f"[{status}] {email} -> {msg}")
    print(f"\n{len(DEMO_USERS) - failed}/{len(DEMO_USERS)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

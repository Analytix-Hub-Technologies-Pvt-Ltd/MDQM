#!/usr/bin/env python3
"""Rewrite backend/requirements.txt as UTF-8 (fixes Windows UTF-16 saves). Run before commit."""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
REQ = BACKEND / "requirements.txt"


def main() -> int:
    raw = REQ.read_bytes()
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        text = raw.decode("utf-16")
    elif b"\x00" in raw[:80]:
        text = raw.decode("utf-16-le")
    else:
        text = raw.decode("utf-8")

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    REQ.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    out = REQ.read_bytes()
    if b"\x00" in out or not out.startswith(b"passlib"):
        print("ERROR: requirements.txt is still not valid UTF-8", file=sys.stderr)
        return 1
    print(f"Fixed {REQ} ({len(lines)} packages, {len(out)} bytes UTF-8)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

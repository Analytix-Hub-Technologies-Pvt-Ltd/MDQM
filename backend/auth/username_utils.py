from sqlalchemy.orm import Session

import models


def sanitize_username(value: str) -> str:
    allowed = "".join(ch for ch in value.lower() if ch.isalnum() or ch in "._")
    return allowed.strip("._")[:64] or "user"


def build_unique_username(db: Session, seed: str) -> str:
    base = sanitize_username(seed)
    candidate = base
    i = 1
    while db.query(models.User).filter(models.User.username == candidate).first():
        suffix = f".{i}"
        candidate = f"{base[: max(1, 64 - len(suffix))]}{suffix}"
        i += 1
    return candidate

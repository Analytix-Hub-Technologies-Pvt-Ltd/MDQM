"""
AES-based encryption for external DB passwords stored on metadata.jobs.source_encrypted_db_pass
(and metadata.db_connections.password).
decryption requires MDQM_DB_SOURCE_MASTER_SECRET on the API host.
Never log decrypted values.
"""

from __future__ import annotations

import base64
import os

_SECRET_ENV = "MDQM_DB_SOURCE_MASTER_SECRET"
_KDF_ITERATIONS = 480_000
_KDF_SALT = b"mdqm-db-src-credentials-v01"


def _master_secret() -> str:
    """Explicit env secret, or a stable local-dev default when not in production."""
    explicit = (os.getenv(_SECRET_ENV) or "").strip()
    if explicit:
        return explicit
    try:
        from settings import is_production

        if is_production():
            return ""
    except Exception:
        pass
    if (os.getenv("RENDER") or "").strip() == "true":
        return ""
    # Lets /db/connect and saved connections work on localhost without extra setup.
    return "mdqm-local-dev-master-secret-do-not-use-in-prod"


def encryption_available() -> bool:
    return bool(_master_secret())


def _fernet() :
    master = _master_secret()
    if not master:
        return None
    from cryptography.fernet import Fernet
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_KDF_SALT,
        iterations=_KDF_ITERATIONS,
        backend=default_backend(),
    )
    key = base64.urlsafe_b64encode(kdf.derive(master.encode("utf-8")))
    return Fernet(key)


def encrypt_db_password_optional(plaintext: str | None) -> str | None:
    """Returns URL-safe ciphertext string or None when unset / crypto disabled / empty password."""
    if not plaintext or str(plaintext).strip() == "":
        return None
    fn = _fernet()
    if fn is None:
        return None
    try:
        token = fn.encrypt(str(plaintext).encode("utf-8"))
        return token.decode("ascii")
    except Exception:
        return None


def decrypt_db_password_optional(blob: str | None) -> str | None:
    """Reverse encrypt_db_password_optional; returns None on missing key, bad token, or empty."""
    if not blob or not str(blob).strip():
        return None
    fn = _fernet()
    if fn is None:
        return None
    try:
        raw = fn.decrypt(str(blob).strip().encode("ascii"))
        return raw.decode("utf-8")
    except Exception:
        return None

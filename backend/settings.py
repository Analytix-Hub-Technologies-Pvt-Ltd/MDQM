"""Deployment and environment settings for local dev and Render."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import quote_plus

_BACKEND_DIR = Path(__file__).resolve().parent

DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://analytix-hub-technologies-pvt-ltd.github.io",
]

GITHUB_PAGES_FRONTEND = "https://analytix-hub-technologies-pvt-ltd.github.io/MDQM/"


def load_env() -> None:
    """Load backend/.env locally. On Render, platform env vars are used as-is."""
    if os.getenv("RENDER"):
        return
    env_path = _BACKEND_DIR / ".env"
    if env_path.is_file():
        from dotenv import load_dotenv

        load_dotenv(env_path, override=False)


def is_production() -> bool:
    return os.getenv("RENDER") == "true" or os.getenv("ENV", "").lower() in (
        "production",
        "prod",
    )


def get_database_url() -> str:
    """Resolve DB URL from Render DATABASE_URL or POSTGRES_* components."""
    url = (os.getenv("DATABASE_URL") or "").strip()
    if url:
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://") :]
        return url

    user = os.getenv("POSTGRES_USER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD", "")
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv("POSTGRES_PORT", "5432")
    database = os.getenv("POSTGRES_DB", "mdms")
    return (
        f"postgresql://{quote_plus(user)}:{quote_plus(password)}"
        f"@{host}:{port}/{database}"
    )


def get_engine_kwargs() -> dict:
    """SQLAlchemy engine options for production PostgreSQL (pool + optional SSL)."""
    kwargs: dict = {"pool_pre_ping": True}
    connect_args: dict = {}

    sslmode = (os.getenv("DATABASE_SSLMODE") or "").strip()
    if not sslmode and is_production():
        database_url = os.getenv("DATABASE_URL", "")
        if database_url and "sslmode=" not in database_url.lower():
            if "render.com" in database_url or os.getenv("DATABASE_SSL", "").lower() in (
                "1",
                "true",
                "yes",
            ):
                sslmode = "require"

    if sslmode:
        connect_args["sslmode"] = sslmode
    if connect_args:
        kwargs["connect_args"] = connect_args
    return kwargs


def get_cors_origins() -> list[str]:
    raw = (os.getenv("CORS_ORIGINS") or "").strip()
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return list(DEFAULT_CORS_ORIGINS)


def get_frontend_base_url() -> str:
    explicit = (os.getenv("MDQM_FRONTEND_URL") or "").strip()
    if explicit:
        return explicit.rstrip("/")
    if is_production():
        return GITHUB_PAGES_FRONTEND.rstrip("/")
    return "http://localhost:5173"

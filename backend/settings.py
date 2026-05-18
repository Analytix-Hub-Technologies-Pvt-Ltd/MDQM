"""Deployment and environment settings for local dev and Render."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import quote_plus, unquote, urlparse

_BACKEND_DIR = Path(__file__).resolve().parent

DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://analytix-hub-technologies-pvt-ltd.github.io",
]

GITHUB_PAGES_FRONTEND = "https://analytix-hub-technologies-pvt-ltd.github.io/MDQM/"

_DEV_DEFAULT_HOST = "127.0.0.1"
_DEV_DEFAULT_PORT = "5432"
_DEV_DEFAULT_USER = "postgres"
_DEV_DEFAULT_DB = "mdms"


def load_env() -> None:
    """Load backend/.env for local dev only. Never override platform env on Render/production."""
    if is_production():
        return
    if (os.getenv("DATABASE_URL") or "").strip():
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


def _normalize_database_url(url: str) -> str:
    url = url.strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    return url


def _build_url(user: str, password: str, host: str, port: str, database: str) -> str:
    return (
        f"postgresql://{quote_plus(user)}:{quote_plus(password)}"
        f"@{host}:{port}/{database}"
    )


def _postgres_components_from_env() -> dict | None:
    host = (os.getenv("POSTGRES_HOST") or "").strip()
    user = (os.getenv("POSTGRES_USER") or "").strip()
    database = (os.getenv("POSTGRES_DB") or "").strip()
    if not (host and user and database):
        return None
    return {
        "host": host,
        "port": (os.getenv("POSTGRES_PORT") or _DEV_DEFAULT_PORT).strip(),
        "user": user,
        "password": os.getenv("POSTGRES_PASSWORD", ""),
        "database": database,
    }


def _postgres_components_from_url(database_url: str) -> dict:
    url = _normalize_database_url(database_url)
    parsed = urlparse(url)
    return {
        "host": parsed.hostname or "",
        "port": str(parsed.port or _DEV_DEFAULT_PORT),
        "user": unquote(parsed.username or _DEV_DEFAULT_USER),
        "password": unquote(parsed.password or "") if parsed.password else "",
        "database": (parsed.path or "").lstrip("/") or _DEV_DEFAULT_DB,
        "url": url,
    }


def get_postgres_config() -> dict:
    """
    Resolve PostgreSQL settings for SQLAlchemy and psycopg2.

    Priority:
      1. DATABASE_URL (Render injects this when Postgres is linked)
      2. POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
      3. Local dev defaults (127.0.0.1) only when not in production
    """
    load_env()

    database_url = (
        (os.getenv("DATABASE_URL") or "").strip()
        or (os.getenv("DATABASE_INTERNAL_URL") or "").strip()
    )
    components = _postgres_components_from_env()

    if database_url:
        cfg = _postgres_components_from_url(database_url)
    elif components:
        cfg = {
            **components,
            "url": _build_url(
                components["user"],
                components["password"],
                components["host"],
                components["port"],
                components["database"],
            ),
        }
    elif is_production():
        raise RuntimeError(
            "Database not configured for production. Link a Render Postgres instance or set "
            "DATABASE_URL, or POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB."
        )
    else:
        cfg = {
            "host": _DEV_DEFAULT_HOST,
            "port": _DEV_DEFAULT_PORT,
            "user": _DEV_DEFAULT_USER,
            "password": os.getenv("POSTGRES_PASSWORD", ""),
            "database": _DEV_DEFAULT_DB,
        }
        cfg["url"] = _build_url(
            cfg["user"], cfg["password"], cfg["host"], cfg["port"], cfg["database"]
        )

    if is_production() and cfg["host"] in ("127.0.0.1", "localhost", "::1"):
        raise RuntimeError(
            "POSTGRES_HOST points to localhost in production. Set DATABASE_URL or Render "
            "POSTGRES_* variables from your linked database."
        )

    return cfg


def get_database_url() -> str:
    return get_postgres_config()["url"]


def get_engine_kwargs() -> dict:
    """SQLAlchemy engine options (pool, timeout, optional SSL via DATABASE_SSLMODE)."""
    kwargs: dict = {"pool_pre_ping": True}
    connect_args: dict = {"connect_timeout": int(os.getenv("DATABASE_CONNECT_TIMEOUT", "10"))}

    database_url = get_postgres_config()["url"]
    sslmode = (os.getenv("DATABASE_SSLMODE") or "").strip()
    # Do not force SSL here — Render internal URLs often omit it; use DATABASE_SSLMODE if needed.
    if sslmode and "sslmode=" not in database_url.lower():
        connect_args["sslmode"] = sslmode

    kwargs["connect_args"] = connect_args
    return kwargs


def log_database_target() -> None:
    """Log DB host (no secrets) so Render deploy logs show the resolved target."""
    import sys

    cfg = get_postgres_config()
    print(
        f"[mdqm] PostgreSQL target: {cfg['host']}:{cfg['port']}/{cfg['database']} (user={cfg['user']})",
        file=sys.stderr,
        flush=True,
    )


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

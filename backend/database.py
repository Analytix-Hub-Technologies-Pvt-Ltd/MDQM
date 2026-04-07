import os
from pathlib import Path
from urllib.parse import quote_plus

from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker


def _load_dotenv() -> None:
    """Load KEY=VALUE lines from backend/.env into os.environ (does not override existing vars)."""
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv()


def _build_database_url() -> str:
    """Prefer DATABASE_URL; else build from POSTGRES_* (password required). Uses 127.0.0.1 to avoid IPv6 ::1 quirks."""
    explicit = os.getenv("DATABASE_URL")
    if explicit:
        return explicit

    password = os.getenv("POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError(
            "PostgreSQL password not set. In PowerShell before uvicorn, run:\n"
            '  $env:POSTGRES_PASSWORD="your_postgres_password"\n'
            "Or set DATABASE_URL to the full postgresql:// connection string."
        )

    user = os.getenv("POSTGRES_USER", "postgres")
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "mdms")

    return (
        f"postgresql://{quote_plus(user)}:{quote_plus(password)}"
        f"@{host}:{port}/{db}"
    )


SQLALCHEMY_DATABASE_URL = _build_database_url()

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def _ensure_pg_schemas() -> None:
    """PostgreSQL requires schemas to exist before create_all() for non-public tables."""
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS metadata"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS quarantine"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS app_data"))


_ensure_pg_schemas()

# Dependency to get DB session in endpoints
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
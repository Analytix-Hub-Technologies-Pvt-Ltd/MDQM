from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from settings import get_engine_kwargs, get_postgres_config, load_env

load_env()

_pg = get_postgres_config()

SQLALCHEMY_DATABASE_URL = _pg["url"]

# Used by /db/* endpoints and metadata checks — always match the app database connection.
POSTGRES_USER = _pg["user"]
POSTGRES_PASSWORD = _pg["password"]
POSTGRES_HOST = _pg["host"]
POSTGRES_PORT = _pg["port"]
POSTGRES_DB = _pg["database"]

engine = create_engine(SQLALCHEMY_DATABASE_URL, **get_engine_kwargs())
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

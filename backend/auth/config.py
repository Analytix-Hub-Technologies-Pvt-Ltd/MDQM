import os
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env so auth settings work in dev
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

JWT_SECRET = os.getenv("JWT_SECRET", "change-this-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))
BOOTSTRAP_SECRET = os.getenv("MDQM_BOOTSTRAP_SECRET", "")
INVITE_EXPIRE_HOURS = int(os.getenv("MDQM_INVITE_EXPIRE_HOURS", "168"))
FRONTEND_BASE_URL = os.getenv("MDQM_FRONTEND_URL", "http://localhost:5173")

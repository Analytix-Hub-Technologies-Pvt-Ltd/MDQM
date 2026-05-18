import os

from settings import get_frontend_base_url, load_env

load_env()

JWT_SECRET = os.getenv("JWT_SECRET", "change-this-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))
BOOTSTRAP_SECRET = os.getenv("MDQM_BOOTSTRAP_SECRET", "")
INVITE_EXPIRE_HOURS = int(os.getenv("MDQM_INVITE_EXPIRE_HOURS", "168"))
FRONTEND_BASE_URL = get_frontend_base_url()

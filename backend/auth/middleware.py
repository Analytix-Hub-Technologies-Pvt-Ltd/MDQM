from starlette.responses import JSONResponse

from auth.security import decode_access_token
from permissions.role_map import normalize_role

PUBLIC_PATHS = {
    "/",
    "/health",
    "/favicon.ico",
    "/auth/login",
    "/auth/bootstrap",
    "/auth/bootstrap-set-password",
    "/auth/complete-invite",
    "/access-request",
    "/docs",
    "/redoc",
    "/openapi.json",
}


def _is_public(path: str) -> bool:
    return path in PUBLIC_PATHS or path.startswith("/docs/")


def _business_user_post_allowed(path: str) -> bool:
    if path == "/api/enterprise/reports/export":
        return True
    if path == "/api/enterprise/business/data-requests":
        return True
    if path == "/api/enterprise/business/alert-subscriptions":
        return True
    if path == "/api/enterprise/business/lineage/seed":
        return True
    if path.startswith("/api/enterprise/notifications/") and path.endswith("/read"):
        return True
    if path == "/rules/add":
        return True
    if path.startswith("/jobs/") and path.endswith("/run"):
        return True
    return False


def _business_user_put_allowed(path: str) -> bool:
    if path.startswith("/rules/"):
        return True
    return False


def _business_user_patch_allowed(path: str) -> bool:
    return path.startswith("/api/enterprise/business/alert-subscriptions/")


def _business_user_delete_allowed(path: str) -> bool:
    if path.startswith("/api/enterprise/business/data-requests/"):
        return True
    if path.startswith("/api/enterprise/business/alert-subscriptions/"):
        return True
    if path.startswith("/rules/"):
        return True
    return False


async def auth_middleware(request, call_next):
    if request.method == "OPTIONS" or _is_public(request.url.path):
        return await call_next(request)

    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)

    token = header[7:].strip()
    try:
        payload = decode_access_token(token)
        request.state.user_id = int(payload["sub"])
        request.state.user_role = normalize_role(payload.get("role", "business_user"))
    except Exception:
        return JSONResponse({"detail": "Invalid or expired token"}, status_code=401)

    if request.state.user_role == "BUSINESS_USER" and request.method not in ("GET", "HEAD"):
        path = str(request.url.path)
        if request.method == "POST" and _business_user_post_allowed(path):
            return await call_next(request)
        if request.method == "DELETE" and _business_user_delete_allowed(path):
            return await call_next(request)
        if request.method == "PATCH" and _business_user_patch_allowed(path):
            return await call_next(request)
        if request.method == "PUT" and _business_user_put_allowed(path):
            return await call_next(request)
        return JSONResponse({"detail": "Business user role is read-only"}, status_code=403)

    return await call_next(request)

from starlette.responses import JSONResponse

from auth.security import decode_access_token

PUBLIC_PATHS = {
    "/",
    "/favicon.ico",
    "/auth/login",
    "/auth/bootstrap",
    "/auth/complete-invite",
    "/access-request",
    "/docs",
    "/redoc",
    "/openapi.json",
}


def _is_public(path: str) -> bool:
    return path in PUBLIC_PATHS or path.startswith("/docs/")


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
        request.state.user_role = payload.get("role", "user")
    except Exception:
        return JSONResponse({"detail": "Invalid or expired token"}, status_code=401)

    if request.state.user_role == "viewer" and request.method not in ("GET", "HEAD"):
        return JSONResponse({"detail": "Viewer role is read-only"}, status_code=403)

    return await call_next(request)

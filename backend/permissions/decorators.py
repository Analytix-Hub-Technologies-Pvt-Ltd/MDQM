from functools import wraps

from fastapi import HTTPException, Request

from permissions.access_control import has_permission


def permission_required(permission: str):
    def _decorator(func):
        @wraps(func)
        async def _wrapper(*args, **kwargs):
            request: Request | None = kwargs.get("request")
            if request is None:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break
            if request is None:
                raise HTTPException(status_code=500, detail="Request object missing")
            role = getattr(request.state, "user_role", "BUSINESS_USER")
            if not has_permission(role, permission):
                raise HTTPException(status_code=403, detail="Permission denied")
            return await func(*args, **kwargs)

        return _wrapper

    return _decorator

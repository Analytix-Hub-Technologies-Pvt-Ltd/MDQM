from fastapi import HTTPException

from permissions.role_map import ROLE_PERMISSION_MAP, Roles, normalize_role


def has_permission(role: str, permission: str) -> bool:
    normalized = normalize_role(role)
    return permission in ROLE_PERMISSION_MAP.get(normalized, ROLE_PERMISSION_MAP[Roles.BUSINESS_USER])


def require_permission(role: str, permission: str):
    if not has_permission(role, permission):
        raise HTTPException(status_code=403, detail=f"Permission denied: {permission}")


def require_any_permission(role: str, *permissions: str):
    if not permissions:
        return
    if not any(has_permission(role, p) for p in permissions):
        raise HTTPException(status_code=403, detail="Permission denied")


def can_access_dataset(role: str, owner_id: int | None, user_id: int, pii: bool = False) -> bool:
    normalized = normalize_role(role)
    if normalized == Roles.ADMIN:
        return True
    if pii and normalized in {Roles.BUSINESS_USER, Roles.ANALYST}:
        return False
    if owner_id is not None and owner_id == user_id:
        return True
    return normalized in {Roles.CDO, Roles.DATA_STEWARD, Roles.AUDITOR}

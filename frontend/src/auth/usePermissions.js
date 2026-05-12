import { useMemo } from "react";
import { useAuth } from "./AuthContext";
import { normalizeRole, permissionsForRole } from "./rolePermissions";

export function usePermissions() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const permissions = useMemo(() => new Set(permissionsForRole(role)), [role]);

  const hasPermission = (permission) => permissions.has(permission);
  const canAccess = (required = []) => {
    const requiredList = Array.isArray(required) ? required : [required];
    if (requiredList.length === 0) return true;
    return requiredList.every((permission) => hasPermission(permission));
  };

  return { role, permissions, hasPermission, canAccess };
}

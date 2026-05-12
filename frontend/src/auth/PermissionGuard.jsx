import { Navigate } from "react-router-dom";
import { usePermissions } from "./usePermissions";

export default function PermissionGuard({
  require = [],
  fallback = null,
  redirectTo = "/dashboard",
  children,
}) {
  const { canAccess } = usePermissions();
  if (canAccess(require)) return children;
  if (fallback) return fallback;
  return <Navigate to={redirectTo} replace />;
}

import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ROLES, normalizeRole } from "../auth/rolePermissions";
import GovernancePage from "./GovernancePage";

/**
 * Data owners already have the same tools on /dashboard — avoid a second copy.
 * Admin and CDO use /governance for catalog/policy/report management.
 */
export default function GovernanceRoute() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);

  if (role === ROLES.DATA_OWNER) {
    return <Navigate to="/dashboard?tab=datasets" replace />;
  }

  return <GovernancePage />;
}

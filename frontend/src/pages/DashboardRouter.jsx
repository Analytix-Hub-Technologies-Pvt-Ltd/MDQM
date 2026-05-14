import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import { ROLES, normalizeRole } from "../auth/rolePermissions";
import AdminDashboard from "./dashboards/AdminDashboard";
import CdoDashboard from "./dashboards/CdoDashboard";
import StewardDashboard from "./dashboards/StewardDashboard";
import OwnerDashboard from "./dashboards/OwnerDashboard";
import DeveloperDashboard from "./dashboards/DeveloperDashboard";
import AuditorDashboard from "./dashboards/AuditorDashboard";
import AnalystDashboard from "./dashboards/AnalystDashboard";
import BusinessUserDashboard from "./dashboards/BusinessUserDashboard";

export default function DashboardRouter() {
  const { user } = useAuth();
  const role = useMemo(() => normalizeRole(user?.role), [user?.role]);

  const componentByRole = {
    [ROLES.ADMIN]: <AdminDashboard />,
    [ROLES.CDO]: <CdoDashboard />,
    [ROLES.DATA_STEWARD]: <StewardDashboard />,
    [ROLES.DATA_OWNER]: <OwnerDashboard />,
    [ROLES.DEVELOPER]: <DeveloperDashboard />,
    [ROLES.AUDITOR]: <AuditorDashboard />,
    [ROLES.ANALYST]: <AnalystDashboard />,
    [ROLES.BUSINESS_USER]: <BusinessUserDashboard />,
  };

  return componentByRole[role] || <BusinessUserDashboard />;
}

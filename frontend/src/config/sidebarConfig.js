import {
  LayoutDashboard,
  Workflow,
  ShieldCheck,
  DatabaseZap,
  Landmark,
  ClipboardCheck,
  FileBarChart,
  Settings,
  Network,
  UserCheck,
  History,
} from "lucide-react";
import { PERMISSIONS } from "../auth/permissions";
import { ROLES } from "../auth/rolePermissions";

export const SIDEBAR_CONFIG = {
  [ROLES.ADMIN]: [
    { group: "Core", items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Jobs", path: "/jobs", icon: Workflow, permission: PERMISSIONS.JOBS_VIEW },
      { label: "Rules", path: "/rules", icon: ShieldCheck, permission: PERMISSIONS.RULES_VIEW },
      { label: "Quarantine", path: "/quarantine", icon: DatabaseZap, permission: PERMISSIONS.QUARANTINE_VIEW },
    ] },
    { group: "Governance", items: [
      { label: "Governance", path: "/governance", icon: Landmark, permission: PERMISSIONS.GOVERNANCE_VIEW },
      { label: "Compliance", path: "/compliance", icon: ClipboardCheck, permission: PERMISSIONS.COMPLIANCE_VIEW },
      { label: "View Logs", path: "/audit", icon: History, permission: PERMISSIONS.AUDIT_VIEW },
      { label: "Reports", path: "/reports", icon: FileBarChart, permission: PERMISSIONS.REPORTS_VIEW },
      { label: "Admin", path: "/admin", icon: Settings, permission: PERMISSIONS.ADMIN_VIEW },
    ] },
  ],
  [ROLES.CDO]: [
    { group: "Governance", items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Governance", path: "/governance", icon: Landmark, permission: PERMISSIONS.GOVERNANCE_VIEW },
      { label: "Compliance", path: "/compliance", icon: ClipboardCheck, permission: PERMISSIONS.COMPLIANCE_VIEW },
      { label: "Reports", path: "/reports", icon: FileBarChart, permission: PERMISSIONS.REPORTS_VIEW },
      { label: "Lineage", path: "/lineage", icon: Network, permission: PERMISSIONS.LINEAGE_VIEW },
    ] },
  ],
  [ROLES.DATA_STEWARD]: [
    { group: "Stewardship", items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Data Quality", path: "/jobs", icon: Workflow, permission: PERMISSIONS.JOBS_VIEW },
      { label: "Rules", path: "/rules", icon: ShieldCheck, permission: PERMISSIONS.RULES_VIEW },
      { label: "Stewardship", path: "/stewardship", icon: UserCheck, permission: PERMISSIONS.STEWARDSHIP_VIEW },
      { label: "Quarantine", path: "/quarantine", icon: DatabaseZap, permission: PERMISSIONS.QUARANTINE_VIEW },
    ] },
  ],
  [ROLES.DATA_OWNER]: [
    { group: "Ownership", items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Governance", path: "/governance", icon: Landmark, permission: PERMISSIONS.GOVERNANCE_VIEW },
      { label: "Compliance", path: "/compliance", icon: ClipboardCheck, permission: PERMISSIONS.COMPLIANCE_VIEW },
      { label: "Reports", path: "/reports", icon: FileBarChart, permission: PERMISSIONS.REPORTS_VIEW },
    ] },
  ],
  [ROLES.DEVELOPER]: [
    { group: "Engineering", items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Jobs", path: "/jobs", icon: Workflow, permission: PERMISSIONS.JOBS_VIEW },
      { label: "Rules", path: "/rules", icon: ShieldCheck, permission: PERMISSIONS.RULES_VIEW },
      { label: "Lineage", path: "/lineage", icon: Network, permission: PERMISSIONS.LINEAGE_VIEW },
    ] },
  ],
  [ROLES.AUDITOR]: [
    { group: "Audit", items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Audit Logs", path: "/audit", icon: History, permission: PERMISSIONS.AUDIT_VIEW },
      { label: "Compliance", path: "/compliance", icon: ClipboardCheck, permission: PERMISSIONS.COMPLIANCE_VIEW },
      { label: "Reports", path: "/reports", icon: FileBarChart, permission: PERMISSIONS.REPORTS_VIEW },
    ] },
  ],
  [ROLES.ANALYST]: [
    { group: "Analytics", items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Reports", path: "/reports", icon: FileBarChart, permission: PERMISSIONS.REPORTS_VIEW },
      { label: "Jobs", path: "/jobs", icon: Workflow, permission: PERMISSIONS.JOBS_VIEW },
    ] },
  ],
  [ROLES.VIEWER]: [
    { group: "Read Only", items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Reports", path: "/reports", icon: FileBarChart, permission: PERMISSIONS.REPORTS_VIEW },
    ] },
  ],
};

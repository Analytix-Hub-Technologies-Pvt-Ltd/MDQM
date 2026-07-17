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
  LibraryBig,
  Sparkles,
  BookMarked,
  Share2,
  TriangleAlert,
  Bell,
  Inbox,
  Database,
  Sheet,
  FileText,
  BarChart3,
  Award,
} from "lucide-react";
import { PERMISSIONS } from "../auth/permissions";
import { ROLES } from "../auth/rolePermissions";

export const SIDEBAR_CONFIG = {
  [ROLES.ADMIN]: [
    { group: "Core", items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "DB Connections", path: "/connections", icon: Database, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Rules", path: "/rules", icon: ShieldCheck, permission: PERMISSIONS.RULES_VIEW },
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
      { label: "DB Connections", path: "/connections", icon: Database, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Governance", path: "/governance", icon: Landmark, permission: PERMISSIONS.GOVERNANCE_VIEW },
      { label: "Compliance", path: "/compliance", icon: ClipboardCheck, permission: PERMISSIONS.COMPLIANCE_VIEW },
      { label: "Reports", path: "/reports", icon: FileBarChart, permission: PERMISSIONS.REPORTS_VIEW },
      { label: "Lineage", path: "/lineage", icon: Network, permission: PERMISSIONS.LINEAGE_VIEW },
    ] },
  ],
  [ROLES.DATA_STEWARD]: [
    { group: "Stewardship", items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Data Catalog", path: "/dashboard?tab=catalog", icon: LibraryBig, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "DB Connections", path: "/connections", icon: Database, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Rules", path: "/rules", icon: ShieldCheck, permission: PERMISSIONS.RULES_VIEW },
      { label: "Stewardship", path: "/stewardship", icon: UserCheck, permission: PERMISSIONS.STEWARDSHIP_VIEW },
      { label: "Quarantine", path: "/quarantine", icon: DatabaseZap, permission: PERMISSIONS.QUARANTINE_VIEW },
    ] },
  ],
  [ROLES.DATA_OWNER]: [
    { group: "Governance desk", items: [
      { label: "Overview", path: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "DB Connections", path: "/connections", icon: Database, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Datasets", path: "/dashboard?tab=datasets", icon: Sheet, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Policies", path: "/dashboard?tab=policies", icon: FileText, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Glossary", path: "/dashboard?tab=glossary", icon: BookMarked, permission: PERMISSIONS.GOVERNANCE_VIEW },
      { label: "Business reports", path: "/dashboard?tab=business-reports", icon: BarChart3, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Access Requests", path: "/dashboard?tab=access-requests", icon: Inbox, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Certifications", path: "/dashboard?tab=certifications", icon: Award, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Lineage", path: "/dashboard?tab=lineage", icon: Share2, permission: PERMISSIONS.DASHBOARD_VIEW },
    ] },
    { group: "More", items: [
      { label: "Compliance", path: "/compliance", icon: ClipboardCheck, permission: PERMISSIONS.COMPLIANCE_VIEW },
      { label: "Reports", path: "/reports", icon: FileBarChart, permission: PERMISSIONS.REPORTS_VIEW },
    ] },
  ],
  [ROLES.DEVELOPER]: [
    { group: "Engineering", items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "DB Connections", path: "/connections", icon: Database, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Rules", path: "/rules", icon: ShieldCheck, permission: PERMISSIONS.RULES_VIEW },
      { label: "Lineage", path: "/lineage", icon: Network, permission: PERMISSIONS.LINEAGE_VIEW },
    ] },
  ],
  [ROLES.AUDITOR]: [
    { group: "Audit", items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "DB Connections", path: "/connections", icon: Database, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Audit Logs", path: "/audit", icon: History, permission: PERMISSIONS.AUDIT_VIEW },
      { label: "Compliance", path: "/compliance", icon: ClipboardCheck, permission: PERMISSIONS.COMPLIANCE_VIEW },
      { label: "Reports", path: "/reports", icon: FileBarChart, permission: PERMISSIONS.REPORTS_VIEW },
    ] },
  ],
  [ROLES.ANALYST]: [
    { group: "Analytics", items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Reports", path: "/reports", icon: FileBarChart, permission: PERMISSIONS.REPORTS_VIEW },
      { label: "DB Connections", path: "/connections", icon: Database, permission: PERMISSIONS.DASHBOARD_VIEW },
    ] },
  ],
  [ROLES.BUSINESS_USER]: [
    { group: "Workspace", items: [
      { label: "Overview", path: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Data catalog", path: "/dashboard?tab=catalog", icon: LibraryBig, permission: PERMISSIONS.GOVERNANCE_VIEW },
      { label: "Quality", path: "/dashboard?tab=quality", icon: Sparkles, permission: PERMISSIONS.RULES_VIEW },
      { label: "DB Connections", path: "/connections", icon: Database, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Glossary", path: "/dashboard?tab=glossary", icon: BookMarked, permission: PERMISSIONS.GOVERNANCE_VIEW },
      { label: "Data flow", path: "/dashboard?tab=lineage", icon: Share2, permission: PERMISSIONS.LINEAGE_VIEW },
      { label: "My reports", path: "/dashboard?tab=reports", icon: FileBarChart, permission: PERMISSIONS.REPORTS_VIEW },
      { label: "Alerts", path: "/dashboard?tab=alerts", icon: Bell, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: "Compliance", path: "/dashboard?tab=compliance", icon: ClipboardCheck, permission: PERMISSIONS.COMPLIANCE_VIEW },
      { label: "Issues", path: "/dashboard?tab=issues", icon: TriangleAlert, permission: PERMISSIONS.STEWARDSHIP_VIEW },
    ] },
  ],
};

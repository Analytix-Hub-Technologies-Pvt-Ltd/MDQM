import { Link } from "react-router-dom";
import EnterpriseDataPanel, { StatusBadge } from "../../../components/enterprise/EnterpriseDataPanel";
import {
  enterpriseAuditAccess,
  enterpriseComplianceReports,
  enterpriseReportsExports,
  enterpriseSecurityEvents,
} from "../enterpriseApi";
import { getAuditLogsPaged } from "../enterpriseApi";

const auditCols = [
  { key: "id", label: "ID" },
  { key: "action", label: "Action" },
  { key: "actor_name", label: "Actor" },
  { key: "entity_type", label: "Entity" },
  { key: "created_at", label: "When" },
];

const accessCols = [
  { key: "id", label: "ID" },
  { key: "resource", label: "Resource" },
  { key: "action", label: "Action" },
  { key: "user_id", label: "User" },
  { key: "created_at", label: "When" },
];

const secCols = [
  { key: "id", label: "ID" },
  { key: "action", label: "Action" },
  { key: "resource", label: "Resource" },
  { key: "created_at", label: "When" },
];

const compCols = [
  { key: "title", label: "Title" },
  { key: "framework", label: "Framework", render: (v) => <StatusBadge status={v} /> },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
  { key: "created_at", label: "Created" },
];

export function renderAuditorTab(tabId) {
  switch (tabId) {
    case "audit-trail":
      return (
        <div className="space-y-3">
          <EnterpriseDataPanel
            title="Governance audit log (recent)"
            columns={auditCols}
            fetchPage={async ({ page, pageSize }) => getAuditLogsPaged({ page, pageSize })}
          />
          <Link to="/audit" className="text-sm text-[#4f8cff] hover:underline">
            Open full View Logs →
          </Link>
        </div>
      );
    case "compliance":
      return (
        <EnterpriseDataPanel
          title="Compliance reports"
          columns={compCols}
          fetchPage={({ page, pageSize }) => enterpriseComplianceReports({ page, page_size: pageSize })}
        />
      );
    case "pii":
      return (
        <div className="enterprise-card p-5 text-sm text-[#9ab0d1]">
          <h3 className="enterprise-title mb-2">PII registry</h3>
          <p>Field-level PII classification is tracked in governance workflows. Use Compliance for evidence packs.</p>
          <Link to="/compliance" className="text-[#4f8cff] hover:underline">
            Compliance →
          </Link>
        </div>
      );
    case "reports":
      return (
        <EnterpriseDataPanel
          title="Report exports"
          columns={[
            { key: "id", label: "ID" },
            { key: "report_type", label: "Type" },
            { key: "format", label: "Format" },
            { key: "created_at", label: "Created" },
          ]}
          fetchPage={({ page, pageSize }) => enterpriseReportsExports({ page, page_size: pageSize })}
        />
      );
    case "access-logs":
      return (
        <EnterpriseDataPanel
          title="Access logs"
          columns={accessCols}
          searchPlaceholder="Resource contains…"
          fetchPage={({ page, pageSize, query }) =>
            enterpriseAuditAccess({
              page,
              page_size: pageSize,
              ...(query ? { resource: query } : {}),
            })
          }
        />
      );
    case "security-events":
      return (
        <EnterpriseDataPanel
          title="Security-oriented events"
          columns={secCols}
          fetchPage={({ page, pageSize }) => enterpriseSecurityEvents({ page, page_size: pageSize })}
        />
      );
    default:
      return null;
  }
}

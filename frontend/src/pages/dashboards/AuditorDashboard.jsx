import EnterpriseDashboardShell from "../../components/enterprise/EnterpriseDashboardShell";
import ClassicKpiSection from "./ClassicKpiSection";
import RoleDashboardCore from "./RoleDashboardCore";
import { renderAuditorTab } from "./panels/AuditorPanels";

const TABS = [
  { id: "audit-trail", label: "Audit Trail" },
  { id: "compliance", label: "Compliance" },
  { id: "pii", label: "PII" },
  { id: "reports", label: "Reports" },
  { id: "access-logs", label: "Access Logs" },
  { id: "security-events", label: "Security Events" },
];

export default function AuditorDashboard() {
  return (
    <EnterpriseDashboardShell
      title="Auditor Compliance Console"
      subtitle="Audit evidence, access traces, and policy exceptions across domains."
      accent="blue"
      tabs={TABS}
      overview={<RoleDashboardCore endpoint="auditor" />}
      renderTab={renderAuditorTab}
      footer={<ClassicKpiSection defaultOpen />}
      footerOnOverviewOnly
    />
  );
}

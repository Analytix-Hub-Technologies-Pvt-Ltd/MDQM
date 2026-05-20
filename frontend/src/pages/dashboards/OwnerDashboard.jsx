import EnterpriseDashboardShell from "../../components/enterprise/EnterpriseDashboardShell";
import ClassicKpiSection from "./ClassicKpiSection";
import RoleDashboardCore from "./RoleDashboardCore";
import { renderOwnerTab } from "./panels/OwnerPanels";

const TABS = [
  { id: "datasets", label: "Datasets" },
  { id: "policies", label: "Policies" },
  { id: "glossary", label: "Glossary" },
  { id: "business-reports", label: "Business reports" },
  { id: "access-requests", label: "Access Requests" },
  { id: "certifications", label: "Certifications" },
  { id: "lineage", label: "Lineage" },
];

export default function OwnerDashboard() {
  return (
    <EnterpriseDashboardShell
      title="Data Owner Governance Desk"
      subtitle="Ownership approvals, certification status, and governance exceptions."
      accent="blue"
      tabs={TABS}
      overview={<RoleDashboardCore endpoint="owner" />}
      renderTab={renderOwnerTab}
      footer={<ClassicKpiSection />}
    />
  );
}

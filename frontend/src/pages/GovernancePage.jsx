import EnterpriseDashboardShell from "../components/enterprise/EnterpriseDashboardShell";
import { renderOwnerTab } from "./dashboards/panels/OwnerPanels";

const TABS = [
  { id: "datasets", label: "Datasets" },
  { id: "policies", label: "Policies" },
  { id: "glossary", label: "Glossary" },
  { id: "business-reports", label: "Business reports" },
  { id: "access-requests", label: "Access requests" },
  { id: "certifications", label: "Certifications" },
  { id: "lineage", label: "Lineage" },
];

/** Admin/CDO metadata workspace — no extra “overview” screen; opens on Datasets. */
export default function GovernancePage() {
  return (
    <EnterpriseDashboardShell
      title="Governance"
      subtitle="Metadata catalog and policy management."
      accent="blue"
      showOverview={false}
      defaultTab="datasets"
      tabs={TABS}
      renderTab={renderOwnerTab}
    />
  );
}

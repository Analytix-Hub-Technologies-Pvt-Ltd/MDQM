import EnterpriseDashboardShell from "../../components/enterprise/EnterpriseDashboardShell";
import BusinessUserOverview from "../../components/business/BusinessUserOverview";
import { renderBusinessUserTab } from "./panels/BusinessUserPanels";

const TABS = [
  { id: "catalog", label: "Data Catalog" },
  { id: "quality", label: "Quality" },
  { id: "glossary", label: "Glossary" },
  { id: "lineage", label: "Data flow" },
  { id: "reports", label: "My reports" },
  { id: "compliance", label: "Compliance" },
  { id: "issues", label: "Issues" },
  { id: "requests", label: "Data requests" },
  { id: "alerts", label: "Alerts" },
];

export default function BusinessUserDashboard() {
  return (
    <EnterpriseDashboardShell
      title="Business user workspace"
      subtitle="Catalog, quality scores, glossary, lineage, reports, and self-service data access."
      accent="teal"
      overviewLabel="Overview"
      tabs={TABS}
      overview={<BusinessUserOverview />}
      renderTab={renderBusinessUserTab}
      hideTabBar
    />
  );
}

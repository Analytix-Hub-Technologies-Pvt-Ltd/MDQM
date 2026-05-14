import EnterpriseDashboardShell from "../../components/enterprise/EnterpriseDashboardShell";
import ClassicKpiSection from "./ClassicKpiSection";
import RoleDashboardCore from "./RoleDashboardCore";
import { BusinessUserOverviewExtra, renderBusinessUserTab } from "./panels/BusinessUserPanels";

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
      subtitle="Read-only catalog, glossary, quality results, lineage, and self-service access requests backed by enterprise APIs."
      accent="teal"
      overviewLabel="Overview"
      tabs={TABS}
      overview={
        <div className="space-y-6">
          <RoleDashboardCore endpoint="business-user" />
          <BusinessUserOverviewExtra />
        </div>
      }
      renderTab={renderBusinessUserTab}
      footer={<ClassicKpiSection />}
      hideTabBar
    />
  );
}

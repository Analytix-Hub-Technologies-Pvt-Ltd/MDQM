import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import EnterpriseDashboardShell from "../../components/enterprise/EnterpriseDashboardShell";
import BusinessUserOverview from "../../components/business/BusinessUserOverview";
import ClassicKpiSection from "./ClassicKpiSection";
import { renderBusinessUserTab } from "./panels/BusinessUserPanels";

const TABS = [
  { id: "catalog", label: "Data Catalog" },
  { id: "quality", label: "Quality" },
  { id: "glossary", label: "Glossary" },
  { id: "lineage", label: "Data flow" },
  { id: "reports", label: "My reports" },
  { id: "alerts", label: "Alerts" },
  { id: "compliance", label: "Compliance" },
  { id: "issues", label: "Issues" },
];

export default function BusinessUserDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("tab") !== "requests") return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", "catalog");
    const ds = searchParams.get("dataset");
    if (ds) next.set("openRequest", ds);
    next.delete("dataset");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <EnterpriseDashboardShell
      title="Business user workspace"
      subtitle="Catalog, quality scores, glossary, lineage, reports, and self-service data access."
      accent="teal"
      overviewLabel="Overview"
      tabs={TABS}
      overview={<BusinessUserOverview />}
      renderTab={renderBusinessUserTab}
      footer={<ClassicKpiSection defaultOpen />}
      footerOnOverviewOnly
      hideTabBar
    />
  );
}

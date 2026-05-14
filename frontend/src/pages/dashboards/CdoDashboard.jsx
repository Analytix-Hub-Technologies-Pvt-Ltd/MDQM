import EnterpriseDashboardShell from "../../components/enterprise/EnterpriseDashboardShell";
import ClassicKpiSection from "./ClassicKpiSection";
import RoleDashboardCore from "./RoleDashboardCore";
import CdoInsightsPanel from "./CdoInsightsPanel";
import { renderCdoTab } from "./panels/CdoPanels";

const TABS = [
  { id: "roi", label: "ROI" },
  { id: "compliance", label: "Compliance" },
  { id: "dq-trends", label: "DQ Trends" },
  { id: "domain-health", label: "Domain Health" },
  { id: "risk-metrics", label: "Risk Metrics" },
  { id: "analytics", label: "Analytics" },
];

export default function CdoDashboard() {
  return (
    <EnterpriseDashboardShell
      title="CDO Governance Console"
      subtitle="Enterprise quality, stewardship outcomes, compliance posture, and domain health."
      accent="violet"
      overviewLabel="Executive Overview"
      tabs={TABS}
      overview={
        <RoleDashboardCore endpoint="cdo">
          <CdoInsightsPanel />
        </RoleDashboardCore>
      }
      renderTab={renderCdoTab}
      footer={<ClassicKpiSection />}
    />
  );
}

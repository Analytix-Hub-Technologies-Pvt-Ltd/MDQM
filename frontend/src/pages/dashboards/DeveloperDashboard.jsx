import EnterpriseDashboardShell from "../../components/enterprise/EnterpriseDashboardShell";
import ClassicKpiSection from "./ClassicKpiSection";
import RoleDashboardCore from "./RoleDashboardCore";
import { renderDeveloperTab } from "./panels/DeveloperPanels";

const TABS = [
  { id: "apis", label: "APIs" },
  { id: "pipelines", label: "Pipelines" },
  { id: "scheduler", label: "Scheduler" },
  { id: "monitoring", label: "Monitoring" },
  { id: "job-history", label: "Job History" },
  { id: "logs", label: "Logs" },
  { id: "notifications", label: "Notifications" },
  { id: "settings", label: "Settings" },
];

export default function DeveloperDashboard() {
  return (
    <EnterpriseDashboardShell
      title="Developer Reliability Board"
      subtitle="API health, scheduler state, integrations, and release metrics."
      accent="blue"
      tabs={TABS}
      overview={<RoleDashboardCore endpoint="developer" />}
      renderTab={renderDeveloperTab}
      footer={<ClassicKpiSection defaultOpen />}
      footerOnOverviewOnly
    />
  );
}

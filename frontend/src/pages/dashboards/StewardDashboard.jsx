import EnterpriseDashboardShell from "../../components/enterprise/EnterpriseDashboardShell";
import ClassicKpiSection from "./ClassicKpiSection";
import RoleDashboardCore from "./RoleDashboardCore";
import StewardWorkQueuePanel from "./StewardWorkQueuePanel";
import { renderStewardTab } from "./panels/StewardPanels";

const TABS = [
  { id: "rules", label: "Rules" },
  { id: "validation", label: "Validation" },
  { id: "quarantine", label: "Quarantine" },
  { id: "issues", label: "Issues" },
  { id: "matching", label: "Matching" },
  { id: "tasks", label: "Tasks" },
  { id: "reports", label: "Reports" },
];

export default function StewardDashboard() {
  return (
    <EnterpriseDashboardShell
      title="Data Steward Workspace"
      subtitle="Validation failures, quarantine load, remediation workflow, and stewardship queues."
      accent="teal"
      tabs={TABS}
      overview={
        <RoleDashboardCore endpoint="steward">
          <StewardWorkQueuePanel />
        </RoleDashboardCore>
      }
      renderTab={renderStewardTab}
      footer={<ClassicKpiSection defaultOpen />}
      footerOnOverviewOnly
    />
  );
}

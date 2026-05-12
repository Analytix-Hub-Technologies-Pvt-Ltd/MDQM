import BaseRoleDashboard from "./BaseRoleDashboard";
import StewardWorkQueuePanel from "./StewardWorkQueuePanel";

export default function StewardDashboard() {
  return (
    <BaseRoleDashboard
      endpoint="steward"
      title="Data Steward Workspace"
      subtitle="Validation failures, quarantine load, remediation workflow, and stewardship queues."
      accent="teal"
    >
      <StewardWorkQueuePanel />
    </BaseRoleDashboard>
  );
}

import BaseRoleDashboard from "./BaseRoleDashboard";

export default function ViewerDashboard() {
  return <BaseRoleDashboard endpoint="viewer" title="Viewer Summary" subtitle="Read-only quality snapshots and approved enterprise reports." />;
}

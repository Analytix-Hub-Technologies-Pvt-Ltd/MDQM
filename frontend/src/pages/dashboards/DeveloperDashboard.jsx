import BaseRoleDashboard from "./BaseRoleDashboard";

export default function DeveloperDashboard() {
  return <BaseRoleDashboard endpoint="developer" title="Developer Reliability Board" subtitle="API health, scheduler state, integrations, and release metrics." />;
}

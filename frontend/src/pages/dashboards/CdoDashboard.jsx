import BaseRoleDashboard from "./BaseRoleDashboard";
import CdoInsightsPanel from "./CdoInsightsPanel";

export default function CdoDashboard() {
  return (
    <BaseRoleDashboard
      endpoint="cdo"
      title="CDO Governance Console"
      subtitle="Enterprise quality, stewardship outcomes, compliance posture, and domain health."
      accent="violet"
    >
      <CdoInsightsPanel />
    </BaseRoleDashboard>
  );
}

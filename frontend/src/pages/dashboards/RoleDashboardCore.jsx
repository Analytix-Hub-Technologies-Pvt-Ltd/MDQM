import { useEffect, useState } from "react";
import { getRoleDashboard } from "../../api";
import KPIWidget from "../../components/widgets/KPIWidget";
import TrendChart from "../../components/widgets/TrendChart";
import StatusCard from "../../components/widgets/StatusCard";
import PipelineWidget from "../../components/widgets/PipelineWidget";
import GovernanceScoreWidget from "../../components/widgets/GovernanceScoreWidget";
import DataQualityWidget from "../../components/widgets/DataQualityWidget";
import AuditWidget from "../../components/widgets/AuditWidget";

/**
 * Core KPI / trend / health strip used inside tabbed enterprise dashboards (Overview tab).
 */
export default function RoleDashboardCore({ endpoint, accent = "blue", children = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setError("");
      setLoading(true);
      try {
        const res = await getRoleDashboard(endpoint);
        if (active) setData(res.data);
      } catch (e) {
        if (active) {
          setData({});
          setError(e?.response?.data?.detail || "Could not load dashboard data");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [endpoint]);

  if (loading) {
    return (
      <div className="enterprise-card p-8 text-center text-sm text-[#9ab0d1] animate-pulse">
        Loading overview metrics…
      </div>
    );
  }

  const kpis = Array.isArray(data?.kpis) ? data.kpis : [];
  const trends = Array.isArray(data?.trends) ? data.trends : [];

  return (
    <div className="space-y-6">
      {error ? <div className="text-sm text-amber-400 border border-amber-500/30 rounded-md px-3 py-2">{error}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.length ? (
          kpis.map((kpi, idx) => (
            <KPIWidget key={`${kpi.title || "kpi"}-${idx}`} title={kpi.title} value={kpi.value} subtitle={kpi.subtitle} tone={kpi.tone} />
          ))
        ) : (
          <div className="enterprise-card p-6 col-span-full text-center text-sm text-[#7f95b6]">No KPI snapshots available yet.</div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TrendChart title="Performance Trend" data={trends} />
        <PipelineWidget pipelines={data?.pipelines || []} />
      </div>

      {children ? <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{children}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard label="System Health" status={data?.system_health || "Healthy"} description="Current platform operating state." />
        <GovernanceScoreWidget score={data?.governance_score || 0} />
        <DataQualityWidget metrics={data?.data_quality || {}} />
      </div>

      <AuditWidget entries={data?.audit_events || []} />
    </div>
  );
}

import { useEffect, useState } from "react";
import { getRoleDashboard } from "../../api";
import KPIWidget from "../../components/widgets/KPIWidget";
import TrendChart from "../../components/widgets/TrendChart";
import StatusCard from "../../components/widgets/StatusCard";
import PipelineWidget from "../../components/widgets/PipelineWidget";
import GovernanceScoreWidget from "../../components/widgets/GovernanceScoreWidget";
import DataQualityWidget from "../../components/widgets/DataQualityWidget";
import AuditWidget from "../../components/widgets/AuditWidget";
import ClassicKpiSection from "./ClassicKpiSection";

export default function BaseRoleDashboard({ endpoint, title, subtitle, accent = "blue", children = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await getRoleDashboard(endpoint);
        if (active) setData(res.data);
      } catch {
        if (active) setData({});
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [endpoint]);

  if (loading) return <div className="p-8 text-sm text-slate-300">Loading role dashboard...</div>;

  const kpis = Array.isArray(data?.kpis) ? data.kpis : [];
  const trends = Array.isArray(data?.trends) ? data.trends : [];

  const accentClass = accent === "violet" ? "from-[#8b5cf6] to-[#4f8cff]" : accent === "teal" ? "from-[#2dd4bf] to-[#4f8cff]" : "from-[#4f8cff] to-[#8b5cf6]";

  return (
    <section className="p-6 space-y-6">
      <header className={`enterprise-card p-5 border-none bg-gradient-to-r ${accentClass}`}>
        <h1 className="text-2xl text-white">{title}</h1>
        <p className="text-sm text-blue-100 mt-1">{subtitle}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => (
          <KPIWidget key={`${kpi.title || "kpi"}-${idx}`} title={kpi.title} value={kpi.value} subtitle={kpi.subtitle} tone={kpi.tone} />
        ))}
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

      <ClassicKpiSection defaultOpen />
    </section>
  );
}

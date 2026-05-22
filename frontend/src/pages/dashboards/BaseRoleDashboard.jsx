import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getRoleDashboard } from "../../api";
import KPIWidget from "../../components/widgets/KPIWidget";
import TrendChart from "../../components/widgets/TrendChart";
import StatusCard from "../../components/widgets/StatusCard";
import PipelineWidget from "../../components/widgets/PipelineWidget";
import GovernanceScoreWidget from "../../components/widgets/GovernanceScoreWidget";
import DataQualityWidget from "../../components/widgets/DataQualityWidget";
import AuditWidget from "../../components/widgets/AuditWidget";
import ClassicKpiSection from "./ClassicKpiSection";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const accentClassMap = {
  blue: "from-primary to-accent",
  violet: "from-accent to-primary",
  teal: "from-secondary to-primary",
};

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

  if (loading) {
    return (
      <div className="space-y-4 p-2">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const kpis = Array.isArray(data?.kpis) ? data.kpis : [];
  const trends = Array.isArray(data?.trends) ? data.trends : [];
  const gradient = accentClassMap[accent] || accentClassMap.blue;

  return (
    <section className="space-y-6">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn("overflow-hidden rounded-2xl bg-gradient-to-r p-6 shadow-lg", gradient)}
      >
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        <p className="mt-1 text-sm text-white/80">{subtitle}</p>
      </motion.header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi, idx) => (
          <KPIWidget
            key={`${kpi.title || "kpi"}-${idx}`}
            title={kpi.title}
            value={kpi.value}
            subtitle={kpi.subtitle}
            tone={kpi.tone}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TrendChart title="Performance trend" data={trends} />
        <PipelineWidget pipelines={data?.pipelines || []} />
      </div>

      {children ? <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{children}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatusCard
          label="System health"
          status={data?.system_health || "Healthy"}
          description="Current platform operating state."
        />
        <GovernanceScoreWidget score={data?.governance_score || 0} />
        <DataQualityWidget metrics={data?.data_quality || {}} />
      </div>

      <AuditWidget entries={data?.audit_events || []} />
      <ClassicKpiSection defaultOpen />
    </section>
  );
}

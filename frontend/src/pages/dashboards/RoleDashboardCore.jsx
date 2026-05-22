import { useEffect, useState } from "react";
import { getRoleDashboard } from "../../api";
import KPIWidget from "../../components/widgets/KPIWidget";
import TrendChart from "../../components/widgets/TrendChart";
import StatusCard from "../../components/widgets/StatusCard";
import PipelineWidget from "../../components/widgets/PipelineWidget";
import GovernanceScoreWidget from "../../components/widgets/GovernanceScoreWidget";
import DataQualityWidget from "../../components/widgets/DataQualityWidget";
import AuditWidget from "../../components/widgets/AuditWidget";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function RoleDashboardCore({ endpoint, children = null }) {
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
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  const kpis = Array.isArray(data?.kpis) ? data.kpis : [];
  const trends = Array.isArray(data?.trends) ? data.trends : [];

  return (
    <div className="space-y-6">
      {error ? (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4 text-sm text-warning">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.length ? (
          kpis.map((kpi, idx) => (
            <KPIWidget
              key={`${kpi.title || "kpi"}-${idx}`}
              title={kpi.title}
              value={kpi.value}
              subtitle={kpi.subtitle}
              tone={kpi.tone}
            />
          ))
        ) : (
          <Card className="col-span-full">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No KPI snapshots available yet.
            </CardContent>
          </Card>
        )}
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
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import RechartsTooltip from "@/components/charts/RechartsTooltip";
import { getChartColors } from "@/lib/chartTheme";
import { enterpriseGovernanceDatasetChartInsights } from "@/pages/dashboards/enterpriseApi";
import { cn } from "@/lib/utils";

const CHART_TYPE_LABELS = {
  area: "Area trend",
  treemap: "Treemap",
  scatter: "Scatter plot",
  radar: "Radar",
  radial_bar: "Radial bar",
  composed: "Combo chart",
  donut: "Donut",
  histogram: "Histogram",
  bar: "Bar chart",
  line: "Line chart",
  pie: "Pie chart",
};

function formatDetail(d) {
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join("; ") || "Request failed.";
  if (d && typeof d === "object") {
    const det = d.detail;
    if (typeof det === "string") return det;
    if (Array.isArray(det)) return det.map((x) => x?.msg || JSON.stringify(x)).join("; ");
    return d.msg || JSON.stringify(d);
  }
  return "";
}

function chartPalette(colors) {
  return [colors.primary, colors.secondary, colors.accent, colors.success, colors.warning, colors.destructive];
}

function AxisTicks(colors) {
  return { fill: colors.muted, fontSize: 10 };
}

function ChartBody({ chart, colors }) {
  const rows = chart.data || [];
  const gridStroke = colors.border + "80";
  const type = chart.chart_type || "bar";
  const palette = chartPalette(colors);
  const tick = AxisTicks(colors);

  if (!rows.length) {
    return <p className="py-6 text-center text-[11px] text-muted-foreground">No data points.</p>;
  }

  if (type === "treemap") {
    const treemapData = rows.map((r) => ({ name: r.label, size: r.value }));
    return (
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={treemapData}
            dataKey="size"
            nameKey="name"
            stroke={colors.border}
            fill={colors.primary}
            content={({ x, y, width, height, name, index }) =>
              width > 36 && height > 22 ? (
                <g>
                  <rect x={x} y={y} width={width} height={height} fill={palette[index % palette.length]} stroke={colors.card} strokeWidth={2} rx={4} />
                  <text x={x + 6} y={y + 14} fill={colors.foreground} fontSize={9} fontWeight={600}>
                    {String(name).slice(0, 12)}
                  </text>
                </g>
              ) : null
            }
          />
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "donut" || type === "pie") {
    const inner = type === "donut" ? 42 : 0;
    return (
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={inner} outerRadius={58} paddingAngle={2}>
              {rows.map((_, i) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Pie>
            <Tooltip content={<RechartsTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "radar") {
    const radarData = rows.map((r) => ({ subject: r.label, value: r.value }));
    return (
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="68%">
            <PolarGrid stroke={gridStroke} />
            <PolarAngleAxis dataKey="subject" tick={{ ...tick, fontSize: 8 }} />
            <PolarRadiusAxis tick={false} axisLine={false} />
            <Radar dataKey="value" stroke={colors.primary} fill={colors.primary + "55"} strokeWidth={2} />
            <Tooltip content={<RechartsTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "radial_bar") {
    const radialData = rows.map((r, i) => ({ ...r, fill: palette[i % palette.length] }));
    return (
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="28%" outerRadius="95%" data={radialData} startAngle={180} endAngle={0}>
            <RadialBar background dataKey="value" cornerRadius={6} />
            <Tooltip content={<RechartsTooltip />} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "scatter") {
    return (
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis type="number" dataKey="x" name="x" tick={tick} axisLine={false} tickLine={false} />
            <YAxis type="number" dataKey="y" name="y" tick={tick} axisLine={false} tickLine={false} width={36} />
            <ZAxis range={[40, 40]} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<RechartsTooltip />} />
            <Scatter data={rows} fill={colors.primary} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "composed") {
    return (
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={44} />
            <YAxis yAxisId="left" tick={tick} axisLine={false} tickLine={false} width={32} />
            <YAxis yAxisId="right" orientation="right" tick={tick} axisLine={false} tickLine={false} width={32} />
            <Tooltip content={<RechartsTooltip />} />
            <Bar yAxisId="left" dataKey="value" fill={colors.primary} radius={[4, 4, 0, 0]} name="Count" />
            <Line yAxisId="right" type="monotone" dataKey="secondary" stroke={colors.accent} strokeWidth={2} dot={{ r: 2 }} name="Average" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "area") {
    return (
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows}>
            <defs>
              <linearGradient id={`area-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.primary} stopOpacity={0.45} />
                <stop offset="100%" stopColor={colors.primary} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<RechartsTooltip />} />
            <Area type="monotone" dataKey="value" stroke={colors.primary} fill={`url(#area-${chart.id})`} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "line") {
    return (
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<RechartsTooltip />} />
            <Line type="monotone" dataKey="value" stroke={colors.primary} strokeWidth={2} dot={{ r: 2, fill: colors.primary }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const vertical = rows.length > 8 || type === "histogram";
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout={vertical ? "vertical" : "horizontal"} margin={{ left: vertical ? 4 : 0 }}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
          {vertical ? (
            <>
              <XAxis type="number" tick={tick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" tick={{ ...tick, fontSize: 9 }} width={72} axisLine={false} tickLine={false} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end" height={48} />
              <YAxis tick={tick} axisLine={false} tickLine={false} width={36} />
            </>
          )}
          <Tooltip content={<RechartsTooltip />} />
          <Bar dataKey="value" fill={colors.primary} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function DatasetCatalogChartInsights({ datasetId, enabled = true, dataRevision = 0, className }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [payload, setPayload] = useState(null);
  const colors = useMemo(() => getChartColors(), []);

  const load = useCallback(
    async (refresh = false) => {
      if (datasetId == null || !enabled) return;
      setLoading(true);
      setErr("");
      try {
        const res = await enterpriseGovernanceDatasetChartInsights(datasetId, { refresh });
        setPayload(res?.data ?? res);
      } catch (e) {
        setPayload(null);
        setErr(formatDetail(e?.response?.data) || e?.message || "Failed to load chart insights.");
      } finally {
        setLoading(false);
      }
    },
    [datasetId, enabled],
  );

  useEffect(() => {
    if (!enabled || datasetId == null) return;
    load(dataRevision > 0);
  }, [datasetId, enabled, dataRevision, load]);

  const charts = payload?.charts || [];
  const sourceLabel = payload?.source === "llm" ? "AI suggested" : payload?.source === "heuristic" ? "Auto suggested" : null;

  return (
    <div className={cn("flex flex-col rounded-xl border border-border bg-card", className)}>
      <div className="flex items-start justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <p className="text-[11px] font-bold uppercase tracking-wider text-foreground">Insights</p>
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Smart visualizations from your data{sourceLabel ? ` · ${sourceLabel}` : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-[10px] uppercase"
          disabled={loading || !enabled}
          onClick={() => load(true)}
          title="Regenerate charts"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="flex-1 space-y-3 p-3">
        {!enabled ? (
          <p className="text-xs text-muted-foreground">Load sample data to see AI-generated charts.</p>
        ) : loading && !charts.length ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Generating charts…</p>
        ) : err ? (
          <p className="text-xs text-destructive">{err}</p>
        ) : payload?.message && !charts.length ? (
          <p className="text-xs text-muted-foreground">{payload.message}</p>
        ) : !charts.length ? (
          <p className="text-xs text-muted-foreground">No suitable charts for this dataset yet.</p>
        ) : (
          charts.map((chart) => (
            <div key={chart.id} className="rounded-lg border border-border bg-background/50 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold text-foreground">{chart.title}</p>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                  {CHART_TYPE_LABELS[chart.chart_type] || chart.chart_type}
                </span>
              </div>
              {chart.insight ? <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{chart.insight}</p> : null}
              <div className="mt-2">
                <ChartBody chart={chart} colors={colors} />
              </div>
            </div>
          ))
        )}
        {payload?.llm_unavailable && charts.length ? (
          <p className="text-[10px] text-muted-foreground">Using rule-based charts (LLM unavailable).</p>
        ) : null}
      </div>
    </div>
  );
}

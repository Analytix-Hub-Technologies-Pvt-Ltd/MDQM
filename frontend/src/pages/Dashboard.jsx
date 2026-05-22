import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
} from "chart.js";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  Tooltip as ReTooltip,
} from "recharts";
import {
  Activity,
  Database,
  CheckCircle,
  AlertTriangle,
  Layers,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { getDashboardSummary, getDataQualityMetrics, getAllJobs } from "../api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import KpiMetricCard from "@/components/dashboard/KpiMetricCard";
import RechartsTooltip from "@/components/charts/RechartsTooltip";
import { getChartColors, scoreColor, scoreTone } from "@/lib/chartTheme";
import { cn } from "@/lib/utils";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, LineElement, PointElement);

function DimensionSparkline({ values, gradientId }) {
  const colors = getChartColors();
  const hasSingleValue = Array.isArray(values) && values.length <= 1;
  const safeValues = (() => {
    const base = (values && values.length ? values : [0]).slice(-7).map((v) => Number(v || 0));
    if (base.length <= 1) {
      const first = base[0] ?? 0;
      return [first, first];
    }
    return base;
  })();
  const chartData = safeValues.map((value, index) => ({ index, value }));
  const latest = safeValues[safeValues.length - 1] || 0;
  const lineColor = scoreColor(latest);

  return (
    <div className="w-[140px]">
      <div className="h-[60px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.28} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <ReTooltip content={<RechartsTooltip />} />
            <Area type="monotone" dataKey="value" stroke="none" fill={`url(#${gradientId})`} />
            <Line type="monotone" dataKey="value" stroke={lineColor} strokeWidth={2} dot={false} isAnimationActive animationDuration={800} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {hasSingleValue ? (
        <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">No trend data</div>
      ) : null}
    </div>
  );
}

function MetricChart({ label, dataList, keyName }) {
  const colors = getChartColors();
  const rows = (Array.isArray(dataList) ? dataList : []).slice(0, 10);
  const fullNames = rows.map((row) => String(row.table || ""));
  const labels = rows.map((row) => {
    const name = String(row.table || "");
    return name.length > 10 ? `${name.slice(0, 10)}…` : name;
  });
  const values = rows.map((row) => Number(row[keyName] || 0));
  const avg = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;

  const data = {
    labels,
    datasets: [
      {
        type: "bar",
        data: values,
        backgroundColor: values.map((v) => scoreColor(v) + "cc"),
        borderColor: values.map((v) => scoreColor(v)),
        borderWidth: 1,
        borderRadius: 6,
      },
      {
        type: "line",
        data: new Array(values.length).fill(90),
        borderColor: colors.info,
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: colors.card,
        titleColor: colors.foreground,
        bodyColor: colors.muted,
        borderColor: colors.border,
        borderWidth: 1,
        callbacks: {
          title: (items) => fullNames[items?.[0]?.dataIndex ?? 0] || "",
          label: (ctx) => `${Number(ctx.raw || 0).toFixed(2)}%`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: colors.muted, maxRotation: 0 },
        grid: { color: colors.border + "40" },
      },
      y: {
        min: 0,
        max: 100,
        ticks: { color: colors.muted, callback: (v) => `${v}%` },
        grid: { color: colors.border + "40" },
      },
    },
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <div className="flex flex-wrap gap-2 pt-2">
          <Badge variant="outline">Avg {avg.toFixed(1)}%</Badge>
          <Badge variant="outline">Min {min.toFixed(1)}%</Badge>
          <Badge variant="outline">Max {max.toFixed(1)}%</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <Bar data={data} options={options} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard({ embedded = false }) {
  const [data, setData] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [selectedJobId, setSelectedJobId] = useState("all");
  const [dqMetrics, setDqMetrics] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [summaryRes, metricsRes, jobsRes] = await Promise.all([
        getDashboardSummary(),
        getDataQualityMetrics(),
        getAllJobs(),
      ]);
      setData(summaryRes.data);
      setDqMetrics(Array.isArray(metricsRes.data) ? metricsRes.data : []);
      setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    }
    if (isManual) setRefreshing(false);
    setLoading(false);
  };

  if (loading || !data) {
    return (
      <div className={cn("space-y-4", embedded ? "p-4" : "")}>
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const { system_metrics, data_health } = data;
  const overallScore = Number(data_health.overall_score || 0);
  const tone = scoreTone(overallScore);
  const scoreLabel = overallScore >= 90 ? "Excellent" : overallScore >= 70 ? "Needs Attention" : "Critical";

  const allMetricKeys = ["completeness", "accuracy", "consistency", "uniqueness", "validity", "timeliness"];
  const filteredDqMetrics =
    selectedJobId === "all"
      ? dqMetrics
      : dqMetrics.filter((row) => String(row.job_id) === String(selectedJobId));

  const aggregatedMetrics = allMetricKeys.reduce((acc, key) => {
    if (!filteredDqMetrics.length) {
      acc[key] = 0;
      return acc;
    }
    const total = filteredDqMetrics.reduce((sum, row) => sum + Number(row[key] || 0), 0);
    acc[key] = total / filteredDqMetrics.length;
    return acc;
  }, {});

  const dimensionCards = [
    { key: "completeness", title: "Completeness", description: "Required fields are present" },
    { key: "accuracy", title: "Accuracy", description: "Values represent real-world data" },
    { key: "consistency", title: "Consistency", description: "Uniform format across sources" },
    { key: "uniqueness", title: "Uniqueness", description: "Duplicates minimized" },
    { key: "validity", title: "Validity", description: "Conforms to business rules" },
    { key: "timeliness", title: "Timeliness", description: "Data is current when needed" },
  ];

  const trendDelta = Number(aggregatedMetrics.completeness || 0) - overallScore;
  const trendLabel = `${trendDelta >= 0 ? "+" : ""}${trendDelta.toFixed(1)}% vs overall`;

  const lowQualityTables = [...dqMetrics]
    .map((row) => ({
      job_id: row.job_id,
      table: row.table,
      quality:
        (Number(row.completeness || 0) +
          Number(row.accuracy || 0) +
          Number(row.consistency || 0) +
          Number(row.uniqueness || 0) +
          Number(row.validity || 0) +
          Number(row.timeliness || 0)) /
        6,
    }))
    .sort((a, b) => a.quality - b.quality)
    .slice(0, 5);

  const getTrendInfo = (values) => {
    const points = (values && values.length ? values : [0]).slice(-7).map((v) => Number(v || 0));
    const first = points[0] || 0;
    const last = points[points.length - 1] || 0;
    const delta = last - first;
    return { up: delta >= 0, text: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` };
  };

  const wrapperClass = embedded
    ? "space-y-6 overflow-y-auto max-h-[min(75vh,820px)]"
    : "space-y-6";

  return (
    <div className={wrapperClass}>
      {!embedded ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Data Quality Hub</h1>
                <p className="text-sm text-muted-foreground">MDQM monitoring & analytics</p>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchSummary(true)} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </motion.div>
      ) : null}

      <Tabs value={activeView} onValueChange={setActiveView}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="dimensions">Dimensions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiMetricCard
              title="Configured Jobs"
              value={system_metrics.total_jobs}
              icon={Layers}
              delay={0}
            />
            <KpiMetricCard
              title="Tables Tracked"
              value={system_metrics.total_tables}
              icon={Database}
              delay={0.05}
            />
            <KpiMetricCard
              title="Active Rules"
              value={system_metrics.active_rules}
              icon={CheckCircle}
              delay={0.1}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2 overflow-hidden border-primary/20">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Executive quality score
                    </p>
                    <p
                      className={cn(
                        "mt-2 text-6xl font-semibold tracking-tight",
                        tone === "success" && "text-success",
                        tone === "warning" && "text-warning",
                        tone === "destructive" && "text-destructive",
                      )}
                    >
                      {overallScore}%
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={tone === "success" ? "success" : tone === "warning" ? "warning" : "destructive"}>
                      {scoreLabel}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {trendLabel}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Top risk tables
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {lowQualityTables.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No dynamic data available</p>
                ) : (
                  lowQualityTables.map((item, idx) => (
                    <div key={`${item.job_id || "na"}-${item.table}-${idx}`}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="truncate text-muted-foreground max-w-[170px]">{item.table}</span>
                        <span className="font-semibold">{item.quality.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(0, Math.min(100, item.quality))}%` }}
                          transition={{ duration: 0.6, delay: idx * 0.05 }}
                          className="h-full rounded-full bg-primary"
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="dimensions" className="space-y-6 mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Data quality dimensions</h2>
              <p className="text-xs text-muted-foreground">Last updated: {lastUpdated || "—"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)} className="w-auto min-w-[180px]">
                <option value="all">All jobs</option>
                {jobs.map((job) => (
                  <option key={job.job_id} value={job.job_id}>
                    {job.job_id} — {job.job_name}
                  </option>
                ))}
              </Select>
              <Button variant="outline" size="sm" onClick={() => fetchSummary(true)} disabled={refreshing}>
                <RefreshCw className={cn("h-4 w-4 mr-1", refreshing && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {dimensionCards.map((card, idx) => {
              const sparkValues = filteredDqMetrics.slice(0, 10).map((row) => Number(row[card.key] || 0));
              const trend = getTrendInfo(sparkValues);
              const val = Number(aggregatedMetrics[card.key] || 0);
              const cardTone = scoreTone(val);

              return (
                <motion.div
                  key={card.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                >
                  <Card className="hover:border-primary/25">
                    <CardContent className="p-5">
                      <div className="flex justify-between gap-4">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            {card.title}
                          </p>
                          <p
                            className={cn(
                              "mt-2 text-3xl font-semibold",
                              cardTone === "success" && "text-success",
                              cardTone === "warning" && "text-warning",
                              cardTone === "destructive" && "text-destructive",
                            )}
                          >
                            {val.toFixed(2)}%
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">{card.description}</p>
                        </div>
                        <div className="text-right">
                          <DimensionSparkline values={sparkValues} gradientId={`spark-${card.key}`} />
                          <p className={cn("mt-1 text-xs font-medium", trend.up ? "text-success" : "text-destructive")}>
                            {trend.up ? "▲" : "▼"} {trend.text}
                          </p>
                        </div>
                      </div>
                      <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(0, Math.min(100, val))}%`,
                            backgroundColor: scoreColor(val),
                          }}
                        />
                        <div
                          className="absolute top-0 h-full w-0.5 bg-info"
                          style={{ left: "90%" }}
                          title="90% threshold"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {allMetricKeys.slice(0, 2).map((key) => (
              <MetricChart
                key={key}
                label={key.charAt(0).toUpperCase() + key.slice(1)}
                dataList={filteredDqMetrics}
                keyName={key}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

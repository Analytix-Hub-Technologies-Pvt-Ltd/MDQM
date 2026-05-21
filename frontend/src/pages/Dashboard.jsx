import React, { useState, useEffect } from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend, LineElement, PointElement } from "chart.js";
import { ResponsiveContainer, AreaChart, Area, Line, Tooltip as ReTooltip } from "recharts";
import { getDashboardSummary, getDataQualityMetrics, getAllJobs } from "../api";
import {
  Activity,
  Database,
  CheckCircle,
  AlertTriangle,
  Fingerprint,
  ShieldAlert,
  Layers,
} from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, LineElement, PointElement);

function MetricChart({ label, dataList, keyName }) {
  console.log("Chart Data:", dataList);
  const rows = (Array.isArray(dataList) ? dataList : []).slice(0, 10);
  const fullNames = rows.map((row) => String(row.table || ""));
  const labels = rows.map((row) => {
    const name = String(row.table || "");
    return name.length > 10 ? `${name.slice(0, 10)}...` : name;
  });
  const values = rows.map((row) => Number(row[keyName] || 0));
  const avg = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const thresholdColor = (v) => (v >= 90 ? "rgba(34, 197, 94, 0.85)" : v >= 70 ? "rgba(249, 115, 22, 0.85)" : "rgba(239, 68, 68, 0.85)");

  const data = {
    labels,
    datasets: [
      {
        type: "bar",
        data: values,
        backgroundColor: values.map((v) => thresholdColor(v)),
        borderColor: values.map((v) => thresholdColor(v).replace("0.85", "1")),
        borderWidth: 1,
      },
      {
        type: "line",
        data: new Array(values.length).fill(90),
        borderColor: "rgba(59, 130, 246, 0.9)",
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 700,
      easing: "easeOutQuart",
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const idx = items?.[0]?.dataIndex ?? 0;
            return fullNames[idx] || "";
          },
          label: (context) => `${Number(context.raw || 0).toFixed(2)}%`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          autoSkip: true,
          maxRotation: 0,
          minRotation: 0,
        },
      },
      y: {
        min: 0,
        max: 100,
        ticks: {
          callback: (value) => `${value}%`,
        },
      },
    },
  };

  return (
    <div className="bg-white border border-gray-200 p-4">
      <div className="text-[12px] uppercase tracking-widest text-gray-500 mb-3">{label}</div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] uppercase tracking-wider px-2 py-1 border border-gray-200 bg-gray-50 text-gray-600">
          Avg {avg.toFixed(2)}%
        </span>
        <span className="text-[11px] uppercase tracking-wider px-2 py-1 border border-gray-200 bg-gray-50 text-gray-600">
          Min {min.toFixed(2)}%
        </span>
        <span className="text-[11px] uppercase tracking-wider px-2 py-1 border border-gray-200 bg-gray-50 text-gray-600">
          Max {max.toFixed(2)}%
        </span>
      </div>
      <div className="h-[250px]">
        <Bar data={data} options={options} />
      </div>
    </div>
  );
}

function DimensionSparkline({ values, gradientId }) {
  console.log("Sparkline values:", values);
  (values || []).forEach((value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
      console.warn("Invalid metric value:", value);
    }
  });
  const hasSingleValue = Array.isArray(values) && values.length <= 1;
  const safeValues = (() => {
    const base = (values && values.length ? values : [0]).slice(-7).map((v) => Number(v || 0));
    if (base.length <= 1) {
      const first = base[0] ?? 0;
      return [first, first];
    }
    return base;
  })();
  if (safeValues.length > 1 && safeValues.every((v) => v === safeValues[0])) {
    console.warn("All values are identical → flat graph");
  }
  const chartData = safeValues.map((value, index) => ({ index, value }));
  const latest = safeValues[safeValues.length - 1] || 0;
  const lineColor = latest >= 90 ? "#22c55e" : latest >= 70 ? "#f97316" : "#ef4444";

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
          <ReTooltip
            formatter={(value) => [`${Number(value).toFixed(2)}%`, "Value"]}
            labelFormatter={() => ""}
            contentStyle={{ border: "1px solid #e5e7eb", fontSize: "12px", padding: "6px 8px" }}
          />
          <Area type="monotone" dataKey="value" stroke="none" fill={`url(#${gradientId})`} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
            isAnimationActive={true}
            animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
      {hasSingleValue && (
        <div className="text-[9px] uppercase tracking-wider text-gray-400 mt-1">
          No trend data available
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ embedded = false }) {
  const [data, setData] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [selectedMetric, setSelectedMetric] = useState("all");
  const [dqMetrics, setDqMetrics] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("all");
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
      console.log("API Response (dqMetrics):", Array.isArray(metricsRes.data) ? metricsRes.data : []);
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    }
    if (isManual) setRefreshing(false);
    setLoading(false);
  };

  if (loading || !data) {
    return (
      <div className="p-10 font-mono text-gray-500 uppercase tracking-widest">
        Compiling System Metrics...
      </div>
    );
  }

  const { system_metrics, data_health } = data;

  // Determine color based on health score
  const scoreColor =
    data_health.overall_score >= 90
      ? "text-green-500"
      : data_health.overall_score >= 70
        ? "text-orange-500"
        : "text-red-600";
  const scoreBadgeClass =
    data_health.overall_score >= 90
      ? "bg-green-50 text-green-700 border-green-200"
      : data_health.overall_score >= 70
        ? "bg-orange-50 text-orange-700 border-orange-200"
        : "bg-red-50 text-red-700 border-red-200";
  const scoreLabel =
    data_health.overall_score >= 90
      ? "Excellent"
      : data_health.overall_score >= 70
        ? "Needs Attention"
        : "Critical";

  const metricLabels = {
    completeness: "COMPLETENESS",
    accuracy: "ACCURACY",
    consistency: "CONSISTENCY",
    uniqueness: "UNIQUENESS",
    validity: "VALIDITY",
    timeliness: "TIMELINESS",
  };

  const allMetricKeys = [
    "completeness",
    "accuracy",
    "consistency",
    "uniqueness",
    "validity",
    "timeliness",
  ];

  const visibleKeys = selectedMetric === "all" ? allMetricKeys : [selectedMetric];
  const tabClass = (view) =>
    activeView === view
      ? "bg-[#23243B] text-white border-[#23243B]"
      : "bg-white text-gray-600 border-gray-300";
  console.log("DQ Metrics:", dqMetrics);
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
  console.log("Aggregated Metrics:", aggregatedMetrics);
  const dimensionCards = [
    {
      key: "completeness",
      title: "COMPLETENESS",
      description: "All required fields are present",
    },
    {
      key: "accuracy",
      title: "ACCURACY",
      description: "Values correctly represent real-world data",
    },
    {
      key: "consistency",
      title: "CONSISTENCY",
      description: "Data follows the same format everywhere",
    },
    {
      key: "uniqueness",
      title: "UNIQUENESS",
      description: "Duplicate records are minimized",
    },
    {
      key: "validity",
      title: "VALIDITY",
      description: "Values conform to expected rules",
    },
    {
      key: "timeliness",
      title: "TIMELINESS",
      description: "Data is current and available when needed",
    },
  ];
  const trendDelta = Number(aggregatedMetrics.completeness || 0) - Number(data_health.overall_score || 0);
  const trendLabel = `${trendDelta >= 0 ? "+" : ""}${trendDelta.toFixed(1)}% vs overall`;
  const lowQualityTables = [...dqMetrics]
    .map((row) => ({
      job_id: row.job_id,
      table: row.table,
      quality: (
        (Number(row.completeness || 0) +
          Number(row.accuracy || 0) +
          Number(row.consistency || 0) +
          Number(row.uniqueness || 0) +
          Number(row.validity || 0) +
          Number(row.timeliness || 0)) /
        6
      ),
    }))
    .sort((a, b) => a.quality - b.quality)
    .slice(0, 5);
  const getTrendInfo = (values) => {
    const points = (values && values.length ? values : [0]).slice(-7).map((v) => Number(v || 0));
    const first = points[0] || 0;
    const last = points[points.length - 1] || 0;
    const delta = last - first;
    return {
      up: delta >= 0,
      text: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`,
    };
  };

  return (
    <div
      className={
        embedded
          ? "bg-[#FBFBFB] text-[#23243B] overflow-y-auto max-h-[min(75vh,820px)] p-4"
          : "flex-1 bg-[#FBFBFB] text-[#23243B] h-screen overflow-y-auto p-8"
      }
    >
      {!embedded ? (
        <div className="mb-10 border-b border-[#A1A3AF] border-opacity-20 pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-thin tracking-tighter uppercase flex items-center gap-3">
              <Activity size={32} className="text-blue-600" /> Data Quality Hub
            </h1>
            <p className="text-sm text-gray-400 tracking-widest uppercase mt-2">
              MDQM Monitoring Dashboard
            </p>
          </div>
        </div>
      ) : null}

      <div className="mb-6 border-b border-gray-200 pb-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setActiveView("overview")}
          className={`px-4 py-2 text-xs uppercase tracking-widest border ${tabClass("overview")}`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveView("dimensions")}
          className={`px-4 py-2 text-xs uppercase tracking-widest border ${tabClass("dimensions")}`}
        >
          Metrics
        </button>
      </div>

      <div className={activeView === "overview" ? "" : "hidden"}>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
          <div className="xl:col-span-2 bg-white border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="text-[12px] uppercase tracking-widest text-gray-500 mb-2">Executive Quality View</div>
                <div className={`text-6xl font-normal tracking-tighter leading-none ${scoreColor}`}>
                  {data_health.overall_score}%
                </div>
              </div>
              <div className="flex gap-2">
                <span className={`px-2 py-1 text-[11px] uppercase tracking-wider border ${scoreBadgeClass}`}>{scoreLabel}</span>
                <span className="px-2 py-1 text-[11px] uppercase tracking-wider border border-blue-200 text-blue-700 bg-blue-50">
                  {trendLabel}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="border border-gray-200 p-4">
                <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Configured Jobs</div>
                <div className="text-3xl font-bold text-[#23243B]">{system_metrics.total_jobs}</div>
              </div>
              <div className="border border-gray-200 p-4">
                <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Tables Tracked</div>
                <div className="text-3xl font-bold text-[#23243B]">{system_metrics.total_tables}</div>
              </div>
              <div className="border border-gray-200 p-4">
                <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Active Rules</div>
                <div className="text-3xl font-bold text-[#23243B]">{system_metrics.active_rules}</div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 p-6">
            <div className="text-[12px] uppercase tracking-widest text-gray-500 mb-4">Top Risk Tables</div>
            {lowQualityTables.length === 0 ? (
              <div className="text-sm text-gray-500">No dynamic data available</div>
            ) : (
              <div className="space-y-4">
                {lowQualityTables.map((item, idx) => (
                  <div key={`${item.job_id || "na"}-${item.table}-${idx}`}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-600 truncate max-w-[170px]">{item.table}</span>
                      <span className="font-semibold text-gray-700">{item.quality.toFixed(2)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 border border-gray-200">
                      <div className="h-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, item.quality))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={activeView === "dimensions" ? "mt-2" : "hidden"}>
        <div className="mb-4 border-b border-gray-200 pb-2 flex items-center justify-between">
          <h2 className="text-lg font-normal tracking-widest uppercase text-gray-600">
            DATA QUALITY METRICS
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="bg-white border border-gray-300 px-3 py-2 text-sm tracking-wider"
            >
              <option value="all">All Jobs</option>
              {jobs.map((job) => (
                <option key={job.job_id} value={job.job_id}>
                  {job.job_id} - {job.job_name}
                </option>
              ))}
            </select>
            <button
              onClick={() => fetchSummary(true)}
              className="border border-gray-300 bg-white px-3 py-2 text-xs uppercase tracking-wider text-gray-600"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
        <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-3">
          Last Updated: {lastUpdated || "--"}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {dimensionCards.map((card) => {
            const sparkValues = filteredDqMetrics.slice(0, 10).map((row) => Number(row[card.key] || 0));
            const trend = getTrendInfo(sparkValues);
            return (
            <div key={card.key} className="bg-white border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[12px] uppercase tracking-widest text-gray-500 mb-2">
                    {card.title}
                  </div>
                  <div
                    className={`text-4xl font-bold mb-2 ${
                      Number(aggregatedMetrics[card.key] || 0) >= 90
                        ? "text-green-600"
                        : Number(aggregatedMetrics[card.key] || 0) >= 70
                          ? "text-orange-500"
                          : "text-red-500"
                    }`}
                  >
                    {Number(aggregatedMetrics[card.key] || 0).toFixed(2)}%
                  </div>
                  <div className="text-[10px] text-gray-400 mb-1">
                    Raw Values: [
                    {filteredDqMetrics
                      .slice(0, 10)
                      .map((row) => Number(row[card.key] || 0).toFixed(2))
                      .join(", ")}
                    ]
                  </div>
                </div>
                <div className="pt-1 text-right">
                  <DimensionSparkline
                    values={sparkValues}
                    gradientId={`spark-gradient-${card.key}`}
                  />
                  <div className={`text-xs font-semibold mt-1 ${trend.up ? "text-green-600" : "text-red-600"}`}>
                    {trend.up ? "▲" : "▼"} {trend.text}
                  </div>
                </div>
              </div>
              <div className="mt-1 mb-3 h-2 bg-gray-100 border border-gray-200 relative">
                <div
                  className={`h-full ${
                    Number(aggregatedMetrics[card.key] || 0) >= 90
                      ? "bg-green-500"
                      : Number(aggregatedMetrics[card.key] || 0) >= 70
                        ? "bg-orange-500"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, Number(aggregatedMetrics[card.key] || 0)))}%` }}
                />
                <div className="absolute top-[-3px] h-3 border-l border-blue-500" style={{ left: "90%" }} />
              </div>
              <div className="text-sm text-gray-500">{card.description}</div>
            </div>
          );})}
        </div>
      </div>
    </div>
  );
}

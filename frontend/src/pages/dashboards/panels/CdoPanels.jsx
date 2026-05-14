import { ResponsiveContainer, LineChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { useEffect, useState } from "react";
import EnterpriseDataPanel, { StatusBadge } from "../../../components/enterprise/EnterpriseDataPanel";
import CdoInsightsPanel from "../CdoInsightsPanel";
import {
  enterpriseAnalyticsMetricCreate,
  enterpriseAnalyticsMetrics,
  enterpriseComplianceReports,
} from "../enterpriseApi";
import { getRoleDashboard } from "../../../api";

const compCols = [
  { key: "title", label: "Title" },
  { key: "framework", label: "Framework" },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
];

const metCols = [
  { key: "metric_key", label: "Metric" },
  {
    key: "metric_value",
    label: "Value",
    render: (v) => <span className="font-mono text-[11px] max-w-[220px] inline-block truncate">{v != null ? JSON.stringify(v) : "—"}</span>,
  },
  { key: "domain", label: "Domain" },
  { key: "captured_at", label: "Captured" },
];

function DqTrendsMini() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await getRoleDashboard("cdo");
        if (on) setRows(Array.isArray(res.data?.trends) ? res.data.trends : []);
      } catch {
        if (on) setRows([]);
      }
    })();
    return () => {
      on = false;
    };
  }, []);
  return (
    <div className="enterprise-card p-4 h-56">
      <h3 className="enterprise-title mb-2">DQ trend (same KPI feed)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows.length ? rows : [{ label: "—", value: 0 }]}>
          <XAxis dataKey="label" hide />
          <YAxis hide domain={[0, 100]} />
          <Tooltip contentStyle={{ background: "#0f1b31", border: "1px solid #2a3f63" }} />
          <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function AnalyticsMetricForm({ onCreated }) {
  const [key, setKey] = useState("dq_pass_rate");
  const [domain, setDomain] = useState("");
  const [value, setValue] = useState("92");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    const num = parseFloat(String(value).trim(), 10);
    const metric_value = Number.isFinite(num) ? { value: num } : { raw: String(value).trim() };
    try {
      await enterpriseAnalyticsMetricCreate({
        metric_key: key.trim(),
        domain: domain.trim() || null,
        metric_value,
      });
      setMsg("Metric recorded.");
      onCreated?.();
    } catch (ex) {
      setErr(ex?.response?.data?.detail || "Save failed");
    }
  };

  return (
    <div className="enterprise-card p-4 mb-4 text-sm text-[#d7e3f7] space-y-2">
      <h3 className="enterprise-title text-sm">Record metric snapshot</h3>
      <form onSubmit={submit} className="grid sm:grid-cols-3 gap-2">
        <input className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2" value={key} onChange={(e) => setKey(e.target.value)} placeholder="metric_key" />
        <input className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="domain" />
        <input className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2" value={value} onChange={(e) => setValue(e.target.value)} placeholder="numeric value" />
        <button type="submit" className="sm:col-span-3 text-xs bg-[#2a4a7a] text-white py-2 rounded uppercase tracking-wide">
          Save to analytics_metrics
        </button>
      </form>
      {err ? <p className="text-xs text-red-400">{err}</p> : null}
      {msg ? <p className="text-xs text-emerald-300">{msg}</p> : null}
    </div>
  );
}

function AnalyticsTabBody() {
  const [k, setK] = useState(0);
  return (
    <div>
      <AnalyticsMetricForm onCreated={() => setK((x) => x + 1)} />
      <EnterpriseDataPanel
        key={`am-${k}`}
        title="Analytics metrics"
        columns={metCols}
        fetchPage={({ page, pageSize }) => enterpriseAnalyticsMetrics({ page, page_size: pageSize })}
      />
    </div>
  );
}

export function renderCdoTab(tabId) {
  switch (tabId) {
    case "roi":
      return (
        <div className="enterprise-card p-5 text-sm text-[#9ab0d1]">
          <h3 className="enterprise-title mb-2">ROI &amp; value</h3>
          <p>Quantify remediation savings and risk reduction using analytics metrics captured below.</p>
        </div>
      );
    case "compliance":
      return (
        <EnterpriseDataPanel
          title="Compliance reports"
          columns={compCols}
          fetchPage={({ page, pageSize }) => enterpriseComplianceReports({ page, page_size: pageSize })}
        />
      );
    case "dq-trends":
      return <DqTrendsMini />;
    case "domain-health":
      return <CdoInsightsPanel />;
    case "risk-metrics":
      return (
        <div className="enterprise-card p-5 text-sm text-[#9ab0d1]">
          <h3 className="enterprise-title mb-2">Risk metrics</h3>
          <p>Risk posture aggregates failed jobs, quarantine volume, and policy exceptions — wire to analytics_metrics as data grows.</p>
        </div>
      );
    case "analytics":
      return <AnalyticsTabBody />;
    default:
      return null;
  }
}

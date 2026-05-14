import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Inbox, X } from "lucide-react";
import EnterpriseDataPanel, { StatusBadge } from "../../../components/enterprise/EnterpriseDataPanel";
import {
  enterpriseAnalyticsMetrics,
  enterpriseBusinessDataRequestCreate,
  enterpriseBusinessDataRequests,
  enterpriseBusinessDataRequestsSummary,
  enterpriseComplianceReports,
  enterpriseGovernanceDatasets,
  enterpriseGovernanceGlossary,
  enterpriseGovernancePolicies,
  enterpriseMonitoringHealth,
  enterpriseNotificationMarkRead,
  enterpriseNotifications,
  enterpriseReportsExports,
  enterpriseStewardshipIssues,
  enterpriseValidationResults,
  lineageGraph,
} from "../enterpriseApi";

const datasetCols = [
  { key: "name", label: "Dataset" },
  { key: "domain", label: "Domain" },
  { key: "classification", label: "Class" },
  { key: "created_at", label: "Registered" },
];

const glossaryCols = [
  { key: "term", label: "Term" },
  { key: "domain", label: "Domain" },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
  {
    key: "definition",
    label: "Definition",
    render: (v) => <span className="line-clamp-2 text-xs text-[#9ab0d1]">{v || "—"}</span>,
  },
];

const policyCols = [
  { key: "policy_name", label: "Policy" },
  { key: "domain", label: "Domain" },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
];

const validationCols = [
  { key: "job_id", label: "Job" },
  { key: "passed", label: "Passed", render: (v) => <StatusBadge status={v ? "success" : "failed"} /> },
  { key: "summary", label: "Summary" },
  { key: "created_at", label: "Run at" },
];

const complianceCols = [
  { key: "title", label: "Title" },
  { key: "framework", label: "Framework" },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
  { key: "created_at", label: "Created" },
];

const reportCols = [
  { key: "report_type", label: "Type" },
  { key: "format", label: "Format" },
  { key: "created_at", label: "Exported" },
];

const issueCols = [
  { key: "dataset_name", label: "Dataset" },
  { key: "severity", label: "Severity", render: (v) => <StatusBadge status={v} /> },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
  { key: "created_at", label: "Opened" },
];

const notifCols = [
  { key: "created_at", label: "When" },
  { key: "severity", label: "Severity", render: (v) => <StatusBadge status={v} /> },
  { key: "subject", label: "Subject" },
  {
    key: "read_at",
    label: "Read",
    render: (v, row) =>
      v ? (
        <span className="text-xs text-emerald-400">Yes</span>
      ) : (
        <button
          type="button"
          className="text-xs text-sky-400 underline"
          onClick={async () => {
            try {
              await enterpriseNotificationMarkRead(row.id);
              window.dispatchEvent(new CustomEvent("mdqm-notifications-refresh"));
            } catch {
              /* ignore */
            }
          }}
        >
          Mark read
        </button>
      ),
  },
];

function MonitoringStrip() {
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await enterpriseMonitoringHealth();
        if (on) setHealth(res.data);
      } catch (e) {
        if (on) setErr(e?.response?.data?.detail || "Health check unavailable");
      }
      try {
        const m = await enterpriseAnalyticsMetrics({ page: 1, page_size: 8 });
        if (on) setMetrics(Array.isArray(m.data?.items) ? m.data.items : []);
      } catch {
        if (on) setMetrics([]);
      }
    })();
    return () => {
      on = false;
    };
  }, []);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="enterprise-card p-4 text-sm text-[#d7e3f7]">
        <h3 className="enterprise-title mb-2">Platform health</h3>
        {err ? <p className="text-amber-400 text-xs">{err}</p> : null}
        {health ? (
          <pre className="text-xs text-[#9ab0d1] overflow-auto max-h-40">{JSON.stringify(health, null, 2)}</pre>
        ) : !err ? (
          <p className="text-[#7f95b6] text-xs">Loading…</p>
        ) : null}
      </div>
      <div className="enterprise-card p-4 text-sm text-[#d7e3f7]">
        <h3 className="enterprise-title mb-2">Recent analytics metrics</h3>
        {!metrics.length ? (
          <p className="text-xs text-[#7f95b6]">No metrics yet.</p>
        ) : (
          <div className="overflow-x-auto border border-[#22324f] rounded">
            <table className="w-full text-xs">
              <thead className="text-[#9ab0d1] border-b border-[#22324f]">
                <tr>
                  <th className="text-left p-2">Metric</th>
                  <th className="text-left p-2">Value</th>
                  <th className="text-left p-2">Domain</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((row) => (
                  <tr key={row.id ?? row.metric_key} className="border-b border-[#22324f]/50">
                    <td className="p-2 text-[#d7e3f7]">{row.metric_key}</td>
                    <td className="p-2 font-mono text-[10px] max-w-[160px] truncate">{row.metric_value != null ? JSON.stringify(row.metric_value) : "—"}</td>
                    <td className="p-2 text-[#9ab0d1]">{row.domain || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const DURATION_OPTIONS = [
  { value: "7_days", label: "7 days" },
  { value: "30_days", label: "30 days" },
  { value: "90_days", label: "90 days" },
  { value: "180_days", label: "180 days" },
  { value: "ongoing", label: "Ongoing" },
];

function formatDurationLabel(code) {
  const o = DURATION_OPTIONS.find((x) => x.value === code);
  return o ? o.label : code || "—";
}

function formatRequestDate(iso) {
  if (!iso) return "—";
  const d = String(iso).slice(0, 10);
  return d.length === 10 ? d : iso;
}

const businessRequestHistoryCols = [
  {
    key: "dataset_name",
    label: "Dataset",
    render: (v) => <span className="text-[#d7e3f7]">{v || "—"}</span>,
  },
  {
    key: "reason",
    label: "Purpose",
    render: (v) => <span className="line-clamp-2 text-xs text-[#9ab0d1]">{v || "—"}</span>,
  },
  {
    key: "access_type",
    label: "Access",
    render: (v) => <StatusBadge status={String(v || "read").toLowerCase() === "write" ? "Write" : "Read"} />,
  },
  {
    key: "duration",
    label: "Duration",
    render: (v) => <span className="text-xs text-[#9ab0d1]">{formatDurationLabel(v)}</span>,
  },
  {
    key: "approver_name",
    label: "Approver",
    render: (v) => <span className="text-xs text-[#9ab0d1]">{v || "—"}</span>,
  },
  {
    key: "requested_at",
    label: "Requested",
    render: (v) => <span className="text-xs text-[#9ab0d1]">{formatRequestDate(v)}</span>,
  },
  {
    key: "status",
    label: "Status",
    render: (v) => {
      const s = String(v || "").toLowerCase();
      const label = s === "rejected" ? "Denied" : s === "approved" ? "Approved" : "Pending";
      return <StatusBadge status={label} />;
    },
  },
];

function DataRequestsTab() {
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [summaryErr, setSummaryErr] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [tableVer, setTableVer] = useState(0);

  const loadSummary = useCallback(async () => {
    try {
      const res = await enterpriseBusinessDataRequestsSummary();
      const d = res?.data ?? {};
      setSummary({
        total: Number(d.total) || 0,
        pending: Number(d.pending) || 0,
        approved: Number(d.approved) || 0,
        rejected: Number(d.rejected) || 0,
      });
      setSummaryErr("");
    } catch (e) {
      setSummaryErr(e?.response?.data?.detail || "Could not load summary");
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary, tableVer]);

  useEffect(() => {
    const h = () => {
      setTableVer((x) => x + 1);
      loadSummary();
    };
    window.addEventListener("mdqm-requests-refresh", h);
    return () => window.removeEventListener("mdqm-requests-refresh", h);
  }, [loadSummary]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="enterprise-card flex items-start gap-3 p-4">
          <Inbox className="mt-0.5 h-8 w-8 shrink-0 text-sky-400" strokeWidth={1.25} />
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#7f95b6]">Total requests</p>
            <p className="text-2xl font-semibold text-[#d7e3f7]">{summary.total}</p>
            <p className="text-xs text-[#5c6d8a]">All time</p>
          </div>
        </div>
        <div className="enterprise-card flex items-start gap-3 p-4">
          <Clock className="mt-0.5 h-8 w-8 shrink-0 text-amber-400" strokeWidth={1.25} />
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#7f95b6]">Pending</p>
            <p className="text-2xl font-semibold text-[#d7e3f7]">{summary.pending}</p>
            <p className="text-xs text-[#5c6d8a]">Awaiting approval</p>
          </div>
        </div>
        <div className="enterprise-card flex items-start gap-3 p-4">
          <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-emerald-400" strokeWidth={1.25} />
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#7f95b6]">Approved</p>
            <p className="text-2xl font-semibold text-[#d7e3f7]">{summary.approved}</p>
            <p className="text-xs text-[#5c6d8a]">Access granted</p>
          </div>
        </div>
      </div>
      {summary.rejected > 0 ? (
        <p className="text-xs text-[#7f95b6]">
          Denied / rejected in history: <span className="text-[#d7e3f7] font-medium">{summary.rejected}</span>
        </p>
      ) : null}
      {summaryErr ? <p className="text-xs text-amber-400">{summaryErr}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="enterprise-title">My requests</h2>
        <button
          type="button"
          className="rounded bg-[#2b7fff] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-[#1e66db]"
          onClick={() => setModalOpen(true)}
        >
          + New request
        </button>
      </div>

      {modalOpen ? (
        <DataAccessRequestModal
          onClose={() => setModalOpen(false)}
          onSubmitted={() => {
            setModalOpen(false);
            window.dispatchEvent(new CustomEvent("mdqm-requests-refresh"));
            window.dispatchEvent(new CustomEvent("mdqm-notifications-refresh"));
          }}
        />
      ) : null}

      <EnterpriseDataPanel
        key={`bu-req-${tableVer}`}
        title="Request history"
        columns={businessRequestHistoryCols}
        pageSize={10}
        searchPlaceholder="Search purpose or dataset…"
        fetchPage={async ({ page, pageSize, query }) =>
          enterpriseBusinessDataRequests({ page, page_size: pageSize, q: query || undefined })
        }
      />
    </div>
  );
}

function DataAccessRequestModal({ onClose, onSubmitted }) {
  const [datasetOptions, setDatasetOptions] = useState([]);
  const [datasetName, setDatasetName] = useState("");
  const [manualDataset, setManualDataset] = useState("");
  const [reason, setReason] = useState("");
  const [accessType, setAccessType] = useState("read");
  const [duration, setDuration] = useState("30_days");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      try {
        const res = await enterpriseGovernanceDatasets({ page: 1, page_size: 200 });
        const items = Array.isArray(res?.data?.items) ? res.data.items : [];
        const names = [...new Set(items.map((r) => r.name).filter(Boolean))].sort();
        if (on) setDatasetOptions(names);
      } catch {
        if (on) setDatasetOptions([]);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  const effectiveDataset = datasetOptions.length ? datasetName.trim() : manualDataset.trim();

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!effectiveDataset) {
      setErr(datasetOptions.length ? "Select a dataset." : "Enter a dataset name.");
      return;
    }
    if (!reason.trim()) {
      setErr("Describe the business purpose.");
      return;
    }
    try {
      await enterpriseBusinessDataRequestCreate({
        reason: reason.trim(),
        dataset_name: effectiveDataset,
        access_type: accessType,
        duration,
        department: null,
      });
      onSubmitted?.();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Submit failed");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-[#2a3f63] bg-[#0f1b31] p-5 shadow-xl"
        role="dialog"
        aria-labelledby="dar-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 id="dar-title" className="enterprise-title text-base">
            New data access request
          </h2>
          <button type="button" className="rounded p-1 text-[#9ab0d1] hover:bg-[#1a2844]" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <p className="mb-4 text-xs text-[#7f95b6]">Submitted to your governance queue for admin review.</p>
        {err ? <p className="mb-3 text-xs text-red-400">{err}</p> : null}
        <form className="space-y-4 text-sm" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-xs text-[#7f95b6]">Dataset</label>
            {loading ? (
              <p className="text-xs text-[#7f95b6]">Loading catalog…</p>
            ) : datasetOptions.length ? (
              <select
                required
                className="w-full rounded border border-[#2a3f63] bg-[#0a1220] px-3 py-2 text-[#d7e3f7]"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
              >
                <option value="">Select dataset…</option>
                {datasetOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="w-full rounded border border-[#2a3f63] bg-[#0a1220] px-3 py-2 text-[#d7e3f7]"
                placeholder="Dataset name"
                value={manualDataset}
                onChange={(e) => setManualDataset(e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#7f95b6]">Business purpose</label>
            <textarea
              required
              className="min-h-[88px] w-full rounded border border-[#2a3f63] bg-[#0a1220] px-3 py-2 text-[#d7e3f7]"
              placeholder="Describe why you need access"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#7f95b6]">Access type</label>
            <select
              className="w-full rounded border border-[#2a3f63] bg-[#0a1220] px-3 py-2 text-[#d7e3f7]"
              value={accessType}
              onChange={(e) => setAccessType(e.target.value)}
            >
              <option value="read">Read</option>
              <option value="write">Write</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#7f95b6]">Duration</label>
            <select
              className="w-full rounded border border-[#2a3f63] bg-[#0a1220] px-3 py-2 text-[#d7e3f7]"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            >
              {DURATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button type="submit" className="rounded bg-[#2b7fff] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white">
              Submit request
            </button>
            <button
              type="button"
              className="rounded border border-[#2a3f63] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#d7e3f7]"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LineagePanel() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await lineageGraph();
        if (on) setData(res.data);
      } catch (e) {
        if (on) setErr(e?.response?.data?.detail || "Could not load lineage");
      }
    })();
    return () => {
      on = false;
    };
  }, []);
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const edges = Array.isArray(data?.edges) ? data.edges : [];
  return (
    <div className="space-y-4">
      {err ? <p className="text-sm text-amber-400">{err}</p> : null}
      <div className="enterprise-card p-4 text-sm text-[#d7e3f7]">
        <h3 className="enterprise-title mb-2">Graph summary</h3>
        <p className="text-xs text-[#7f95b6] mb-2">
          {nodes.length} nodes · {edges.length} edges (from <code className="text-[#9ec5ff]">/api/lineage/graph</code>)
        </p>
      </div>
      <EnterpriseDataPanel
        title="Nodes"
        columns={[
          { key: "key", label: "Key" },
          { key: "type", label: "Type" },
          { key: "domain", label: "Domain" },
        ]}
        pageSize={15}
        fetchPage={async ({ page, pageSize }) => {
          const start = (page - 1) * pageSize;
          const slice = nodes.slice(start, start + pageSize);
          return { data: { items: slice, total: nodes.length, page, page_size: pageSize } };
        }}
      />
    </div>
  );
}

function AlertsPanel() {
  const [ver, setVer] = useState(0);
  useEffect(() => {
    const h = () => setVer((v) => v + 1);
    window.addEventListener("mdqm-notifications-refresh", h);
    return () => window.removeEventListener("mdqm-notifications-refresh", h);
  }, []);
  return (
    <EnterpriseDataPanel
      key={`bu-alerts-${ver}`}
      title="Notifications"
      columns={notifCols}
      fetchPage={async ({ page, pageSize }) => enterpriseNotifications({ page, page_size: pageSize })}
    />
  );
}

export function renderBusinessUserTab(tabId) {
  switch (tabId) {
    case "catalog":
      return (
        <div className="space-y-6">
          <EnterpriseDataPanel
            title="Enterprise datasets"
            columns={datasetCols}
            fetchPage={({ page, pageSize, query }) => enterpriseGovernanceDatasets({ page, page_size: pageSize, q: query || undefined })}
          />
          <EnterpriseDataPanel
            title="Policies (read-only)"
            columns={policyCols}
            fetchPage={({ page, pageSize, query }) => enterpriseGovernancePolicies({ page, page_size: pageSize, q: query || undefined })}
          />
        </div>
      );
    case "quality":
      return (
        <EnterpriseDataPanel
          title="Validation runs"
          columns={validationCols}
          fetchPage={({ page, pageSize, query }) => enterpriseValidationResults({ page, page_size: pageSize, q: query || undefined })}
        />
      );
    case "glossary":
      return (
        <EnterpriseDataPanel
          title="Business glossary"
          columns={glossaryCols}
          fetchPage={({ page, pageSize, query }) => enterpriseGovernanceGlossary({ page, page_size: pageSize, q: query || undefined })}
        />
      );
    case "lineage":
      return <LineagePanel />;
    case "reports":
      return (
        <div className="space-y-4">
          <p className="text-xs text-[#7f95b6]">Showing your own exports when logged in as a business user.</p>
          <EnterpriseDataPanel
            title="My report exports"
            columns={reportCols}
            fetchPage={({ page, pageSize }) => enterpriseReportsExports({ page, page_size: pageSize })}
          />
        </div>
      );
    case "compliance":
      return (
        <EnterpriseDataPanel
          title="Compliance reports"
          columns={complianceCols}
          fetchPage={({ page, pageSize }) => enterpriseComplianceReports({ page, page_size: pageSize })}
        />
      );
    case "issues":
      return (
        <EnterpriseDataPanel
          title="Stewardship issues (read-only)"
          columns={issueCols}
          fetchPage={({ page, pageSize, query }) => enterpriseStewardshipIssues({ page, page_size: pageSize, q: query || undefined })}
        />
      );
    case "requests":
      return <DataRequestsTab />;
    case "alerts":
      return <AlertsPanel />;
    default:
      return <p className="text-sm text-[#9ab0d1]">Unknown tab.</p>;
  }
}

export function BusinessUserOverviewExtra() {
  return <MonitoringStrip />;
}

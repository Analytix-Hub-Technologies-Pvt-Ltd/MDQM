import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, Inbox, X } from "lucide-react";
import EnterpriseDataPanel, { StatusBadge } from "../../../components/enterprise/EnterpriseDataPanel";
import {
  enterpriseBusinessDataRequestCancel,
  enterpriseBusinessDataRequestCreate,
  enterpriseBusinessDataRequests,
  enterpriseBusinessDataRequestsSummary,
  enterpriseComplianceReports,
  enterpriseGovernanceDatasets,
  enterpriseStewardshipIssues,
  enterpriseBusinessLineage,
} from "../enterpriseApi";
import { formatAccessType } from "../../../utils/formatRelativeTime";
import CatalogPanel from "./business/CatalogPanel";
import QualityPanel from "./business/QualityPanel";
import GlossaryPanel from "./business/GlossaryPanel";
import ReportsPanel from "./business/ReportsPanel";
import AlertsPanel from "./business/AlertsPanel";
import LineageGraphView from "../../../components/business/LineageGraphView";

const complianceCols = [
  { key: "title", label: "Title" },
  { key: "framework", label: "Framework" },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
  { key: "created_at", label: "Created" },
];

const issueCols = [
  { key: "dataset_name", label: "Dataset" },
  { key: "severity", label: "Severity", render: (v) => <StatusBadge status={v} /> },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
  { key: "created_at", label: "Opened" },
];

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
    render: (v) => <StatusBadge status={formatAccessType(v)} />,
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
  {
    key: "id",
    label: "",
    render: (_, row) => {
      if (String(row.status || "").toLowerCase() !== "pending") return null;
      return (
        <button
          type="button"
          className="text-xs text-red-400 underline"
          onClick={async () => {
            if (!window.confirm("Cancel this pending request?")) return;
            try {
              await enterpriseBusinessDataRequestCancel(row.id);
              window.dispatchEvent(new CustomEvent("mdqm-requests-refresh"));
              window.dispatchEvent(new CustomEvent("mdqm-notifications-refresh"));
            } catch {
              /* ignore */
            }
          }}
        >
          Cancel
        </button>
      );
    },
  },
];

function DataRequestsTab() {
  const [searchParams] = useSearchParams();
  const presetDataset = searchParams.get("dataset") || "";
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [summaryErr, setSummaryErr] = useState("");
  const [modalOpen, setModalOpen] = useState(!!presetDataset);
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
          initialDataset={presetDataset}
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

function DataAccessRequestModal({ onClose, onSubmitted, initialDataset = "" }) {
  const [datasetOptions, setDatasetOptions] = useState([]);
  const [datasetName, setDatasetName] = useState(initialDataset);
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
              <option value="read_export">Read/Export</option>
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
  const [searchParams] = useSearchParams();
  const focusDataset = searchParams.get("dataset") || "";
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await enterpriseBusinessLineage(focusDataset ? { dataset: focusDataset } : undefined);
        if (on) setData(res.data);
      } catch (e) {
        if (on) setErr(e?.response?.data?.detail || "Could not load lineage");
      }
    })();
    return () => {
      on = false;
    };
  }, [focusDataset]);
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const edges = Array.isArray(data?.edges) ? data.edges : [];
  return (
    <div className="space-y-4">
      {err ? <p className="text-sm text-amber-400">{err}</p> : null}
      <div className="enterprise-card p-4">
        <h3 className="enterprise-title mb-2">Data flow overview</h3>
        <p className="text-xs text-[#7f95b6] mb-4">
          {focusDataset ? (
            <>
              Focus: <span className="text-[#d7e3f7]">{focusDataset}</span> — {nodes.length} nodes, {edges.length} edges
            </>
          ) : (
            <>Read-only lineage — {nodes.length} nodes, {edges.length} edges</>
          )}
        </p>
        <LineageGraphView nodes={nodes} edges={edges} />
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

export function renderBusinessUserTab(tabId) {
  switch (tabId) {
    case "catalog":
      return <CatalogPanel />;
    case "quality":
      return <QualityPanel />;
    case "glossary":
      return <GlossaryPanel />;
    case "lineage":
      return <LineagePanel />;
    case "reports":
      return <ReportsPanel />;
    case "compliance":
      return (
        <div className="space-y-3">
          <p className="text-xs text-[#7f95b6]">Regulatory and framework attestations published by your governance team.</p>
          <EnterpriseDataPanel
            title="Compliance reports"
            columns={complianceCols}
            emptyMessage="No compliance reports yet. Your CDO or auditor can publish reports from the compliance workspace."
            fetchPage={({ page, pageSize }) => enterpriseComplianceReports({ page, page_size: pageSize })}
          />
        </div>
      );
    case "issues":
      return (
        <div className="space-y-3">
          <p className="text-xs text-[#7f95b6]">Open data quality issues tracked by stewards (read-only).</p>
          <EnterpriseDataPanel
            title="Stewardship issues (read-only)"
            columns={issueCols}
            emptyMessage="No open issues in the queue. Issues appear when stewards log remediation tasks."
            fetchPage={({ page, pageSize, query }) => enterpriseStewardshipIssues({ page, page_size: pageSize, q: query || undefined })}
          />
        </div>
      );
    case "requests":
      return <DataRequestsTab />;
    case "alerts":
      return <AlertsPanel />;
    default:
      return <p className="text-sm text-[#9ab0d1]">Unknown tab.</p>;
  }
}

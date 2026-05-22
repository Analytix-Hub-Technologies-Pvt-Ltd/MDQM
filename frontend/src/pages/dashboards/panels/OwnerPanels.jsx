import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatAccessType } from "../../../utils/formatRelativeTime";
import EnterpriseDataPanel, { StatusBadge, TableCellText } from "../../../components/enterprise/EnterpriseDataPanel";
import ScoreRing from "../../../components/business/ScoreRing";
import CreateDatasetLightModal from "./CreateDatasetLightModal";
import DatasetPreviewModal from "./DatasetPreviewModal";
import DatasetRefreshScheduleModal from "./DatasetRefreshScheduleModal";
import { getAllSchedules, importJobFromDb, refreshJobFromDb } from "../../../api";
import {
  enterpriseGovernanceAccessRequests,
  enterpriseGovernanceAccessRequestApprove,
  enterpriseGovernanceAccessRequestReject,
  enterpriseGovernanceDatasets,
  openGovernanceDatasetEdaReport,
  enterpriseGovernanceGlossary,
  enterpriseGovernanceGlossaryCreate,
  enterpriseGovernancePolicies,
  enterpriseGovernancePolicyCreate,
  enterpriseGovernanceBusinessReports,
  enterpriseGovernanceBusinessReportPublish,
  enterpriseGovernanceBusinessReportDelete,
} from "../enterpriseApi";

const polCols = [
  { key: "policy_name", label: "Policy" },
  { key: "domain", label: "Domain" },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
];

const glCols = [
  { key: "term", label: "Term" },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
  { key: "domain", label: "Domain" },
];

const accessBaseCols = [
  { key: "id", label: "ID" },
  { key: "dataset_name", label: "Dataset" },
  { key: "requester", label: "Requester" },
  { key: "email", label: "Email" },
  {
    key: "access_type",
    label: "Access",
    render: (v) => <StatusBadge status={formatAccessType(v)} />,
  },
  { key: "duration", label: "Duration" },
  {
    key: "reason",
    label: "Purpose",
    render: (v) => (
      <TableCellText className="line-clamp-2 max-w-[200px] text-foreground">{v || "—"}</TableCellText>
    ),
  },
];

function AccessRequestActions({ row }) {
  const [busy, setBusy] = useState(null);

  const handleApprove = async () => {
    setBusy("approve");
    try {
      await enterpriseGovernanceAccessRequestApprove(row.id);
      window.dispatchEvent(new CustomEvent("mdqm-owner-access-refresh"));
      window.dispatchEvent(new CustomEvent("mdqm-notifications-refresh"));
    } catch (e) {
      alert(e?.response?.data?.detail || "Approve failed");
    } finally {
      setBusy(null);
    }
  };

  const handleDeny = async () => {
    if (!window.confirm(`Deny access to "${row.dataset_name}" for ${row.email}?`)) return;
    setBusy("deny");
    try {
      await enterpriseGovernanceAccessRequestReject(row.id);
      window.dispatchEvent(new CustomEvent("mdqm-owner-access-refresh"));
      window.dispatchEvent(new CustomEvent("mdqm-notifications-refresh"));
    } catch (e) {
      alert(e?.response?.data?.detail || "Deny failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-nowrap items-center gap-2 py-1">
      <button
        type="button"
        disabled={busy !== null}
        onClick={handleApprove}
        className="inline-flex min-w-[5.5rem] items-center justify-center rounded-md border border-emerald-500/60 bg-emerald-600 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy === "approve" ? "Working…" : "Approve"}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={handleDeny}
        className="inline-flex min-w-[5.5rem] items-center justify-center rounded-md border border-red-500/50 bg-[#2a1518] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-red-200 shadow-sm transition-colors hover:border-red-400 hover:bg-red-900/60 focus:outline-none focus:ring-2 focus:ring-red-400/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy === "deny" ? "Working…" : "Deny"}
      </button>
    </div>
  );
}

const accessPendingCols = [
  ...accessBaseCols,
  { key: "requested_at", label: "Requested" },
  {
    key: "id",
    label: "Actions",
    render: (_, row) => <AccessRequestActions row={row} />,
  },
];

const accessHistoryCols = [
  ...accessBaseCols,
  {
    key: "status",
    label: "Status",
    render: (v) => {
      const s = String(v || "").toLowerCase();
      const label = s === "rejected" ? "Denied" : s === "approved" ? "Approved" : v;
      return <StatusBadge status={label} />;
    },
  },
  {
    key: "approver_name",
    label: "Reviewer",
    render: (v) => <TableCellText>{v || "—"}</TableCellText>,
  },
  { key: "requested_at", label: "Requested" },
];

function OwnerAccessRequestsSection() {
  const [tableVer, setTableVer] = useState(0);

  useEffect(() => {
    const onRefresh = () => setTableVer((v) => v + 1);
    window.addEventListener("mdqm-owner-access-refresh", onRefresh);
    return () => window.removeEventListener("mdqm-owner-access-refresh", onRefresh);
  }, []);

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Review business-user dataset access requests. Approve or deny pending items; past decisions appear in history.
      </p>

      <EnterpriseDataPanel
        key={`owner-access-pending-${tableVer}`}
        title="Pending requests"
        columns={accessPendingCols}
        pageSize={10}
        searchPlaceholder="Search pending by dataset, email, or purpose…"
        emptyMessage="No pending access requests."
        fetchPage={({ page, pageSize, query }) =>
          enterpriseGovernanceAccessRequests({
            page,
            page_size: pageSize,
            status: "pending",
            ...(query ? { q: query.trim() } : {}),
          })
        }
        refreshEventName="mdqm-owner-access-refresh"
      />

      <EnterpriseDataPanel
        key={`owner-access-history-${tableVer}`}
        title="Request history"
        columns={accessHistoryCols}
        pageSize={10}
        searchPlaceholder="Search history by dataset, email, or purpose…"
        emptyMessage="No completed requests yet."
        fetchPage={({ page, pageSize, query }) =>
          enterpriseGovernanceAccessRequests({
            page,
            page_size: pageSize,
            history: true,
            ...(query ? { q: query.trim() } : {}),
          })
        }
        refreshEventName="mdqm-owner-access-refresh"
      />
    </div>
  );
}

const reportCols = [
  { key: "title", label: "Report" },
  { key: "report_type", label: "Type" },
  { key: "dataset_name", label: "Source dataset" },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
  { key: "quality_score", label: "Score" },
  { key: "last_refreshed", label: "Refreshed" },
  {
    key: "id",
    label: "",
    render: (_, row) => (
      <button
        type="button"
        className="text-xs text-red-400 underline"
        onClick={async () => {
          if (!window.confirm(`Remove report "${row.title}"?`)) return;
          try {
            await enterpriseGovernanceBusinessReportDelete(row.id);
            window.dispatchEvent(new CustomEvent("mdqm-owner-reports-refresh"));
          } catch {
            /* ignore */
          }
        }}
      >
        Delete
      </button>
    ),
  },
];

function scoreCell(value, source, pendingLabel) {
  if (value == null || value === "") {
    const hint =
      source === "no_csv"
        ? "No CSV snapshot"
        : source === "pending"
          ? pendingLabel || "Run DQ job"
          : source === "none"
            ? "No job linked"
            : "—";
    return <span className="text-[#5c6d8a] text-xs" title={hint}>{hint}</span>;
  }
  return <ScoreRing score={value} size={36} />;
}

function formatRegisteredAt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function sourceKindLabel(kind) {
  if (kind === "table") return "Table";
  if (kind === "file") return "File";
  return "—";
}

function GovernanceDatasetSection() {
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewDatasetId, setPreviewDatasetId] = useState(null);
  const [scheduleRow, setScheduleRow] = useState(null);
  const [refreshSchedules, setRefreshSchedules] = useState({});
  const [actionBusy, setActionBusy] = useState(null);

  const bump = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAllSchedules();
        const items = res?.data?.items ?? [];
        const map = {};
        for (const s of items) {
          if (s?.job_id && s?.action === "refresh") {
            map[s.job_id] = s;
          }
        }
        if (!cancelled) setRefreshSchedules(map);
      } catch {
        if (!cancelled) setRefreshSchedules({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const handleRunImport = async (row) => {
    if (!row.job_id) return;
    setActionBusy(`run-${row.id}`);
    try {
      await importJobFromDb(row.job_id);
      bump();
    } catch (e) {
      alert(e?.response?.data?.detail || e?.message || "Import failed to start.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleRefresh = async (row) => {
    if (!row.job_id) return;
    setActionBusy(`refresh-${row.id}`);
    try {
      await refreshJobFromDb(row.job_id, {});
      bump();
    } catch (e) {
      alert(e?.response?.data?.detail || e?.message || "Refresh failed.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleEdaReport = async (row) => {
    if (!row.eda_report_ready) {
      alert("Load data first (Run), then open the EDA report.");
      return;
    }
    setActionBusy(`eda-${row.id}`);
    try {
      await openGovernanceDatasetEdaReport(row.id);
    } catch (e) {
      alert(e?.response?.data?.detail || e?.message || "EDA report failed.");
    } finally {
      setActionBusy(null);
    }
  };

  const dsCols = [
    { key: "name", label: "Dataset" },
    {
      key: "source_details",
      label: "Source",
      render: (v, row) => (
        <div className="max-w-[240px]">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {sourceKindLabel(row.source_kind)}
          </span>
          <p className="text-xs text-muted-foreground line-clamp-2" title={v || ""}>
            {v || "—"}
          </p>
        </div>
      ),
    },
    {
      key: "column_count",
      label: "Columns",
      render: (v) => (
        <span className="text-xs font-mono text-foreground">{v != null ? v : "—"}</span>
      ),
    },
    {
      key: "eda_report",
      label: "EDA report",
      render: (_, row) => (
        <button
          type="button"
          disabled={!row.eda_report_ready || actionBusy === `eda-${row.id}`}
          className="text-xs font-semibold text-primary hover:underline disabled:opacity-40 whitespace-nowrap"
          title={row.eda_report_ready ? "Open ydata-profiling report" : "Load data first (Run)"}
          onClick={() => handleEdaReport(row)}
        >
          {actionBusy === `eda-${row.id}` ? "Opening…" : "EDA report"}
        </button>
      ),
    },
    {
      key: "eda_score",
      label: "EDA score",
      render: (v, row) => scoreCell(v, row.eda_score_source, "Load data"),
    },
    {
      key: "dq_score",
      label: "DQ score",
      render: (v, row) => scoreCell(v, row.dq_score_source, "Run validation"),
    },
    {
      key: "created_at",
      label: "Registered",
      render: (v) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">{formatRegisteredAt(v)}</span>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (_, row) => {
        const sched = row.job_id ? refreshSchedules[row.job_id] : null;
        const isTableSource = row.source_kind === "table";
        return (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
              onClick={() => setPreviewDatasetId(row.id)}
            >
              View
            </button>
            {row.job_id && !row.data_loaded ? (
              <button
                type="button"
                disabled={actionBusy === `run-${row.id}` || row.import_status === "Importing"}
                className="text-xs font-semibold text-primary hover:underline disabled:opacity-40 whitespace-nowrap"
                onClick={() => handleRunImport(row)}
              >
                {actionBusy === `run-${row.id}` || row.import_status === "Importing" ? "Starting…" : "Run"}
              </button>
            ) : null}
            {row.job_id && row.data_loaded ? (
              <button
                type="button"
                disabled={actionBusy === `refresh-${row.id}`}
                className="text-xs font-semibold text-primary hover:underline disabled:opacity-40 whitespace-nowrap"
                onClick={() => handleRefresh(row)}
              >
                {actionBusy === `refresh-${row.id}` ? "…" : "Refresh now"}
              </button>
            ) : null}
            {row.job_id && isTableSource ? (
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
                title={
                  sched?.next_run_time
                    ? `Scheduled: ${new Date(sched.next_run_time).toLocaleString()}`
                    : "Set automatic refresh from database"
                }
                onClick={() => setScheduleRow(row)}
              >
                {sched?.next_run_time ? "Scheduled" : "Schedule"}
              </button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <DatasetPreviewModal
        datasetId={previewDatasetId}
        open={previewDatasetId != null}
        onClose={() => setPreviewDatasetId(null)}
      />
      <DatasetRefreshScheduleModal
        open={scheduleRow != null}
        jobId={scheduleRow?.job_id}
        datasetName={scheduleRow?.name}
        onClose={() => setScheduleRow(null)}
        onSaved={bump}
      />
      <CreateDatasetLightModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={bump}
      />
      <div className="enterprise-card p-5 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="enterprise-title text-sm">Create dataset</h3>
            <p className="text-xs text-muted-foreground mt-2 max-w-2xl">
              Register a CSV or a single database table, then close the dialog. Use <strong className="font-normal text-foreground">Run</strong> to load
              data, <strong className="font-normal text-foreground">Schedule</strong> for automatic DB refresh (table sources), and{" "}
              <strong className="font-normal text-foreground">EDA report</strong> after data is loaded.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="shrink-0 text-xs uppercase tracking-wide bg-[#2b7fff] text-white px-4 py-2.5 rounded font-semibold hover:opacity-90"
          >
            Create dataset
          </button>
        </div>
      </div>
      <EnterpriseDataPanel
        key={`ds-${refreshKey}`}
        title="Registered datasets"
        columns={dsCols}
        searchPlaceholder="Name contains…"
        fetchPage={({ page, pageSize, query }) =>
          enterpriseGovernanceDatasets({
            page,
            page_size: pageSize,
            ...(query ? { q: query } : {}),
          })
        }
      />
    </div>
  );
}

function GovernancePoliciesSection() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);
  return (
    <div>
      <GovernanceForms variant="policies" onSuccess={bump} />
      <EnterpriseDataPanel
        key={`pol-${refreshKey}`}
        title="Policies"
        columns={polCols}
        searchPlaceholder="Policy name…"
        fetchPage={({ page, pageSize, query }) =>
          enterpriseGovernancePolicies({
            page,
            page_size: pageSize,
            ...(query ? { q: query } : {}),
          })
        }
      />
    </div>
  );
}

function BusinessReportsPublishSection() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [title, setTitle] = useState("");
  const [reportType, setReportType] = useState("BI Dashboard");
  const [datasetName, setDatasetName] = useState("");
  const [status, setStatus] = useState("Certified");
  const [score, setScore] = useState("");
  const [refreshed, setRefreshed] = useState("");
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [datasetOptions, setDatasetOptions] = useState([]);

  useEffect(() => {
    enterpriseGovernanceDatasets({ page: 1, page_size: 200 })
      .then((res) => {
        const items = res?.data?.items ?? [];
        setDatasetOptions(items.map((d) => d.name).filter(Boolean));
      })
      .catch(() => setDatasetOptions([]));
  }, []);

  useEffect(() => {
    const h = () => setRefreshKey((k) => k + 1);
    window.addEventListener("mdqm-owner-reports-refresh", h);
    return () => window.removeEventListener("mdqm-owner-reports-refresh", h);
  }, []);

  const onPublish = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      await enterpriseGovernanceBusinessReportPublish({
        title: title.trim(),
        report_type: reportType,
        dataset_name: datasetName.trim() || null,
        status,
        quality_score: score === "" ? null : Number(score),
        last_refreshed_label: refreshed.trim() || null,
        external_url: url.trim() || null,
      });
      setMsg("Published — visible under Business user → My reports.");
      setTitle("");
      setRefreshed("");
      setUrl("");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setMsg(err?.response?.data?.detail || "Publish failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="enterprise-card p-4 text-sm">
        <h3 className="enterprise-title text-sm mb-1">Publish report for business users</h3>
        <p className="text-xs text-[#7f95b6] mb-3">
          Reports you add here appear on the Business user workspace → My reports. No SQL required.
        </p>
        <form onSubmit={onPublish} className="grid sm:grid-cols-2 gap-2 text-[#d7e3f7]">
          <input
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2 sm:col-span-2"
            placeholder="Report title *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <select
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
          >
            {["BI Dashboard", "Financial Report", "Analytics", "Compliance", "HR Analytics"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["Certified", "Stale", "Outdated"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2 sm:col-span-2"
            value={datasetName}
            onChange={(e) => setDatasetName(e.target.value)}
          >
            <option value="">Source dataset (optional)</option>
            {datasetOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <input
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
            placeholder="Quality score 0–100 (optional)"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            type="number"
            min={0}
            max={100}
          />
          <input
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
            placeholder="Last refresh e.g. 1h ago"
            value={refreshed}
            onChange={(e) => setRefreshed(e.target.value)}
          />
          <input
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2 sm:col-span-2"
            placeholder="Open URL (optional, for Open button)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit" className="sm:col-span-2 text-xs bg-[#2b7fff] text-white py-2 rounded uppercase tracking-wide">
            Publish to My reports
          </button>
        </form>
        {msg ? <p className="text-xs text-[#9ab0d1] mt-2">{msg}</p> : null}
      </div>
      <EnterpriseDataPanel
        key={`br-${refreshKey}`}
        title="Published reports"
        columns={reportCols}
        searchPlaceholder="Search title or dataset…"
        fetchPage={({ page, pageSize, query }) =>
          enterpriseGovernanceBusinessReports({
            page,
            page_size: pageSize,
            ...(query ? { q: query } : {}),
          })
        }
      />
    </div>
  );
}

function GovernanceGlossarySection() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);
  return (
    <div>
      <GovernanceForms variant="glossary" onSuccess={bump} />
      <EnterpriseDataPanel
        key={`gl-${refreshKey}`}
        title="Business glossary"
        columns={glCols}
        fetchPage={({ page, pageSize, query }) => enterpriseGovernanceGlossary({ page, page_size: pageSize, q: query || undefined })}
      />
    </div>
  );
}

function GovernanceForms({ variant, onSuccess }) {
  const [polName, setPolName] = useState("");
  const [polDomain, setPolDomain] = useState("");
  const [polContent, setPolContent] = useState("");
  const [polMsg, setPolMsg] = useState("");

  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [termDomain, setTermDomain] = useState("");
  const [termMsg, setTermMsg] = useState("");

  const onPolicy = async (e) => {
    e.preventDefault();
    setPolMsg("");
    try {
      await enterpriseGovernancePolicyCreate({
        policy_name: polName.trim(),
        domain: polDomain.trim() || null,
        content: polContent.trim() || null,
      });
      setPolMsg("Policy created.");
      setPolName("");
      setPolContent("");
      onSuccess?.();
    } catch (err) {
      setPolMsg(err?.response?.data?.detail || "Save failed");
    }
  };

  const onTerm = async (e) => {
    e.preventDefault();
    setTermMsg("");
    try {
      await enterpriseGovernanceGlossaryCreate({
        term: term.trim(),
        definition: definition.trim(),
        domain: termDomain.trim() || null,
        status: "draft",
      });
      setTermMsg("Term added.");
      setTerm("");
      setDefinition("");
      onSuccess?.();
    } catch (err) {
      setTermMsg(err?.response?.data?.detail || "Save failed");
    }
  };

  if (variant === "policies") {
    return (
      <div className="enterprise-card p-4 mb-4 text-sm space-y-2">
        <h3 className="enterprise-title text-sm">New policy</h3>
        <form onSubmit={onPolicy} className="grid gap-2 text-[#d7e3f7]">
          <input
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
            placeholder="Policy name"
            value={polName}
            onChange={(e) => setPolName(e.target.value)}
            required
          />
          <input
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
            placeholder="Domain (optional)"
            value={polDomain}
            onChange={(e) => setPolDomain(e.target.value)}
          />
          <textarea
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2 min-h-[80px]"
            placeholder="Policy text / notes"
            value={polContent}
            onChange={(e) => setPolContent(e.target.value)}
          />
          <button type="submit" className="text-xs bg-[#2a4a7a] text-white py-2 rounded uppercase tracking-wide">
            Create policy
          </button>
        </form>
        {polMsg ? <p className="text-xs text-[#9ab0d1]">{polMsg}</p> : null}
      </div>
    );
  }
  if (variant === "glossary") {
    return (
      <div className="enterprise-card p-4 mb-4 text-sm space-y-2">
        <h3 className="enterprise-title text-sm">Add glossary term</h3>
        <form onSubmit={onTerm} className="grid gap-2 text-[#d7e3f7]">
          <input
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
            placeholder="Term"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            required
          />
          <textarea
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2 min-h-[72px]"
            placeholder="Definition"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            required
          />
          <input
            className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
            placeholder="Domain (optional)"
            value={termDomain}
            onChange={(e) => setTermDomain(e.target.value)}
          />
          <button type="submit" className="text-xs bg-[#2a4a7a] text-white py-2 rounded uppercase tracking-wide">
            Save term
          </button>
        </form>
        {termMsg ? <p className="text-xs text-[#9ab0d1]">{termMsg}</p> : null}
      </div>
    );
  }
  return null;
}

export function renderOwnerTab(tabId) {
  switch (tabId) {
    case "datasets":
      return <GovernanceDatasetSection />;
    case "policies":
      return <GovernancePoliciesSection />;
    case "glossary":
      return <GovernanceGlossarySection />;
    case "business-reports":
      return <BusinessReportsPublishSection />;
    case "access-requests":
      return <OwnerAccessRequestsSection />;
    case "certifications":
      return (
        <div className="enterprise-card p-5 text-sm text-[#9ab0d1]">
          <h3 className="enterprise-title mb-2">Certifications</h3>
          <p>Dataset certification workflow — tie-ins to governance policies and compliance reports.</p>
        </div>
      );
    case "lineage":
      return (
        <div className="enterprise-card p-5 text-sm text-[#9ab0d1]">
          <h3 className="enterprise-title mb-2">Lineage</h3>
          <Link to="/lineage" className="text-[#4f8cff] hover:underline">
            Open Lineage explorer →
          </Link>
        </div>
      );
    default:
      return null;
  }
}

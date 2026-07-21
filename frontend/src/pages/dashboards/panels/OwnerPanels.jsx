import { useCallback, useEffect, useRef, useState } from "react";
import { formatAccessType, formatDateTime, formatRelativeTime, formatUpcomingRelative } from "../../../utils/formatRelativeTime";
import EnterpriseDataPanel, { StatusBadge, TableCellText } from "../../../components/enterprise/EnterpriseDataPanel";
import ScoreRing from "../../../components/business/ScoreRing";
import DatasetRefreshToastStack, { buildRefreshToast } from "../../../components/business/DatasetRefreshToastStack";
import LineageGraphView from "../../../components/business/LineageGraphView";
import CreateDatasetLightModal from "./CreateDatasetLightModal";
import DatasetPreviewModal from "./DatasetPreviewModal";
import DatasetEdaReportModal from "./DatasetEdaReportModal";
import DatasetRefreshScheduleModal from "./DatasetRefreshScheduleModal";
import { getAllSchedules, importJobFromDb, refreshJobFromDb } from "../../../api";
import {
  enterpriseGovernanceAccessRequests,
  enterpriseGovernanceAccessRequestApprove,
  enterpriseGovernanceAccessRequestReject,
  enterpriseGovernanceDatasets,
  enterpriseGovernanceDatasetsRecycleBin,
  enterpriseGovernanceDatasetDelete,
  enterpriseGovernanceDatasetRestore,
  enterpriseNotifications,
  invalidateEdaReportCache,
  prefetchEdaReportHtml,
  enterpriseGovernanceGlossary,
  enterpriseGovernanceGlossaryCreate,
  enterpriseGovernancePolicies,
  enterpriseGovernancePolicyCreate,
  enterpriseGovernanceBusinessReports,
  enterpriseGovernanceBusinessReportPublish,
  enterpriseGovernanceBusinessReportDelete,
  lineageGraph,
} from "../enterpriseApi";

/** Soft-refresh datasets table without remounting (avoids flicker during import polling). */
const GOVERNANCE_DATASETS_REFRESH = "mdqm-governance-datasets-refresh";
const REFRESH_NOTIF_SEEN_KEY = "mdqm-seen-refresh-notification-ids";

function readSeenRefreshNotifIds() {
  try {
    const raw = sessionStorage.getItem(REFRESH_NOTIF_SEEN_KEY);
    const parsed = JSON.parse(raw || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persistSeenRefreshNotifId(id) {
  const set = readSeenRefreshNotifIds();
  set.add(id);
  sessionStorage.setItem(REFRESH_NOTIF_SEEN_KEY, JSON.stringify([...set].slice(-300)));
}

function refreshDatasetsTable(silent = true) {
  window.dispatchEvent(new CustomEvent(GOVERNANCE_DATASETS_REFRESH, { detail: { silent } }));
}

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
    key: "_actions",
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
    key: "_actions",
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

function formatRegisteredAt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const DATASET_SCORE_SIZE = 30;

function DatasetScoreSlot({ children, title }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center leading-none"
      style={{ width: DATASET_SCORE_SIZE, height: DATASET_SCORE_SIZE }}
      title={title}
    >
      {children}
    </span>
  );
}

function DatasetScorePlaceholder({ title }) {
  return (
    <DatasetScoreSlot title={title}>
      <span className="text-xs text-muted-foreground">—</span>
    </DatasetScoreSlot>
  );
}

function renderEdaScoreCell(row) {
  const st = (row.import_status || "").toLowerCase();
  const edaPending = st === "registered" || st === "importing" || !row.data_loaded;
  if (edaPending || row.eda_score == null) {
    return <DatasetScorePlaceholder title="Run import to calculate EDA score" />;
  }
  return (
    <DatasetScoreSlot title={`EDA score: ${row.eda_score}`}>
      <ScoreRing score={row.eda_score} size={DATASET_SCORE_SIZE} />
    </DatasetScoreSlot>
  );
}

function renderDqScoreCell(row) {
  if (row.dq_score != null) {
    return (
      <DatasetScoreSlot title={`DQ score: ${row.dq_score}`}>
        <ScoreRing score={row.dq_score} size={DATASET_SCORE_SIZE} />
      </DatasetScoreSlot>
    );
  }
  return <DatasetScorePlaceholder title="Run validation to calculate DQ score" />;
}

function GovernanceDatasetSection() {
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recycleBinKey, setRecycleBinKey] = useState(0);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [recycleBusy, setRecycleBusy] = useState(null);
  const [previewDatasetId, setPreviewDatasetId] = useState(null);
  const [edaReport, setEdaReport] = useState(null);
  const [scheduleRow, setScheduleRow] = useState(null);
  const [refreshSchedules, setRefreshSchedules] = useState({});
  const [actionBusy, setActionBusy] = useState(null);
  const [importingJobIds, setImportingJobIds] = useState([]);
  const [refreshToasts, setRefreshToasts] = useState([]);
  const lastRefreshedRef = useRef({});
  const seenNotifIdsRef = useRef(readSeenRefreshNotifIds());
  const pollReadyRef = useRef(false);
  const importingJobsRef = useRef(new Set());
  const toastTimeoutsRef = useRef([]);

  const dismissToast = useCallback((id) => {
    setRefreshToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast, autoDismissMs = 8000) => {
      setRefreshToasts((prev) => {
        let next = prev;
        if (toast.jobId != null && toast.jobId !== 0 && toast.status !== "running") {
          next = prev.filter((t) => !(t.jobId === toast.jobId && t.status === "running"));
        } else if (toast.status === "running" && toast.jobId) {
          next = prev.filter((t) => !(t.jobId === toast.jobId && t.status === "running"));
        }
        return [...next, toast].slice(-4);
      });
      if (autoDismissMs > 0 && toast.status !== "running") {
        const tid = window.setTimeout(() => dismissToast(toast.id), autoDismissMs);
        toastTimeoutsRef.current.push(tid);
      }
    },
    [dismissToast],
  );

  const bump = () => {
    setRefreshKey((k) => k + 1);
    setRecycleBinKey((k) => k + 1);
    refreshDatasetsTable();
  };

  const fetchRecycleBinPage = useCallback(
    ({ page, pageSize, query }) =>
      enterpriseGovernanceDatasetsRecycleBin({
        page,
        page_size: pageSize,
        ...(query ? { q: query } : {}),
      }),
    [],
  );

  const handleRecycleRestore = async (row) => {
    if (!row?.id) return;
    setRecycleBusy(`restore-${row.id}`);
    try {
      await enterpriseGovernanceDatasetRestore(row.id);
      bump();
    } catch {
      /* panel shows stale data until refresh */
    } finally {
      setRecycleBusy(null);
    }
  };

  const handleRecyclePermanentDelete = async (row) => {
    if (!row?.id) return;
    if (!window.confirm(`Permanently delete “${row.name}”? This cannot be undone.`)) return;
    setRecycleBusy(`delete-${row.id}`);
    try {
      await enterpriseGovernanceDatasetDelete(row.id, { mode: "permanent" });
      bump();
    } catch {
      /* ignore */
    } finally {
      setRecycleBusy(null);
    }
  };

  const recycleCols = [
    { key: "name", label: "Dataset", render: (_, row) => <TableCellText className="font-semibold">{row?.name ?? "—"}</TableCellText> },
    {
      key: "deleted_at",
      label: "Moved to bin",
      render: (_, row) => <TableCellText>{row?.deleted_at ? formatRelativeTime(row.deleted_at) : "—"}</TableCellText>,
    },
    {
      key: "purge_at",
      label: "Auto-delete",
      render: (_, row) => (
        <TableCellText>
          {row?.days_until_purge != null
            ? `${row.days_until_purge} day${row.days_until_purge === 1 ? "" : "s"} left`
            : row?.purge_at
              ? formatRelativeTime(row.purge_at)
              : "—"}
        </TableCellText>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (_, row) => (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!row?.id || recycleBusy === `restore-${row.id}`}
            onClick={() => handleRecycleRestore(row)}
            className="text-xs uppercase tracking-wide text-primary hover:underline disabled:opacity-50"
          >
            {recycleBusy === `restore-${row?.id}` ? "Restoring…" : "Restore"}
          </button>
          <button
            type="button"
            disabled={!row?.id || recycleBusy === `delete-${row.id}`}
            onClick={() => handleRecyclePermanentDelete(row)}
            className="text-xs uppercase tracking-wide text-destructive hover:underline disabled:opacity-50"
          >
            {recycleBusy === `delete-${row?.id}` ? "Deleting…" : "Delete now"}
          </button>
        </div>
      ),
    },
  ];

  const fetchGovernanceDatasetsPage = useCallback(
    ({ page, pageSize, query }) =>
      enterpriseGovernanceDatasets({
        page,
        page_size: pageSize,
        ...(query ? { q: query } : {}),
      }),
    [],
  );

  const loadRefreshSchedules = async (cancelledRef) => {
    try {
      const res = await getAllSchedules();
      const items = res?.data?.items ?? [];
      const map = {};
      for (const s of items) {
        if (s?.job_id && s?.action === "refresh") {
          map[s.job_id] = s;
        }
      }
      if (!cancelledRef?.current) setRefreshSchedules(map);
    } catch {
      if (!cancelledRef?.current) setRefreshSchedules({});
    }
  };

  useEffect(() => {
    const cancelled = { current: false };
    loadRefreshSchedules(cancelled);
    return () => {
      cancelled.current = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    const onDatasetsRefresh = () => {
      loadRefreshSchedules({ current: false });
    };
    window.addEventListener(GOVERNANCE_DATASETS_REFRESH, onDatasetsRefresh);
    return () => window.removeEventListener(GOVERNANCE_DATASETS_REFRESH, onDatasetsRefresh);
  }, []);

  useEffect(() => {
    const hasSchedules = Object.keys(refreshSchedules).length > 0;
    const pollMs = hasSchedules ? 5000 : 20000;

    const poll = async () => {
      try {
        const [dsRes, notifRes] = await Promise.all([
          enterpriseGovernanceDatasets({ page: 1, page_size: 100 }),
          enterpriseNotifications({ page: 1, page_size: 12, unread_only: true }),
        ]);
        const items = dsRes?.data?.items ?? [];
        const notifications = notifRes?.data?.items ?? [];

        for (const n of notifications) {
          const subj = String(n.subject || "");
          if (!subj.startsWith("Dataset refresh")) continue;
          if (seenNotifIdsRef.current.has(n.id)) continue;

          seenNotifIdsRef.current.add(n.id);
          persistSeenRefreshNotifId(n.id);

          // First poll after mount: record existing unread items without toasting (page reload).
          if (!pollReadyRef.current) continue;

          const failed = subj.toLowerCase().includes("failed");
          const nameMatch = subj.match(/Dataset refresh(?:ed)?: (.+)/i);
          const datasetName = nameMatch?.[1];
          const matched = datasetName
            ? items.find((i) => i.name === datasetName)
            : null;
          if (matched?.job_id) importingJobsRef.current.delete(matched.job_id);
          pushToast(
            buildRefreshToast({
              status: failed ? "failed" : "completed",
              datasetName,
              jobId: matched?.job_id || 0,
              source: "schedule",
              message: n.body || undefined,
              nextRunTime: matched?.job_id
                ? refreshSchedules[matched.job_id]?.next_run_time
                : null,
            }),
          );
          refreshDatasetsTable();
          loadRefreshSchedules({ current: false });
          window.dispatchEvent(new CustomEvent("mdqm-notifications-refresh"));
        }

        pollReadyRef.current = true;

        for (const item of items) {
          if (!item.job_id) continue;
          const jid = item.job_id;
          const cur = item.last_refreshed_at;
          const prev = lastRefreshedRef.current[jid];
          const st = (item.import_status || "").toLowerCase();
          const sched = refreshSchedules[jid];
          const source = sched ? "schedule" : "manual";

          if (st === "importing" && !importingJobsRef.current.has(jid)) {
            importingJobsRef.current.add(jid);
            pushToast(
              buildRefreshToast({
                status: "running",
                datasetName: item.name,
                jobId: jid,
                source,
                nextRunTime: sched?.next_run_time,
              }),
              0,
            );
          }

          if (st === "import failed" && importingJobsRef.current.has(jid)) {
            importingJobsRef.current.delete(jid);
            pushToast(
              buildRefreshToast({
                status: "failed",
                datasetName: item.name,
                jobId: jid,
                source,
              }),
            );
          }

          lastRefreshedRef.current[jid] = cur ?? prev ?? null;
        }
      } catch {
        /* ignore poll errors */
      }
    };

    poll();
    const id = window.setInterval(poll, pollMs);
    return () => {
      window.clearInterval(id);
      toastTimeoutsRef.current.forEach((tid) => window.clearTimeout(tid));
      toastTimeoutsRef.current = [];
    };
  }, [refreshSchedules, pushToast]);

  useEffect(() => {
    if (!importingJobIds.length) return undefined;

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      refreshDatasetsTable();
      try {
        const res = await enterpriseGovernanceDatasets({ page: 1, page_size: 100 });
        const items = res?.data?.items ?? [];
        setImportingJobIds((prev) => {
          const next = prev.filter((jid) => {
            const match = items.find((i) => i.job_id === jid);
            const st = (match?.import_status || "").toLowerCase();
            return st === "importing";
          });
          for (const jid of prev) {
            if (next.includes(jid)) continue;
            const match = items.find((i) => i.job_id === jid);
            if (match?.id && match.data_loaded) prefetchEdaReportHtml(match.id);
          }
          return next;
        });
      } catch {
        /* keep polling until timeout */
      }
    };

    poll();
    const intervalId = window.setInterval(poll, 3000);
    const stopId = window.setTimeout(() => {
      setImportingJobIds([]);
      refreshDatasetsTable();
    }, 120_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(stopId);
    };
  }, [importingJobIds]);

  const handleRunImport = async (row) => {
    if (!row.job_id) return;
    setActionBusy(`run-${row.id}`);
    invalidateEdaReportCache(row.id);
    setImportingJobIds((prev) =>
      prev.includes(row.job_id) ? prev : [...prev, row.job_id]
    );
    try {
      await importJobFromDb(row.job_id);
      refreshDatasetsTable();
    } catch (e) {
      setImportingJobIds((prev) => prev.filter((id) => id !== row.job_id));
      alert(e?.response?.data?.detail || e?.message || "Import failed to start.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleRefresh = async (row) => {
    if (!row.job_id) return;
    setActionBusy(`refresh-${row.id}`);
    importingJobsRef.current.add(row.job_id);
    pushToast(
      buildRefreshToast({
        status: "running",
        datasetName: row.name,
        jobId: row.job_id,
        source: "manual",
        nextRunTime: refreshSchedules[row.job_id]?.next_run_time,
      }),
      0,
    );
    try {
      await refreshJobFromDb(row.job_id, {});
      invalidateEdaReportCache(row.id);
      lastRefreshedRef.current[row.job_id] = null;
      bump();
      pushToast(
        buildRefreshToast({
          status: "completed",
          datasetName: row.name,
          jobId: row.job_id,
          source: "manual",
        }),
      );
      importingJobsRef.current.delete(row.job_id);
      window.dispatchEvent(new CustomEvent("mdqm-notifications-refresh"));
    } catch (e) {
      importingJobsRef.current.delete(row.job_id);
      pushToast(
        buildRefreshToast({
          status: "failed",
          datasetName: row.name,
          jobId: row.job_id,
          source: "manual",
          message: e?.response?.data?.detail || e?.message || "Refresh failed.",
        }),
      );
    } finally {
      setActionBusy(null);
    }
  };

  const handleEdaReport = (row) => {
    const st = (row.import_status || "").toLowerCase();
    const ready = row.eda_report_ready && st !== "registered" && st !== "importing";
    if (!ready) {
      alert("Run import first, then open the EDA report.");
      return;
    }
    setEdaReport({ id: row.id, name: row.name });
  };

  const dsCols = [
    {
      key: "name",
      label: "Dataset",
      headerClassName: "whitespace-nowrap",
      render: (v) => (
        <span className="text-xs font-semibold text-foreground line-clamp-2" title={v || ""}>
          {v || "—"}
        </span>
      ),
    },
    {
      key: "source_details",
      label: "Source",
      headerClassName: "whitespace-nowrap",
      render: (v, row) => (
        <span
          className="block max-w-[10rem] truncate text-xs text-muted-foreground"
          title={row.source_tooltip || v || ""}
        >
          {v || "—"}
        </span>
      ),
    },
    {
      key: "column_count",
      label: "Cols",
      headerClassName: "text-center w-px whitespace-nowrap",
      cellClassName: "text-center w-px whitespace-nowrap",
      render: (v) => (
        <span className="text-xs font-mono text-foreground">{v != null ? v : "—"}</span>
      ),
    },
    {
      key: "eda_report",
      label: "EDA",
      headerClassName: "w-px whitespace-nowrap",
      cellClassName: "w-px whitespace-nowrap",
      render: (_, row) => {
        const st = (row.import_status || "").toLowerCase();
        const ready = row.eda_report_ready && st !== "registered" && st !== "importing";
        return (
          <button
            type="button"
            disabled={!ready}
            className="text-xs font-semibold text-primary hover:underline disabled:opacity-40 whitespace-nowrap"
            title={ready ? "View ydata-profiling report" : "Run import first"}
            onClick={() => handleEdaReport(row)}
          >
            Report
          </button>
        );
      },
    },
    {
      key: "eda_score",
      label: "EDA score",
      headerTitle: "Exploratory data score — column completeness after import",
      headerClassName: "text-center w-px whitespace-nowrap",
      cellClassName: "text-center w-px whitespace-nowrap",
      render: (_, row) => renderEdaScoreCell(row),
    },
    {
      key: "dq_score",
      label: "DQ score",
      headerTitle: "Data quality score — validation pass rate after rules run",
      headerClassName: "text-center w-px whitespace-nowrap",
      cellClassName: "text-center w-px whitespace-nowrap",
      render: (_, row) => renderDqScoreCell(row),
    },
    {
      key: "created_at",
      label: "Registered",
      headerClassName: "whitespace-nowrap",
      cellClassName: "whitespace-nowrap",
      render: (v) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">{formatRegisteredAt(v)}</span>
      ),
    },
    {
      key: "last_refreshed_at",
      label: "Refreshed",
      headerClassName: "whitespace-nowrap",
      cellClassName: "whitespace-nowrap",
      render: (v, row) => {
        if (!row.data_loaded || !v) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <span
            className="text-xs text-muted-foreground whitespace-nowrap"
            title={formatRegisteredAt(v)}
          >
            {formatRelativeTime(v)}
          </span>
        );
      },
    },
    {
      key: "next_schedule",
      label: "Next refresh",
      headerClassName: "whitespace-nowrap",
      cellClassName: "whitespace-nowrap",
      render: (_, row) => {
        if (!row.job_id) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        const sched = refreshSchedules[row.job_id];
        if (!sched) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        if (sched.paused) {
          return <span className="text-xs text-amber-600 whitespace-nowrap">Paused</span>;
        }
        if (!sched.next_run_time) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <span
            className="text-xs text-muted-foreground whitespace-nowrap"
            title={formatUpcomingRelative(sched.next_run_time)}
          >
            {formatDateTime(sched.next_run_time)}
          </span>
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      headerClassName: "whitespace-nowrap",
      cellClassName: "whitespace-nowrap",
      render: (_, row) => {
        const sched = row.job_id ? refreshSchedules[row.job_id] : null;
        const isTableSource = row.source_kind === "table";
        const importStatus = (row.import_status || "").toLowerCase();
        const isImporting =
          importStatus === "importing" ||
          (row.job_id != null && importingJobIds.includes(row.job_id));
        const awaitingImport =
          importStatus === "registered" || importStatus === "import failed";
        const showRun =
          row.job_id && isTableSource && awaitingImport && !isImporting;
        const showPostLoad =
          row.job_id && row.data_loaded && !awaitingImport && !isImporting;

        const actionLinks = [
          <button
            key="view"
            type="button"
            className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
            onClick={() => setPreviewDatasetId(row.id)}
          >
            View
          </button>,
        ];

        if (showRun) {
          actionLinks.push(
            <button
              key="run"
              type="button"
              disabled={actionBusy === `run-${row.id}`}
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-40 whitespace-nowrap"
              onClick={() => handleRunImport(row)}
            >
              {actionBusy === `run-${row.id}` ? "Starting…" : "Run"}
            </button>,
          );
        } else if (isImporting) {
          actionLinks.push(
            <span key="importing" className="text-xs text-muted-foreground whitespace-nowrap">
              Importing…
            </span>,
          );
        } else if (showPostLoad) {
          actionLinks.push(
            <button
              key="refresh"
              type="button"
              disabled={actionBusy === `refresh-${row.id}`}
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-40 whitespace-nowrap"
              onClick={() => handleRefresh(row)}
            >
              {actionBusy === `refresh-${row.id}` ? "…" : "Refresh"}
            </button>,
          );
        }

        if (showPostLoad) {
          actionLinks.push(
            <button
              key="schedule"
              type="button"
              className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
              title={
                sched?.next_run_time
                  ? "Manage automatic refresh schedule"
                  : "Set automatic refresh schedule"
              }
              onClick={() => setScheduleRow(row)}
            >
              {sched?.next_run_time ? "Scheduled" : "Schedule"}
            </button>,
          );
        }

        return (
          <div className="flex items-center gap-1 whitespace-nowrap">
            {actionLinks.map((link, i) => (
              <span key={link.key} className="inline-flex items-center gap-1">
                {i > 0 ? <span className="text-muted-foreground/50 select-none">·</span> : null}
                {link}
              </span>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <DatasetRefreshToastStack toasts={refreshToasts} onDismiss={dismissToast} />
      <DatasetPreviewModal
        datasetId={previewDatasetId}
        open={previewDatasetId != null}
        onClose={() => setPreviewDatasetId(null)}
        onUpdated={() => bump()}
        onDeleted={(info) => {
          bump();
          if (info?.mode === "recycle") setRecycleBinOpen(true);
        }}
      />
      <DatasetEdaReportModal
        datasetId={edaReport?.id ?? null}
        datasetName={edaReport?.name}
        open={edaReport != null}
        onClose={() => setEdaReport(null)}
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setRecycleBinOpen((v) => !v)}
          className="text-xs uppercase tracking-wide border border-border px-3 py-2 rounded font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          {recycleBinOpen ? "Hide recycle bin" : "Recycle bin"}
        </button>
      </div>
      <EnterpriseDataPanel
        key={`ds-${refreshKey}`}
        title="Registered datasets"
        columns={dsCols}
        refreshEventName={GOVERNANCE_DATASETS_REFRESH}
        searchPlaceholder="Name contains…"
        fetchPage={fetchGovernanceDatasetsPage}
        minTableWidth={980}
        dense
      />
      {recycleBinOpen ? (
        <EnterpriseDataPanel
          key={`rb-${recycleBinKey}`}
          title="Recycle bin"
          columns={recycleCols}
          searchPlaceholder="Name contains…"
          fetchPage={fetchRecycleBinPage}
          emptyMessage="No datasets in the recycle bin."
        />
      ) : null}
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

function OwnerLineageSection() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const fetchLineage = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await lineageGraph();
      setData(res.data);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Could not load lineage graph");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLineage();
  }, []);

  const allNodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const allEdges = Array.isArray(data?.edges) ? data.edges : [];

  /* Optional client-side filter for quick focus */
  const lowerFilter = filter.trim().toLowerCase();
  let nodes = allNodes;
  let edges = allEdges;
  if (lowerFilter) {
    const matchIds = new Set();
    allNodes.forEach((n) => {
      if (
        (n.label || "").toLowerCase().includes(lowerFilter) ||
        (n.key || "").toLowerCase().includes(lowerFilter) ||
        (n.domain || "").toLowerCase().includes(lowerFilter)
      ) {
        matchIds.add(n.id);
      }
    });
    /* Also keep direct neighbours for context */
    const contextIds = new Set(matchIds);
    allEdges.forEach((e) => {
      if (matchIds.has(e.from) || matchIds.has(e.to)) {
        contextIds.add(e.from);
        contextIds.add(e.to);
      }
    });
    nodes = allNodes.filter((n) => contextIds.has(n.id));
    edges = allEdges.filter((e) => contextIds.has(e.from) && contextIds.has(e.to));
  }

  return (
    <div className="space-y-4">
      {err ? <p className="text-sm text-amber-400">{err}</p> : null}
      <div className="enterprise-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="enterprise-title mb-1">Data lineage graph</h3>
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Loading lineage…"
                : `${allNodes.length} nodes, ${allEdges.length} edges — seeded from your registered datasets`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="rounded border border-slate-200 dark:border-[#2a3f63] bg-white dark:bg-[#0a1220] px-2 py-1.5 text-xs text-slate-900 dark:text-[#d7e3f7] placeholder:text-slate-400 dark:placeholder:text-[#5c6d8a] focus:outline-none focus:ring-1 focus:ring-[#4f8cff]/40 w-52"
              placeholder="Filter by name, domain…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              type="button"
              onClick={fetchLineage}
              disabled={loading}
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-40 whitespace-nowrap"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
        {!loading && nodes.length > 0 ? (
          <LineageGraphView nodes={nodes} edges={edges} />
        ) : !loading && !err ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No lineage data yet. Register datasets and run imports — lineage is generated automatically.
          </p>
        ) : null}
      </div>

      {/* Node details table */}
      {allNodes.length > 0 && (
        <EnterpriseDataPanel
          title="Lineage nodes"
          columns={[
            { key: "label", label: "Name" },
            { key: "type", label: "Type", render: (v) => <StatusBadge status={v || "—"} /> },
            { key: "domain", label: "Domain" },
            { key: "key", label: "Key" },
          ]}
          pageSize={15}
          fetchPage={async ({ page, pageSize, query }) => {
            let items = allNodes;
            if (query) {
              const q = query.toLowerCase();
              items = items.filter(
                (n) =>
                  (n.label || "").toLowerCase().includes(q) ||
                  (n.key || "").toLowerCase().includes(q) ||
                  (n.domain || "").toLowerCase().includes(q)
              );
            }
            const start = (page - 1) * pageSize;
            const slice = items.slice(start, start + pageSize);
            return { data: { items: slice, total: items.length, page, page_size: pageSize } };
          }}
        />
      )}
    </div>
  );
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
      return <OwnerLineageSection />;
    default:
      return null;
  }
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EnterpriseDataPanel, { StatusBadge } from "../../../components/enterprise/EnterpriseDataPanel";
import { getAllJobs } from "../../../api";
import {
  enterpriseQuarantineRecords,
  enterpriseRefreshQuarantine,
  enterpriseStewardshipIssues,
  enterpriseValidationResults,
  enterpriseValidationRun,
  STEWARDSHIP_REFRESH_EVENT,
} from "../enterpriseApi";
import StewardshipTasksTable from "@/components/stewardship/StewardshipTasksTable";
import { useAuth } from "@/auth/AuthContext";
import { ROLES } from "@/auth/rolePermissions";

const btnOutline =
  "inline-flex items-center rounded border border-border bg-card px-3 py-2 text-xs font-medium uppercase tracking-wider text-foreground hover:bg-muted";

const btnLink =
  "inline-flex items-center rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium uppercase tracking-wider text-primary hover:bg-primary/15";

const fieldSelect =
  "min-w-[200px] rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-2 text-sm text-foreground";

const qCols = [
  { key: "table_name", label: "Table" },
  { key: "job_id", label: "Job" },
  { key: "open_issues", label: "Issues", render: (v) => <StatusBadge status={`${v} open`} /> },
  { key: "last_error_type", label: "Last error" },
  { key: "updated_at", label: "Updated" },
];

const issueCols = [
  { key: "dataset_name", label: "Dataset" },
  { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
  { key: "severity", label: "Severity", render: (v) => <StatusBadge status={v} /> },
  { key: "created_at", label: "Created" },
];

const valCols = [
  { key: "id", label: "ID" },
  { key: "job_id", label: "Job" },
  { key: "passed", label: "OK", render: (v) => <StatusBadge status={v ? "pass" : "fail"} /> },
  { key: "summary", label: "Summary" },
  { key: "created_at", label: "When" },
];

function ValidationRunPanel() {
  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    getAllJobs()
      .then((r) => setJobs(Array.isArray(r.data) ? r.data : []))
      .catch(() => setJobs([]));
  }, []);

  const run = async () => {
    setErr("");
    setMsg("");
    const jid = parseInt(jobId, 10);
    if (!jid) {
      setErr("Select a job.");
      return;
    }
    setBusy(true);
    try {
      const res = await enterpriseValidationRun({ job_id: jid });
      const d = res.data;
      setMsg(`Run finished: ${d.passed ? "passed" : "failed"} — ${d.summary || ""} (result #${d.result_id})`);
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Run failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="enterprise-card p-4 space-y-3 text-sm text-foreground mb-4">
      <h3 className="enterprise-title">Run validation engine</h3>
      <p className="text-xs text-muted-foreground">
        Executes the same pipeline as <code className="text-primary">/jobs/&#123;id&#125;/run</code> and persists a row in{" "}
        <code className="text-primary">enterprise.validation_results</code> plus run history.
      </p>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Job</span>
          <select className={fieldSelect} value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">Select…</option>
            {jobs.map((j) => (
              <option key={j.job_id} value={j.job_id}>
                {j.job_id} — {j.job_name || "job"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={run}
          className="rounded bg-primary px-4 py-2 text-xs font-medium uppercase tracking-wide text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Running…" : "Run now"}
        </button>
      </div>
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
      {msg ? <p className="text-xs text-emerald-700 dark:text-emerald-300">{msg}</p> : null}
    </div>
  );
}

function StewardTasksTab() {
  const { role, isAdmin } = useAuth();
  const canManage = isAdmin || role === ROLES.DATA_STEWARD;
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const onRefresh = () => setRefreshKey((k) => k + 1);
    window.addEventListener(STEWARDSHIP_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(STEWARDSHIP_REFRESH_EVENT, onRefresh);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Full task board with filters, create, and assign actions.
        </p>
        <Link to="/stewardship" className={btnLink}>
          Open Stewardship →
        </Link>
      </div>
      <StewardshipTasksTable
        refreshKey={refreshKey}
        canManage={canManage}
        pageSize={8}
        title="Recent stewardship tasks"
        emptyMessage="No tasks yet. Open Stewardship to create one."
      />
    </div>
  );
}

export function renderStewardTab(tabId) {
  switch (tabId) {
    case "rules":
      return (
        <div className="enterprise-card p-5 text-sm text-muted-foreground">
          <h3 className="enterprise-title mb-2">Rules</h3>
          <p className="mb-3">Manage column rules per table from the Rules workspace.</p>
          <Link to="/rules" className="text-primary font-medium hover:underline">
            Open Rules →
          </Link>
        </div>
      );
    case "validation":
      return (
        <div className="space-y-4">
          <ValidationRunPanel />
          <EnterpriseDataPanel
            title="Validation run results (recorded)"
            columns={valCols}
            searchPlaceholder="Search summary…"
            fetchPage={({ page, pageSize, query }) =>
              enterpriseValidationResults({
                page,
                page_size: pageSize,
                ...(query ? { q: query } : {}),
              })
            }
          />
        </div>
      );
    case "quarantine":
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnOutline}
              onClick={async () => {
                try {
                  const r = await enterpriseRefreshQuarantine();
                  const n = r.data?.updated_rows ?? 0;
                  window.alert(`Refreshed ${n} quarantine summary row(s).`);
                  window.location.reload();
                } catch (e) {
                  window.alert(e?.response?.data?.detail || e?.message || "Refresh failed");
                }
              }}
            >
              Refresh summaries
            </button>
            <Link to="/quarantine" className={btnLink}>
              Open Quarantine
            </Link>
          </div>
          <EnterpriseDataPanel
            title="Quarantine summaries"
            columns={qCols}
            searchPlaceholder="Table name…"
            fetchPage={({ page, pageSize, query }) =>
              enterpriseQuarantineRecords({
                page,
                page_size: pageSize,
                ...(query ? { table: query } : {}),
              })
            }
          />
        </div>
      );
    case "issues":
      return (
        <EnterpriseDataPanel
          title="Stewardship issues"
          columns={issueCols}
          searchPlaceholder="Dataset name…"
          fetchPage={({ page, pageSize, query }) =>
            enterpriseStewardshipIssues({
              page,
              page_size: pageSize,
              ...(query ? { q: query } : {}),
            })
          }
        />
      );
    case "matching":
      return (
        <div className="enterprise-card p-5 text-sm text-muted-foreground">
          <h3 className="enterprise-title mb-2">Fuzzy matching</h3>
          <p>Review fuzzy match candidates from the Quarantine workspace.</p>
          <Link to="/quarantine" className="text-primary font-medium hover:underline mt-2 inline-block">
            Go to Quarantine →
          </Link>
        </div>
      );
    case "tasks":
      return <StewardTasksTab />;
    case "reports":
      return (
        <div className="enterprise-card p-5 text-sm text-muted-foreground">
          <h3 className="enterprise-title mb-2">Reports</h3>
          <Link to="/reports" className="text-primary font-medium hover:underline">
            Open Reports →
          </Link>
        </div>
      );
    default:
      return null;
  }
}

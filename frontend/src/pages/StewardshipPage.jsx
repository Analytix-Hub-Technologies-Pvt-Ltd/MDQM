import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DatabaseZap, Plus, RefreshCw, ShieldCheck, UserCheck, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import StewardshipTaskFormModal from "@/components/stewardship/StewardshipTaskFormModal";
import StewardshipTasksTable from "@/components/stewardship/StewardshipTasksTable";
import { FILTER_SEVERITY_OPTIONS, FILTER_STATUS_OPTIONS } from "@/components/stewardship/stewardshipConstants";
import { useAuth } from "@/auth/AuthContext";
import { ROLES } from "@/auth/rolePermissions";
import { enterpriseStewardshipSummary } from "./dashboards/enterpriseApi";

const inputClass =
  "w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const linkBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted";

function StatCard({ label, value, tone = "default", loading }) {
  const valueClass =
    tone === "teal"
      ? "text-teal-600 dark:text-teal-300"
      : tone === "danger"
        ? "text-red-600 dark:text-red-300"
        : tone === "success"
          ? "text-emerald-600 dark:text-emerald-300"
          : "text-foreground";
  return (
    <div className="enterprise-card p-4">
      <div className="enterprise-title">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${valueClass}`}>
        {loading ? "…" : value}
      </div>
    </div>
  );
}

export default function StewardshipPage() {
  const { role, isAdmin } = useAuth();
  const canManage = isAdmin || role === ROLES.DATA_STEWARD;

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const res = await enterpriseStewardshipSummary();
      setSummary(res.data ?? null);
    } catch (e) {
      setSummary(null);
      setSummaryError(e?.response?.data?.detail || e?.message || "Could not load summary");
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary, refreshKey]);

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  const handleSaved = () => {
    handleRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-primary/10 via-card to-secondary/10 p-6 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <UserCheck className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Stewardship</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Remediation queue for data quality issues — track open tasks, severity, and assignments.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            {canManage ? (
              <Button type="button" size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                New task
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {summaryError ? <p className="text-sm text-destructive">{summaryError}</p> : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Open tasks" value={summary?.open_tasks ?? 0} tone="teal" loading={summaryLoading} />
        <StatCard
          label="High severity (open)"
          value={summary?.high_severity_open ?? 0}
          tone="danger"
          loading={summaryLoading}
        />
        <StatCard
          label="Resolved (30d)"
          value={summary?.resolved_last_30_days ?? 0}
          tone="success"
          loading={summaryLoading}
        />
      </div>

      <div className="enterprise-card p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 max-w-xl">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Status</span>
              <select
                className={inputClass}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {FILTER_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Severity</span>
              <select
                className={inputClass}
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
              >
                {FILTER_SEVERITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/quarantine" className={linkBtnClass}>
              <DatabaseZap className="h-3.5 w-3.5" />
              Quarantine
            </Link>
            <Link to="/jobs" className={linkBtnClass}>
              <Workflow className="h-3.5 w-3.5" />
              Jobs
            </Link>
            <Link to="/rules" className={linkBtnClass}>
              <ShieldCheck className="h-3.5 w-3.5" />
              Rules
            </Link>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {summary?.total_tasks != null
            ? `${summary.total_tasks} task${summary.total_tasks === 1 ? "" : "s"} in the queue.`
            : "Search by dataset name in the table below."}
          {canManage ? " Use Edit on a row to update status or assign a steward." : null}
        </p>
      </div>

      <StewardshipTasksTable
        statusFilter={statusFilter}
        severityFilter={severityFilter}
        refreshKey={refreshKey}
        canManage={canManage}
        emptyMessage={
          canManage
            ? "No stewardship tasks yet. Click New task to log remediation work."
            : "No stewardship tasks in the queue."
        }
      />

      {canManage ? (
        <StewardshipTaskFormModal
          open={createOpen}
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}

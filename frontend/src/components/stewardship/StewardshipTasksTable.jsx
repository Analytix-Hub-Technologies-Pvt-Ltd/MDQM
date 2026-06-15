import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/enterprise/EnterpriseDataPanel";
import {
  enterpriseStewardshipIssues,
  STEWARDSHIP_REFRESH_EVENT,
} from "@/pages/dashboards/enterpriseApi";
import StewardshipTaskFormModal from "./StewardshipTaskFormModal";

function SeverityBadge({ severity }) {
  const s = String(severity || "").toLowerCase();
  const tone =
    s === "high"
      ? "border-red-300 bg-red-50 text-red-800 dark:border-red-600/50 dark:bg-red-950/60 dark:text-red-200"
      : s === "medium"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-600/50 dark:bg-amber-950/60 dark:text-amber-200"
        : "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {severity || "—"}
    </span>
  );
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(value);
  }
}

export default function StewardshipTasksTable({
  statusFilter = "all",
  severityFilter = "all",
  refreshKey = 0,
  canManage = false,
  pageSize = 15,
  title = "Stewardship tasks",
  emptyMessage = "No stewardship tasks yet.",
}) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editTask, setEditTask] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, severityFilter, debouncedQuery, refreshKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await enterpriseStewardshipIssues({
        page,
        page_size: pageSize,
        ...(debouncedQuery ? { q: debouncedQuery } : {}),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(severityFilter !== "all" ? { severity: severityFilter } : {}),
      });
      const body = res?.data ?? res;
      setItems(Array.isArray(body.items) ? body.items : []);
      setTotal(Number(body.total) || 0);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e?.response?.data?.detail || e?.message || "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedQuery, statusFilter, severityFilter, refreshKey]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener(STEWARDSHIP_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(STEWARDSHIP_REFRESH_EVENT, onRefresh);
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className="enterprise-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 className="enterprise-title">{title}</h3>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dataset name…"
            className="max-w-xs w-full h-9"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : !items.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">{emptyMessage}</p>
        ) : (
          <div className="mdqm-scroll-x overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left border-b border-[var(--table-header-border)] bg-[var(--table-header-bg)]">
                  <th className="p-3 text-xs font-bold uppercase tracking-wide text-[var(--table-header-fg)]">
                    Dataset
                  </th>
                  <th className="p-3 text-xs font-bold uppercase tracking-wide text-[var(--table-header-fg)]">
                    Status
                  </th>
                  <th className="p-3 text-xs font-bold uppercase tracking-wide text-[var(--table-header-fg)]">
                    Severity
                  </th>
                  <th className="p-3 text-xs font-bold uppercase tracking-wide text-[var(--table-header-fg)]">
                    Assigned to
                  </th>
                  <th className="p-3 text-xs font-bold uppercase tracking-wide text-[var(--table-header-fg)]">
                    Created
                  </th>
                  {canManage ? (
                    <th className="p-3 text-xs font-bold uppercase tracking-wide text-[var(--table-header-fg)] w-24">
                      Actions
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-border">
                    <td className="p-3 font-medium text-foreground">{row.dataset_name}</td>
                    <td className="p-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="p-3">
                      <SeverityBadge severity={row.severity} />
                    </td>
                    <td className="p-3 text-foreground">{row.assigned_to_name || "Unassigned"}</td>
                    <td className="p-3 text-muted-foreground">{formatDate(row.created_at)}</td>
                    {canManage ? (
                      <td className="p-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 px-2"
                          onClick={() => setEditTask(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > pageSize ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {page} of {pageCount} · {total} total
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                className="rounded-lg border border-border px-2 py-1 hover:bg-muted disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page >= pageCount}
                className="rounded-lg border border-border px-2 py-1 hover:bg-muted disabled:opacity-40"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {canManage ? (
        <StewardshipTaskFormModal
          open={Boolean(editTask)}
          mode="edit"
          task={editTask}
          onClose={() => setEditTask(null)}
          onSaved={load}
        />
      ) : null}
    </>
  );
}

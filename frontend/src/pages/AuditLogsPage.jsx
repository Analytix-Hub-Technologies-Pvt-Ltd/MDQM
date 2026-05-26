import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuditLogs } from "../api";

function parseJson(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function pretty(value) {
  if (!value) return "—";
  const parsed = parseJson(value);
  if (parsed != null) return JSON.stringify(parsed, null, 2);
  return String(value);
}

/** Flat one-level diff for admin payloads (role, is_active, etc.) */
function summarizeChanges(oldVal, newVal) {
  const oldObj = parseJson(oldVal) || {};
  const newObj = parseJson(newVal) || {};
  if (typeof oldObj !== "object" || typeof newObj !== "object") return [];
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const rows = [];
  for (const k of keys) {
    const before = oldObj[k];
    const after = newObj[k];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      rows.push({ key: k, before, after });
    }
  }
  return rows;
}

function getActionTone(action = "") {
  const a = String(action).toLowerCase();
  if (a.includes("delete")) {
    return "text-red-800 border-red-200 bg-red-50 dark:text-red-300 dark:border-red-500/30 dark:bg-red-950/30";
  }
  if (a.includes("disable")) {
    return "text-amber-900 border-amber-200 bg-amber-50 dark:text-amber-300 dark:border-amber-500/30 dark:bg-amber-950/30";
  }
  if (a.includes("update")) {
    return "text-blue-800 border-blue-200 bg-blue-50 dark:text-blue-300 dark:border-blue-500/30 dark:bg-blue-950/30";
  }
  if (a.includes("create") || a.includes("approve")) {
    return "text-green-800 border-green-200 bg-green-50 dark:text-green-300 dark:border-green-500/30 dark:bg-green-950/30";
  }
  return "text-slate-700 border-slate-200 bg-slate-100 dark:text-[#9ab0d1] dark:border-[#2a3f63] dark:bg-[#0f1b31]";
}

const inputClass =
  "w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground placeholder:text-[var(--placeholder)] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const btnOutlineClass =
  "rounded border border-border bg-card px-4 py-2 text-xs font-medium uppercase tracking-wider text-foreground hover:bg-muted disabled:opacity-40";

function exportCsv(rows) {
  const headers = ["id", "created_at", "actor_name", "actor_email", "user_id", "action", "entity_type", "entity_id", "ip_address", "old_values", "new_values"];
  const esc = (v) => {
    const s = v == null ? "" : String(v).replace(/"/g, '""');
    return `"${s}"`;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.created_at,
        r.actor_name,
        r.actor_email,
        r.user_id,
        r.action,
        r.entity_type,
        r.entity_id,
        r.ip_address,
        r.old_values,
        r.new_values,
      ]
        .map(esc)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mdqm-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 20;

export default function AuditLogsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actorQuery, setActorQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await getAuditLogs({ limit: 500, offset: 0 });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to load audit logs");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [query, actionFilter, entityFilter, dateFrom, dateTo, actorQuery]);

  const actionOptions = useMemo(() => {
    const unique = Array.from(new Set(rows.map((r) => r.action).filter(Boolean)));
    return ["ALL", ...unique.sort()];
  }, [rows]);

  const entityOptions = useMemo(() => {
    const unique = Array.from(new Set(rows.map((r) => r.entity_type || "unknown")));
    return ["ALL", ...unique.sort()];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    const actorQ = actorQuery.trim().toLowerCase();

    return rows.filter((log) => {
      if (actionFilter !== "ALL" && log.action !== actionFilter) return false;
      if (entityFilter !== "ALL" && (log.entity_type || "unknown") !== entityFilter) return false;

      if (fromMs != null || toMs != null) {
        const t = log.created_at ? new Date(log.created_at).getTime() : 0;
        if (fromMs != null && t < fromMs) return false;
        if (toMs != null && t > toMs) return false;
      }

      if (actorQ) {
        const blob = `${log.actor_name || ""} ${log.actor_email || ""} ${log.user_id ?? ""}`.toLowerCase();
        if (!blob.includes(actorQ)) return false;
      }

      if (!query.trim()) return true;
      const hay = `${log.action || ""} ${log.entity_type || ""} ${log.entity_id || ""} ${log.old_values || ""} ${log.new_values || ""} ${log.actor_email || ""} ${log.actor_name || ""}`.toLowerCase();
      return hay.includes(query.trim().toLowerCase());
    });
  }, [rows, actionFilter, entityFilter, query, dateFrom, dateTo, actorQuery]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE)), [filteredRows.length]);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const summary = useMemo(() => {
    const total = rows.length;
    const changes = rows.filter((r) => String(r.action || "").includes("update")).length;
    const creations = rows.filter((r) => String(r.action || "").includes("create") || String(r.action || "").includes("approve")).length;
    const destructive = rows.filter((r) => String(r.action || "").includes("delete") || String(r.action || "").includes("disable")).length;
    return { total, changes, creations, destructive };
  }, [rows]);

  const safePage = Math.min(page, pageCount);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safePage]);

  const changeSummary = selected ? summarizeChanges(selected.old_values, selected.new_values) : [];

  return (
    <div className="min-h-full bg-background p-6 text-foreground">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-1">View Logs</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Immutable trail of admin actions: who changed what, when, and from which IP. Use filters and export for reviews.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button type="button" onClick={() => load()} className={btnOutlineClass}>
            Refresh
          </button>
          <button
            type="button"
            disabled={!filteredRows.length}
            onClick={() => exportCsv(filteredRows)}
            className="rounded border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-medium uppercase tracking-wider text-primary hover:bg-primary/15 disabled:opacity-40 dark:border-[#4f8cff]/50 dark:bg-[#4f8cff]/15 dark:text-[#9ec5ff]"
          >
            Export CSV
          </button>
        </div>
      </div>

      {error ? <div className="text-sm text-destructive mb-4">{error}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="enterprise-card p-3">
          <div className="enterprise-title">Total loaded</div>
          <div className="text-2xl font-semibold text-foreground mt-1">{summary.total}</div>
        </div>
        <div className="enterprise-card p-3">
          <div className="enterprise-title">Updates</div>
          <div className="text-2xl font-semibold text-blue-600 dark:text-blue-300 mt-1">{summary.changes}</div>
        </div>
        <div className="enterprise-card p-3">
          <div className="enterprise-title">Create / Approve</div>
          <div className="text-2xl font-semibold text-emerald-600 dark:text-green-300 mt-1">{summary.creations}</div>
        </div>
        <div className="enterprise-card p-3">
          <div className="enterprise-title">Delete / Disable</div>
          <div className="text-2xl font-semibold text-amber-600 dark:text-amber-300 mt-1">{summary.destructive}</div>
        </div>
      </div>

      <div className="enterprise-card p-3 mb-4 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={inputClass}
            placeholder="Search action, entity, payload, actor…"
          />
          <input
            value={actorQuery}
            onChange={(e) => setActorQuery(e.target.value)}
            className={inputClass}
            placeholder="Filter by actor (name, email, or user id)"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className={inputClass}>
            {actionOptions.map((item) => (
              <option key={item} value={item}>
                {item === "ALL" ? "All actions" : item}
              </option>
            ))}
          </select>
          <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className={inputClass}>
            {entityOptions.map((item) => (
              <option key={item} value={item}>
                {item === "ALL" ? "All entities" : item}
              </option>
            ))}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
        </div>
        <p className="text-xs text-muted-foreground">
          Showing {filteredRows.length} match{filteredRows.length === 1 ? "" : "es"} · up to 500 newest events loaded (use Refresh after new admin activity)
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading logs…</div>
      ) : (
        <>
          <div className="enterprise-card overflow-hidden">
            <p className="md:hidden px-3 pt-3 text-[11px] text-muted-foreground">
              Logs are shown as cards—tap one for the full audit payload (IP, diffs, raw JSON).
            </p>
            <div className="md:hidden p-3 space-y-3">
              {!pagedRows.length ? (
                <div className="text-center text-muted-foreground text-sm py-10">No logs match current filters.</div>
              ) : (
                pagedRows.map((log) => {
                  const diffs = summarizeChanges(log.old_values, log.new_values);
                  const preview = diffs
                    .slice(0, 3)
                    .map((d) => `${d.key}: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`)
                    .join(" · ");
                  return (
                    <button
                      key={log.id}
                      type="button"
                      className="w-full text-left rounded-lg border border-border bg-muted/30 p-3 hover:bg-muted transition-colors"
                      onClick={() => setSelected(log)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded border shrink-0 max-w-[55%] truncate ${getActionTone(log.action)}`}>
                          {log.action}
                        </span>
                      </div>
                      <div className="text-sm text-foreground font-medium">{log.actor_name || "—"}</div>
                      <div className="text-xs text-muted-foreground break-all">
                        {log.actor_email || (log.user_id != null ? `User #${log.user_id}` : "—")}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        <span className="text-primary font-medium">{log.entity_type || "—"}</span>
                        {log.entity_id != null && log.entity_id !== "" ? (
                          <span className="font-mono"> · {log.entity_id}</span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-muted-foreground">{log.ip_address || "—"}</div>
                      {preview ? <div className="mt-2 text-[11px] text-muted-foreground line-clamp-3">{preview}</div> : null}
                      <div className="mt-2 text-[10px] uppercase tracking-wider text-primary">Tap for full payload</div>
                    </button>
                  );
                })
              )}
            </div>

            <p className="hidden md:block px-3 pt-2 text-[11px] text-muted-foreground border-b border-border">
              Scroll horizontally to see all columns · click a row for full details
            </p>
            <div className="hidden md:block mdqm-scroll-x mdqm-audit-scroll overflow-x-auto overscroll-x-contain">
              <table className="w-full text-sm min-w-[72rem] table-fixed">
                <colgroup>
                  <col className="w-[11rem]" />
                  <col className="w-[12rem]" />
                  <col className="w-[14rem]" />
                  <col className="w-[10rem]" />
                  <col className="w-[4.5rem]" />
                  <col className="w-[6.5rem]" />
                  <col className="w-[18rem]" />
                </colgroup>
                <thead>
                  <tr className="text-left border-b border-border bg-muted text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 whitespace-nowrap">Time</th>
                    <th className="px-4 py-3 whitespace-nowrap">Actor</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3 whitespace-nowrap">Entity</th>
                    <th className="px-4 py-3 whitespace-nowrap">ID</th>
                    <th className="px-4 py-3 whitespace-nowrap">IP</th>
                    <th className="px-4 py-3">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((log) => {
                    const diffs = summarizeChanges(log.old_values, log.new_values);
                    const preview = diffs.slice(0, 2).map((d) => `${d.key}: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`).join(" · ");
                    return (
                      <tr
                        key={log.id}
                        className="group border-b border-border align-top hover:bg-muted/60 cursor-pointer"
                        onClick={() => setSelected(log)}
                      >
                        <td className="px-4 py-3 text-foreground whitespace-nowrap text-xs">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="text-foreground font-medium break-words">{log.actor_name || "—"}</div>
                          <div className="text-muted-foreground break-all text-[11px] mt-0.5">
                            {log.actor_email || (log.user_id != null ? `User #${log.user_id}` : "—")}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-[11px] leading-snug px-2 py-1 rounded border inline-block max-w-full break-words ${getActionTone(log.action)}`}
                            title={log.action}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs break-words" title={log.entity_type || ""}>
                          {log.entity_type || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{log.entity_id || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs whitespace-nowrap">{log.ip_address || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs break-words" title={preview || ""}>
                          {preview || "Open row"}
                        </td>
                      </tr>
                    );
                  })}
                  {!pagedRows.length ? (
                    <tr>
                      <td className="p-8 text-muted-foreground text-center" colSpan={7}>
                        No logs match current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {filteredRows.length > PAGE_SIZE ? (
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>
                Page {safePage} of {pageCount} ({filteredRows.length} events)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={`${btnOutlineClass} px-3 py-1 normal-case tracking-normal`}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  className={`${btnOutlineClass} px-3 py-1 normal-case tracking-normal`}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {selected ? (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center overflow-y-auto" onClick={() => setSelected(null)}>
          <div className="enterprise-card w-full max-w-4xl p-5 my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Audit event</h2>
              <button type="button" className={btnOutlineClass} onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm mb-4">
              <div className="enterprise-card p-3">
                <span className="enterprise-title">Action</span>
                <div className="text-foreground mt-1 break-all">{selected.action}</div>
              </div>
              <div className="enterprise-card p-3">
                <span className="enterprise-title">Time</span>
                <div className="text-foreground mt-1">{selected.created_at ? new Date(selected.created_at).toLocaleString() : "—"}</div>
              </div>
              <div className="enterprise-card p-3">
                <span className="enterprise-title">Actor</span>
                <div className="text-foreground mt-1">{selected.actor_name || "—"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {selected.actor_email || (selected.user_id != null ? `User id: ${selected.user_id}` : "—")}
                </div>
              </div>
              <div className="enterprise-card p-3">
                <span className="enterprise-title">Entity</span>
                <div className="text-foreground mt-1">
                  {selected.entity_type || "—"} <span className="text-muted-foreground">#{selected.entity_id || "—"}</span>
                </div>
              </div>
              <div className="enterprise-card p-3 sm:col-span-2 lg:col-span-1">
                <span className="enterprise-title">IP address</span>
                <div className="text-foreground mt-1 font-mono">{selected.ip_address || "—"}</div>
              </div>
            </div>

            {changeSummary.length ? (
              <div className="enterprise-card p-4 mb-4">
                <div className="enterprise-title mb-3">Field changes</div>
                <div className="overflow-x-auto mdqm-scroll-x">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border">
                        <th className="py-2 pr-3">Field</th>
                        <th className="py-2 pr-3">Before</th>
                        <th className="py-2">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changeSummary.map((row) => (
                        <tr key={row.key} className="border-b border-border">
                          <td className="py-2 pr-3 text-primary font-medium">{row.key}</td>
                          <td className="py-2 pr-3 text-red-700 dark:text-red-300/90 font-mono break-all">{JSON.stringify(row.before)}</td>
                          <td className="py-2 text-emerald-700 dark:text-green-300/90 font-mono break-all">{JSON.stringify(row.after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="enterprise-card p-3">
                <div className="enterprise-title mb-2">Old values (raw)</div>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-64 overflow-y-auto">{pretty(selected.old_values)}</pre>
              </div>
              <div className="enterprise-card p-3">
                <div className="enterprise-title mb-2">New values (raw)</div>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-64 overflow-y-auto">{pretty(selected.new_values)}</pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

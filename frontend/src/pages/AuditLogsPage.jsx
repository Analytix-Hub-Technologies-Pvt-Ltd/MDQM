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
  if (a.includes("delete")) return "text-red-300 border-red-500/30 bg-red-950/30";
  if (a.includes("disable")) return "text-amber-300 border-amber-500/30 bg-amber-950/30";
  if (a.includes("update")) return "text-blue-300 border-blue-500/30 bg-blue-950/30";
  if (a.includes("create") || a.includes("approve")) return "text-green-300 border-green-500/30 bg-green-950/30";
  return "text-[#9ab0d1] border-[#2a3f63] bg-[#0f1b31]";
}

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
    <div className="p-6 min-h-full bg-[#0b1424]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h1 className="text-2xl text-[#d7e3f7] mb-1">View Logs</h1>
          <p className="text-sm text-[#7f95b6] max-w-2xl">
            Immutable trail of admin actions: who changed what, when, and from which IP. Use filters and export for reviews.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={() => load()}
            className="border border-[#2a3f63] text-[#d7e3f7] px-4 py-2 text-xs uppercase tracking-wider rounded hover:bg-[#0f1b31]"
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={!filteredRows.length}
            onClick={() => exportCsv(filteredRows)}
            className="border border-[#4f8cff]/50 bg-[#4f8cff]/15 text-[#9ec5ff] px-4 py-2 text-xs uppercase tracking-wider rounded disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>
      </div>

      {error ? <div className="text-sm text-red-400 mb-4">{error}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="enterprise-card p-3">
          <div className="enterprise-title">Total loaded</div>
          <div className="text-2xl text-[#d7e3f7] mt-1">{summary.total}</div>
        </div>
        <div className="enterprise-card p-3">
          <div className="enterprise-title">Updates</div>
          <div className="text-2xl text-blue-300 mt-1">{summary.changes}</div>
        </div>
        <div className="enterprise-card p-3">
          <div className="enterprise-title">Create / Approve</div>
          <div className="text-2xl text-green-300 mt-1">{summary.creations}</div>
        </div>
        <div className="enterprise-card p-3">
          <div className="enterprise-title">Delete / Disable</div>
          <div className="text-2xl text-amber-300 mt-1">{summary.destructive}</div>
        </div>
      </div>

      <div className="enterprise-card p-3 mb-4 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border border-[#2a3f63] bg-[#0f1b31] text-[#d7e3f7] placeholder:text-[#7f95b6] rounded px-3 py-2 text-sm"
            placeholder="Search action, entity, payload, actor…"
          />
          <input
            value={actorQuery}
            onChange={(e) => setActorQuery(e.target.value)}
            className="border border-[#2a3f63] bg-[#0f1b31] text-[#d7e3f7] placeholder:text-[#7f95b6] rounded px-3 py-2 text-sm"
            placeholder="Filter by actor (name, email, or user id)"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="border border-[#2a3f63] bg-[#0f1b31] text-[#d7e3f7] rounded px-3 py-2 text-sm"
          >
            {actionOptions.map((item) => (
              <option key={item} value={item}>
                {item === "ALL" ? "All actions" : item}
              </option>
            ))}
          </select>
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="border border-[#2a3f63] bg-[#0f1b31] text-[#d7e3f7] rounded px-3 py-2 text-sm"
          >
            {entityOptions.map((item) => (
              <option key={item} value={item}>
                {item === "ALL" ? "All entities" : item}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-[#2a3f63] bg-[#0f1b31] text-[#d7e3f7] rounded px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-[#2a3f63] bg-[#0f1b31] text-[#d7e3f7] rounded px-3 py-2 text-sm"
          />
        </div>
        <p className="text-xs text-[#5c6d8a]">
          Showing {filteredRows.length} match{filteredRows.length === 1 ? "" : "es"} · up to 500 newest events loaded (use Refresh after new admin activity)
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-[#9ab0d1]">Loading logs…</div>
      ) : (
        <>
          <div className="enterprise-card overflow-hidden">
            <p className="md:hidden px-3 pt-3 text-[11px] text-[#5c6d8a]">
              Logs are shown as cards—tap one for the full audit payload (IP, diffs, raw JSON).
            </p>
            <div className="md:hidden p-3 space-y-3">
              {!pagedRows.length ? (
                <div className="text-center text-[#9ab0d1] text-sm py-10">No logs match current filters.</div>
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
                      className="w-full text-left rounded-lg border border-[#22324f] bg-[#0c1524] p-3 hover:border-[#2a4a7a] hover:bg-[#0f1b31]/90 transition-colors"
                      onClick={() => setSelected(log)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-[11px] text-[#7f95b6] shrink-0">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded border shrink-0 max-w-[55%] truncate ${getActionTone(log.action)}`}>
                          {log.action}
                        </span>
                      </div>
                      <div className="text-sm text-[#d7e3f7] font-medium">{log.actor_name || "—"}</div>
                      <div className="text-xs text-[#7f95b6] break-all">{log.actor_email || (log.user_id != null ? `User #${log.user_id}` : "—")}</div>
                      <div className="mt-2 text-xs text-[#9ab0d1]">
                        <span className="text-[#9ec5ff]">{log.entity_type || "—"}</span>
                        {log.entity_id != null && log.entity_id !== "" ? (
                          <span className="font-mono text-[#7f95b6]"> · {log.entity_id}</span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-[#6a7d9a]">{log.ip_address || "—"}</div>
                      {preview ? <div className="mt-2 text-[11px] text-[#5c6d8a] line-clamp-3">{preview}</div> : null}
                      <div className="mt-2 text-[10px] uppercase tracking-wider text-[#4f8cff]/80">Tap for full payload</div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="hidden md:block mdqm-scroll-x overflow-x-auto overscroll-x-contain scroll-smooth">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="text-left text-[#9ab0d1] border-b border-[#22324f] bg-[#0a1220]">
                    <th className="p-3 whitespace-nowrap sticky left-0 z-[2] bg-[#0a1220] shadow-[6px_0_12px_-6px_rgba(0,0,0,0.75)] w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem]">
                      Time
                    </th>
                    <th className="p-3 whitespace-nowrap">Actor</th>
                    <th className="p-3">Action</th>
                    <th className="p-3 whitespace-nowrap">Entity</th>
                    <th className="p-3 whitespace-nowrap">ID</th>
                    <th className="p-3 whitespace-nowrap hidden lg:table-cell">IP</th>
                    <th className="p-3 min-w-[120px] hidden xl:table-cell">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((log) => {
                    const diffs = summarizeChanges(log.old_values, log.new_values);
                    const preview = diffs.slice(0, 2).map((d) => `${d.key}: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)}`).join(" · ");
                    return (
                      <tr
                        key={log.id}
                        className="group border-b border-[#22324f] align-top hover:bg-[#0f1b31]/80 cursor-pointer"
                        onClick={() => setSelected(log)}
                      >
                        <td className="p-3 text-[#d7e3f7] whitespace-nowrap text-xs sticky left-0 z-[1] bg-[#0c1524] shadow-[6px_0_12px_-6px_rgba(0,0,0,0.65)] w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] group-hover:bg-[#0f1b31]/95">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                        </td>
                        <td className="p-3 text-[#9ab0d1] text-xs max-w-[180px]">
                          <div className="text-[#d7e3f7] font-medium truncate">{log.actor_name || "—"}</div>
                          <div className="truncate text-[#7f95b6]">{log.actor_email || (log.user_id != null ? `User #${log.user_id}` : "—")}</div>
                        </td>
                        <td className="p-3">
                          <span className={`text-[11px] px-2 py-1 rounded border inline-block max-w-[200px] truncate ${getActionTone(log.action)}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="p-3 text-[#9ab0d1] max-w-[140px] truncate">{log.entity_type || "—"}</td>
                        <td className="p-3 text-[#9ab0d1] font-mono text-xs max-w-[120px] truncate">{log.entity_id || "—"}</td>
                        <td className="p-3 text-[#9ab0d1] font-mono text-xs whitespace-nowrap hidden lg:table-cell">{log.ip_address || "—"}</td>
                        <td className="p-3 text-[#7f95b6] text-xs line-clamp-2 max-w-[200px] hidden xl:table-cell">{preview || "Open row"}</td>
                      </tr>
                    );
                  })}
                  {!pagedRows.length ? (
                    <tr>
                      <td className="p-8 text-[#9ab0d1] text-center" colSpan={7}>
                        No logs match current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {filteredRows.length > PAGE_SIZE ? (
            <div className="flex items-center justify-between mt-4 text-sm text-[#9ab0d1]">
              <span>
                Page {safePage} of {pageCount} ({filteredRows.length} events)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="border border-[#2a3f63] px-3 py-1 rounded disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  className="border border-[#2a3f63] px-3 py-1 rounded disabled:opacity-40"
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
              <h2 className="text-lg text-[#d7e3f7]">Audit event</h2>
              <button type="button" className="border border-[#2a3f63] text-[#9ab0d1] px-3 py-1 text-xs uppercase rounded" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm mb-4">
              <div className="enterprise-card p-3">
                <span className="enterprise-title">Action</span>
                <div className="text-[#d7e3f7] mt-1 break-all">{selected.action}</div>
              </div>
              <div className="enterprise-card p-3">
                <span className="enterprise-title">Time</span>
                <div className="text-[#d7e3f7] mt-1">{selected.created_at ? new Date(selected.created_at).toLocaleString() : "—"}</div>
              </div>
              <div className="enterprise-card p-3">
                <span className="enterprise-title">Actor</span>
                <div className="text-[#d7e3f7] mt-1">{selected.actor_name || "—"}</div>
                <div className="text-xs text-[#7f95b6] mt-0.5">{selected.actor_email || (selected.user_id != null ? `User id: ${selected.user_id}` : "—")}</div>
              </div>
              <div className="enterprise-card p-3">
                <span className="enterprise-title">Entity</span>
                <div className="text-[#d7e3f7] mt-1">
                  {selected.entity_type || "—"} <span className="text-[#7f95b6]">#{selected.entity_id || "—"}</span>
                </div>
              </div>
              <div className="enterprise-card p-3 sm:col-span-2 lg:col-span-1">
                <span className="enterprise-title">IP address</span>
                <div className="text-[#d7e3f7] mt-1 font-mono">{selected.ip_address || "—"}</div>
              </div>
            </div>

            {changeSummary.length ? (
              <div className="enterprise-card p-4 mb-4">
                <div className="enterprise-title mb-3">Field changes</div>
                <div className="overflow-x-auto mdqm-scroll-x">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[#9ab0d1] border-b border-[#22324f]">
                        <th className="py-2 pr-3">Field</th>
                        <th className="py-2 pr-3">Before</th>
                        <th className="py-2">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changeSummary.map((row) => (
                        <tr key={row.key} className="border-b border-[#22324f]/60">
                          <td className="py-2 pr-3 text-[#9ec5ff] font-medium">{row.key}</td>
                          <td className="py-2 pr-3 text-red-300/90 font-mono break-all">{JSON.stringify(row.before)}</td>
                          <td className="py-2 text-green-300/90 font-mono break-all">{JSON.stringify(row.after)}</td>
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
                <pre className="text-xs text-[#9ab0d1] whitespace-pre-wrap max-h-64 overflow-y-auto">{pretty(selected.old_values)}</pre>
              </div>
              <div className="enterprise-card p-3">
                <div className="enterprise-title mb-2">New values (raw)</div>
                <pre className="text-xs text-[#9ab0d1] whitespace-pre-wrap max-h-64 overflow-y-auto">{pretty(selected.new_values)}</pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

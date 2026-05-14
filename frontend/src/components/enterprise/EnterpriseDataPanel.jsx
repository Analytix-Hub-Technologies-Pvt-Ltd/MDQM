import { useCallback, useEffect, useState } from "react";

function StatusBadge({ status }) {
  const s = String(status || "").toLowerCase();
  let cls = "bg-[#1d2b46] text-[#9ab0d1] border-[#2a3f63]";
  if (s.includes("success") || s === "healthy" || s === "running" || s === "open" || s === "approved" || s === "read")
    cls = "bg-emerald-950/40 text-emerald-300 border-emerald-600/30";
  else if (s.includes("fail") || s.includes("error") || s === "attention" || s === "denied" || s === "rejected")
    cls = "bg-red-950/40 text-red-300 border-red-600/30";
  else if (s.includes("queue") || s.includes("pending") || s === "draft") cls = "bg-amber-950/40 text-amber-200 border-amber-600/30";
  else if (s === "write") cls = "bg-sky-950/40 text-sky-200 border-sky-600/30";
  return <span className={`text-[10px] px-2 py-0.5 rounded border uppercase tracking-wide ${cls}`}>{status || "—"}</span>;
}

/**
 * Paginated data panel with search, loading / empty / error states.
 * fetchPage: async ({ page, pageSize, query }) => { items, total, page, page_size }
 */
export default function EnterpriseDataPanel({ title, columns, fetchPage, pageSize = 10, searchPlaceholder = "Search…" }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchPage({ page, pageSize, query: debouncedQuery });
      const body = res?.data ?? res;
      setItems(Array.isArray(body.items) ? body.items : []);
      setTotal(Number(body.total) || 0);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e?.response?.data?.detail || e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [fetchPage, page, pageSize, debouncedQuery]);

  useEffect(() => {
    load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="enterprise-card p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h3 className="enterprise-title">{title}</h3>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder={searchPlaceholder}
          className="border border-[#2a3f63] bg-[#0f1b31] text-[#d7e3f7] placeholder:text-[#5c6d8a] rounded px-3 py-2 text-sm max-w-xs w-full"
        />
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-[#9ab0d1] py-8 text-center">Loading…</p>
      ) : !items.length ? (
        <p className="text-sm text-[#7f95b6] py-8 text-center">No records match your filters.</p>
      ) : (
        <div className="mdqm-scroll-x overflow-x-auto rounded-md border border-[#22324f]">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-[#9ab0d1] border-b border-[#22324f] bg-[#0a1220]">
                {columns.map((c) => (
                  <th key={c.key} className="p-2 whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((row, idx) => (
                <tr key={row.id ?? idx} className="border-b border-[#22324f]/60 hover:bg-[#0f1b31]/60">
                  {columns.map((c) => (
                    <td key={c.key} className="p-2 text-[#d7e3f7] align-top">
                      {c.render ? c.render(row[c.key], row) : String(row[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > pageSize ? (
        <div className="flex items-center justify-between text-xs text-[#9ab0d1]">
          <span>
            Page {page} of {pageCount} · {total} total
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              className="border border-[#2a3f63] px-2 py-1 rounded disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= pageCount}
              className="border border-[#2a3f63] px-2 py-1 rounded disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { StatusBadge };

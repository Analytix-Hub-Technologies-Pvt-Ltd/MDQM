import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const badgeBase =
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap";

function resolveBadgeVariant(status) {
  const s = String(status || "").toLowerCase();
  if (
    s.includes("success") ||
    s.includes("pass") ||
    s === "healthy" ||
    s === "running" ||
    s === "open" ||
    s === "approved" ||
    s === "read" ||
    s === "active" ||
    s === "certified" ||
    s.includes("granted")
  ) {
    return "success";
  }
  if (s === "write") return "info";
  if (s.includes("read/export") || s.includes("export")) return "info";
  if (
    s.includes("fail") ||
    s.includes("error") ||
    s === "attention" ||
    s === "denied" ||
    s === "rejected" ||
    s === "failed"
  ) {
    return "danger";
  }
  if (s.includes("queue") || s.includes("pending") || s === "draft" || s.includes("warn") || s === "stale") {
    return "warning";
  }
  if (s.includes("low") || s.includes("restricted")) {
    return "danger";
  }
  return "neutral";
}

const badgeVariantClasses = {
  success:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-600/50 dark:bg-emerald-950/60 dark:text-emerald-200",
  info: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-600/50 dark:bg-sky-950/60 dark:text-sky-200",
  warning:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-600/50 dark:bg-amber-950/60 dark:text-amber-200",
  danger: "border-red-300 bg-red-50 text-red-800 dark:border-red-600/50 dark:bg-red-950/60 dark:text-red-200",
  neutral:
    "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200",
};

function StatusBadge({ status }) {
  const variant = resolveBadgeVariant(status);
  return (
    <span className={cn(badgeBase, badgeVariantClasses[variant])}>{status || "—"}</span>
  );
}

/** Readable body text for table cells (purpose, reviewer, notes). */
function TableCellText({ children, className }) {
  return (
    <span className={cn("text-sm font-medium text-foreground leading-snug", className)}>{children}</span>
  );
}

/**
 * Paginated data panel with search, loading / empty / error states.
 * fetchPage: async ({ page, pageSize, query }) => { items, total, page, page_size }
 */
export default function EnterpriseDataPanel({
  title,
  description,
  columns,
  fetchPage,
  pageSize = 10,
  searchPlaceholder = "Search…",
  emptyMessage = "No records match your filters.",
  refreshEventName,
  scrollable = true,
  dense = false,
  minTableWidth = 520,
}) {
  const pageStorageKey = title ? `mdqm-enterprise-panel-page:${title}` : null;
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(() => {
    if (!pageStorageKey) return 1;
    try {
      const n = parseInt(sessionStorage.getItem(pageStorageKey) || "1", 10);
      return Number.isFinite(n) && n > 0 ? n : 1;
    } catch {
      return 1;
    }
  });
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  const setPage = useCallback(
    (updater) => {
      setPageState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (pageStorageKey) {
          try {
            sessionStorage.setItem(pageStorageKey, String(next));
          } catch {
            /* ignore quota */
          }
        }
        return next;
      });
    },
    [pageStorageKey],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await fetchPageRef.current({ page, pageSize, query: debouncedQuery });
      const body = res?.data ?? res;
      setItems(Array.isArray(body.items) ? body.items : []);
      setTotal(Number(body.total) || 0);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e?.response?.data?.detail || e?.message || "Failed to load");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, pageSize, debouncedQuery]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!refreshEventName) return;
    const onRefresh = (e) => loadRef.current({ silent: Boolean(e?.detail?.silent) });
    window.addEventListener(refreshEventName, onRefresh);
    return () => window.removeEventListener(refreshEventName, onRefresh);
  }, [refreshEventName]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const cellPad = dense ? "!px-2 !py-2" : "!p-3";

  return (
    <div className="enterprise-card p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0">
          <h3 className="enterprise-title">{title}</h3>
          {description ? (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground max-w-3xl">{description}</p>
          ) : null}
        </div>
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder={searchPlaceholder}
          className="max-w-xs w-full h-9"
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : !items.length ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{emptyMessage}</p>
      ) : (
        <div
          className={cn(
            "rounded-xl border border-border",
            scrollable ? "mdqm-scroll-x overflow-x-auto" : "overflow-hidden",
          )}
        >
          <table
            className={cn(
              "mdqm-enterprise-table w-full border-collapse text-sm",
              dense && "mdqm-enterprise-table--dense",
              !scrollable && "table-fixed",
            )}
            style={scrollable && minTableWidth ? { minWidth: minTableWidth } : undefined}
          >
            {!scrollable ? (
              <colgroup>
                {columns.map((c) => (
                  <col key={c.key} style={c.width ? { width: c.width } : undefined} />
                ))}
              </colgroup>
            ) : null}
            <thead>
              <tr className="text-left border-b border-[var(--table-header-border)] bg-[var(--table-header-bg)]">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    title={c.headerTitle || undefined}
                    className={cn(
                      cellPad,
                      "whitespace-nowrap text-xs font-bold uppercase tracking-wide text-[var(--table-header-fg)]",
                      !scrollable && "overflow-hidden",
                      c.headerClassName,
                      c.className,
                    )}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((row, idx) => (
                <tr
                  key={row.id != null && row.id !== "" ? `row-${row.id}-${idx}` : `row-${idx}`}
                  className="border-b border-border"
                >
                  {columns.map((c, ci) => (
                    <td
                      key={`${c.key}-${ci}`}
                      className={cn(
                        cellPad,
                        dense ? "align-top" : "align-middle",
                        "text-foreground",
                        !scrollable && "overflow-hidden",
                        c.cellClassName,
                        c.className,
                      )}
                    >
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
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {page} of {pageCount} · {total} total
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              className="rounded-lg border border-border px-2 py-1 text-foreground hover:bg-[var(--table-row-hover)] disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= pageCount}
              className="rounded-lg border border-border px-2 py-1 text-foreground hover:bg-[var(--table-row-hover)] disabled:opacity-40"
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

export { StatusBadge, TableCellText };

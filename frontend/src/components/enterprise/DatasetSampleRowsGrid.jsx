import { useCallback, useEffect, useMemo, useState } from "react";
import { DataGrid } from "react-data-grid";
import "react-data-grid/lib/styles.css";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, Sparkles, X } from "lucide-react";
import { enterpriseGovernanceDatasetTableRows } from "@/pages/dashboards/enterpriseApi";
import { modalLabelClass } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DqFailedRemarksCell } from "@/components/enterprise/DqFailedRemarksCell";

const PAGE_SIZES = [10, 25, 50];

function resolveRowDqPassed(row, columnNames = []) {
  const explicit = row?.dq_passed;
  if (explicit === "true" || explicit === true) return true;
  if (explicit === "false" || explicit === false) return false;

  const remarks = row?.dq_failed_remarks;
  if (Array.isArray(remarks) && remarks.length) return false;
  if (row?.dq_remarks?.trim()) return false;

  let hasRuleFlag = false;
  for (const name of columnNames) {
    const flag = row?.[`${name}__dq_pass`];
    if (flag === "false") return false;
    if (flag === "true") hasRuleFlag = true;
  }
  if (hasRuleFlag) return true;
  return null;
}

function DqStatusBadge({ row, columnNames }) {
  const passed = resolveRowDqPassed(row, columnNames);
  if (passed === null) {
    return <span className="block px-1.5 text-center text-[11px] text-muted-foreground/40">—</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex min-w-[3.5rem] justify-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        passed
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
          : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
      )}
    >
      {passed ? "Pass" : "Failed"}
    </span>
  );
}

function formatDetail(d) {
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join("; ") || "Request failed.";
  if (d && typeof d === "object") {
    const det = d.detail;
    if (typeof det === "string") return det;
    if (Array.isArray(det)) return det.map((x) => x?.msg || JSON.stringify(x)).join("; ");
    return d.msg || JSON.stringify(d);
  }
  return "";
}

function pageWindow(current, total, max = 5) {
  if (total <= max) return Array.from({ length: total }, (_, i) => i);
  const half = Math.floor(max / 2);
  let start = Math.max(0, current - half);
  let end = Math.min(total - 1, start + max - 1);
  start = Math.max(0, end - max + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function PaginationBar({ pageIndex, totalPages, loading, onGo }) {
  if (totalPages <= 1) return null;
  const pages = pageWindow(pageIndex, totalPages);
  const navBtn =
    "h-7 w-7 p-0 text-muted-foreground hover:text-foreground disabled:opacity-40";
  const pageBtn = (active) =>
    cn(
      "h-7 min-w-8 px-2 text-[11px] font-medium",
      active && "pointer-events-none",
    );

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[10px] text-muted-foreground sm:inline">
        Page {pageIndex + 1} of {totalPages}
      </span>
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={navBtn}
          disabled={pageIndex <= 0 || loading}
          onClick={() => onGo(0)}
          title="First page"
          aria-label="First page"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={navBtn}
          disabled={pageIndex <= 0 || loading}
          onClick={() => onGo(pageIndex - 1)}
          title="Previous page"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        {pages[0] > 0 ? (
          <span className="px-1 text-[10px] text-muted-foreground">…</span>
        ) : null}

        {pages.map((p) => (
          <Button
            key={p}
            type="button"
            variant={p === pageIndex ? "default" : "outline"}
            size="sm"
            className={pageBtn(p === pageIndex)}
            disabled={loading}
            onClick={() => onGo(p)}
            aria-label={`Page ${p + 1}`}
            aria-current={p === pageIndex ? "page" : undefined}
          >
            {p + 1}
          </Button>
        ))}

        {pages[pages.length - 1] < totalPages - 1 ? (
          <span className="px-1 text-[10px] text-muted-foreground">…</span>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className={navBtn}
          disabled={pageIndex >= totalPages - 1 || loading}
          onClick={() => onGo(pageIndex + 1)}
          title="Next page"
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={navBtn}
          disabled={pageIndex >= totalPages - 1 || loading}
          onClick={() => onGo(totalPages - 1)}
          title="Last page"
          aria-label="Last page"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Server-paginated sample rows grid (Data Owner dataset preview).
 * Uses react-data-grid with page controls — one API page at a time.
 */
export default function DatasetSampleRowsGrid({
  datasetId,
  tableId,
  columns = [],
  enabled = true,
  className,
}) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [message, setMessage] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [sortColumns, setSortColumns] = useState([]);
  const [smartQuery, setSmartQuery] = useState("");
  const [debouncedSmartQuery, setDebouncedSmartQuery] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [aiSource, setAiSource] = useState("");
  const [aiNotice, setAiNotice] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const rangeStart = total === 0 ? 0 : safePageIndex * pageSize + 1;
  const rangeEnd = Math.min((safePageIndex + 1) * pageSize, total);

  const columnNames = useMemo(() => columns.map((c) => c.name), [columns]);

  const gridColumns = useMemo(() => {
    const cols = columns.map((c) => ({
      key: c.name,
      name: c.name.replace(/_/g, " ").toUpperCase(),
      resizable: true,
      sortable: true,
      minWidth: 110,
      renderCell({ row }) {
        const value = row[c.name];
        const text = value != null && value !== "" ? String(value) : "—";
        const passFlag = row[`${c.name}__dq_pass`];
        const remark = row[`${c.name}__dq_remark`];
        const title = remark ? `${text} — ${remark}` : text;
        return (
          <span
            className={cn(
              "block truncate border-l-2 px-1.5 text-[11px] text-foreground",
              passFlag === "false" && "border-l-destructive bg-destructive/5",
              passFlag === "true" && "border-l-success bg-success/5",
              passFlag !== "true" && passFlag !== "false" && "border-l-transparent",
            )}
            title={title}
          >
            {text}
          </span>
        );
      },
    }));

    cols.push({
      key: "dq_status",
      name: "DQ STATUS",
      resizable: true,
      sortable: false,
      minWidth: 96,
      renderCell({ row }) {
        return (
          <div className="flex justify-center px-1.5 py-0.5">
            <DqStatusBadge row={row} columnNames={columnNames} />
          </div>
        );
      },
    });

    cols.push({
      key: "dq_remarks",
      name: "DQ REMARKS",
      resizable: true,
      sortable: false,
      minWidth: 220,
      renderCell({ row }) {
        return <DqFailedRemarksCell row={row} />;
      },
    });

    cols.push({
      key: "golden_remarks",
      name: "GOLDEN RECORD",
      resizable: true,
      sortable: false,
      minWidth: 200,
      renderCell({ row }) {
        const text = row.golden_remarks || "";
        const isGolden = row.is_golden_record === "true";
        if (!isGolden && !text) return <span className="block px-1.5 text-[11px] text-muted-foreground/40"> </span>;
        return (
          <div className="flex items-center gap-1.5 px-1.5 py-0.5 text-[11px]" title={text}>
            {isGolden && (
              <span className="inline-block rounded bg-purple-100 px-1.5 py-0.5 font-bold uppercase tracking-wider text-purple-800 dark:bg-purple-950/40 dark:text-purple-400 text-[8px] leading-none">
                Golden
              </span>
            )}
            <span className="text-[10px] text-foreground truncate max-w-[150px]">{text || "Merged record"}</span>
          </div>
        );
      },
    });

    return cols;
  }, [columns, columnNames]);

  const loadPage = useCallback(async () => {
    if (!enabled || datasetId == null || tableId == null) return;
    setLoading(true);
    setErr("");
    try {
      const offset = safePageIndex * pageSize;
      const res = await enterpriseGovernanceDatasetTableRows(datasetId, tableId, {
        offset,
        limit: pageSize,
        aiQuery: debouncedSmartQuery,
      });
      const data = res?.data ?? res;
      const pageRows = data?.rows || [];
      const nextTotal = Number(data?.total ?? 0);
      setRows(
        pageRows.map((row, i) => ({
          ...row,
          _rowId: `${offset + i}`,
        })),
      );
      setTotal(nextTotal);
      setMessage(data?.message || "");
      setAiSummary(data?.ai_summary || "");
      setAiSource(data?.ai_source || "");
      if (data?.ai_llm_unavailable) {
        setAiNotice("AI unavailable — using keyword search.");
      } else if (data?.ai_scan_capped) {
        setAiNotice("Search scanned first 5,000 rows only.");
      } else {
        setAiNotice("");
      }
    } catch (e) {
      setRows([]);
      setErr(formatDetail(e?.response?.data) || e?.message || "Failed to load rows.");
    } finally {
      setLoading(false);
    }
  }, [datasetId, tableId, enabled, safePageIndex, pageSize, debouncedSmartQuery]);

  useEffect(() => {
    if (!enabled || datasetId == null || tableId == null) {
      setRows([]);
      setTotal(0);
      setMessage("");
      setPageIndex(0);
      setSmartQuery("");
      setDebouncedSmartQuery("");
      setAiSummary("");
      return;
    }
    loadPage();
  }, [datasetId, tableId, enabled, safePageIndex, pageSize, loadPage]);

  useEffect(() => {
    setPageIndex(0);
    setSortColumns([]);
  }, [datasetId, tableId, pageSize]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSmartQuery(smartQuery.trim()), 450);
    return () => clearTimeout(t);
  }, [smartQuery]);

  useEffect(() => {
    setPageIndex(0);
  }, [debouncedSmartQuery]);

  const goToPage = (next) => {
    const clamped = Math.max(0, Math.min(next, totalPages - 1));
    setPageIndex(clamped);
  };

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  if (!enabled) {
    return <p className="text-xs text-muted-foreground">Run import to load data from the database.</p>;
  }

  if (!columns.length) {
    return (
      <p className="text-xs text-muted-foreground">
        No columns registered yet — run import or refresh to load schema from the data file.
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
          <p className={modalLabelClass}>
            Data
            {total > 0 ? (
              <span className="ml-1 font-normal normal-case text-muted-foreground">
                ({total.toLocaleString()} total)
              </span>
            ) : null}
          </p>
          {total > 0 ? (
            <p className="text-[10px] text-muted-foreground whitespace-nowrap">
              Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}
            </p>
          ) : null}
        </div>

        <div className="relative ml-auto w-full max-w-[13rem] shrink-0 sm:w-52">
          <Sparkles className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-primary/70" />
          <Input
            value={smartQuery}
            onChange={(e) => setSmartQuery(e.target.value)}
            placeholder="AI search…"
            className="h-8 rounded-full pl-7 pr-7 text-[11px]"
            aria-label="Smart search data"
          />
          {smartQuery ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => setSmartQuery("")}
              aria-label="Clear smart search"
            >
              <X className="h-3 w-3" />
            </button>
          ) : (
            <Search className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/45" />
          )}
        </div>
      </div>

      {debouncedSmartQuery ? (
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          {aiSummary ? <span>{aiSummary}</span> : null}
          <span className="text-muted-foreground/60">
            {aiSource === "llm" ? "· AI" : "· Keyword"}
          </span>
        </div>
      ) : null}
      {aiNotice ? <p className="text-[10px] text-amber-600 text-right">{aiNotice}</p> : null}

      {err ? <p className="text-xs text-destructive">{err}</p> : null}
      {message && !rows.length && !loading ? <p className="text-xs text-muted-foreground">{message}</p> : null}

      <div className="mdqm-data-grid overflow-hidden rounded-lg border border-border bg-card">
        <div className={cn("relative", loading && "opacity-60")}>
          <DataGrid
            className={isDark ? "rdg-dark" : "rdg-light"}
            columns={gridColumns}
            rows={rows}
            rowKeyGetter={(row) => row._rowId}
            sortColumns={sortColumns}
            onSortColumnsChange={setSortColumns}
            style={{ height: 320 }}
            rowHeight={34}
            headerRowHeight={38}
          />
          {loading ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/20">
              <span className="rounded-md bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm border border-border">
                Loading…
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/30 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-muted-foreground">Rows per page</span>
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
              {PAGE_SIZES.map((size) => (
                <Button
                  key={size}
                  type="button"
                  variant={pageSize === size ? "default" : "ghost"}
                  size="sm"
                  className="h-6 min-w-8 px-2 text-[11px] shadow-none"
                  onClick={() => setPageSize(size)}
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>

          <PaginationBar
            pageIndex={safePageIndex}
            totalPages={totalPages}
            loading={loading}
            onGo={goToPage}
          />
        </div>
      </div>

      {!rows.length && !loading && !err && !message ? (
        <p className="text-xs text-muted-foreground">No rows in this table yet.</p>
      ) : null}
    </div>
  );
}

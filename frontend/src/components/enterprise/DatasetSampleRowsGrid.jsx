import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DataGrid } from "react-data-grid";
import "react-data-grid/lib/styles.css";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  enterpriseGovernanceDatasetTableRows,
  enterpriseGovernanceDatasetTableRowUpdate,
  enterpriseValidationRun,
} from "@/pages/dashboards/enterpriseApi";
import { runJobEngine } from "@/api";
import { modalLabelClass, modalInputClass, AppModal } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DqFailedRemarksCell } from "@/components/enterprise/DqFailedRemarksCell";
import DatasetRefreshToastStack from "@/components/business/DatasetRefreshToastStack";

const PAGE_SIZES = [10, 25, 50];
const EMPTY_DISPLAY = "—";

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

function cellDisplayValue(row, columnKey, columnNames) {
  if (columnKey === "dq_status") {
    const passed = resolveRowDqPassed(row, columnNames);
    if (passed === true) return "Pass";
    if (passed === false) return "Failed";
    return EMPTY_DISPLAY;
  }
  const value = row?.[columnKey];
  if (value == null || value === "") return EMPTY_DISPLAY;
  return String(value);
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

function ColumnMultiFilter({
  columnKey,
  label,
  options,
  selected,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const active = Array.isArray(selected) && selected.length > 0;

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 220;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      setPos({ top: rect.bottom + 4, left });
    };
    update();
    const onDoc = (e) => {
      if (
        panelRef.current?.contains(e.target) ||
        btnRef.current?.contains(e.target)
      ) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  const toggleValue = (value) => {
    const set = new Set(selected || []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onChange([...set]);
  };

  const selectAllVisible = () => {
    const set = new Set(selected || []);
    filteredOptions.forEach((o) => set.add(o));
    onChange([...set]);
  };

  const clear = () => onChange([]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={cn(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors",
          active
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
        )}
        title={`Filter ${label}`}
        aria-label={`Filter ${label}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Filter className="h-3 w-3" strokeWidth={active ? 2.5 : 2} />
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[120] w-[220px] overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl"
              style={{ top: pos.top, left: pos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-border px-2.5 py-2">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Filter · {label}
                </p>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search values…"
                  className="h-7 text-[11px]"
                />
              </div>
              <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
                <button
                  type="button"
                  className="text-[10px] font-semibold uppercase tracking-wider text-primary hover:underline"
                  onClick={selectAllVisible}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:underline"
                  onClick={clear}
                >
                  Clear
                </button>
              </div>
              <div className="max-h-52 overflow-y-auto py-1">
                {filteredOptions.length ? (
                  filteredOptions.map((opt) => {
                    const checked = (selected || []).includes(opt);
                    return (
                      <label
                        key={opt}
                        className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[11px] hover:bg-muted/60"
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-primary"
                          checked={checked}
                          onChange={() => toggleValue(opt)}
                        />
                        <span className="truncate" title={opt}>
                          {opt}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <p className="px-2.5 py-3 text-[11px] text-muted-foreground">No values</p>
                )}
              </div>
              {active ? (
                <div className="border-t border-border px-2.5 py-1.5 text-[10px] text-muted-foreground">
                  {selected.length} selected
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * Server-paginated sample rows grid (Data Owner dataset preview).
 * Uses react-data-grid with page controls — one API page at a time.
 * Column headers support multi-select value filters.
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
  /** @type {Record<string, string[]>} columnKey -> selected values */
  const [columnFilters, setColumnFilters] = useState({});
  const [detailRow, setDetailRow] = useState(null);
  const [focusColumn, setFocusColumn] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [savingRow, setSavingRow] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [actionToasts, setActionToasts] = useState([]);

  const READONLY_DETAIL_KEYS = useMemo(
    () => new Set(["dq_status", "dq_remarks", "golden_remarks"]),
    [],
  );

  const pushToast = useCallback((toast, autoDismissMs = 5000) => {
    const id = toast.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next = { ...toast, id };
    setActionToasts((prev) => [...prev.filter((t) => t.id !== id), next].slice(-4));
    if (autoDismissMs > 0 && next.status !== "running") {
      window.setTimeout(() => {
        setActionToasts((prev) => prev.filter((t) => t.id !== id));
      }, autoDismissMs);
    }
    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setActionToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const rangeStart = total === 0 ? 0 : safePageIndex * pageSize + 1;
  const rangeEnd = Math.min((safePageIndex + 1) * pageSize, total);

  const columnNames = useMemo(() => columns.map((c) => c.name), [columns]);

  const filterOptionMap = useMemo(() => {
    const map = {};
    const keys = [...columnNames, "dq_status"];
    for (const key of keys) {
      const set = new Set();
      for (const row of rows) {
        set.add(cellDisplayValue(row, key, columnNames));
      }
      map[key] = [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    }
    return map;
  }, [rows, columnNames]);

  const activeFilterCount = useMemo(
    () => Object.values(columnFilters).filter((v) => Array.isArray(v) && v.length > 0).length,
    [columnFilters],
  );

  const filteredRows = useMemo(() => {
    const entries = Object.entries(columnFilters).filter(([, vals]) => vals?.length);
    if (!entries.length) return rows;
    return rows.filter((row) =>
      entries.every(([key, vals]) => vals.includes(cellDisplayValue(row, key, columnNames))),
    );
  }, [rows, columnFilters, columnNames]);

  const setFilterForColumn = useCallback((columnKey, values) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (!values?.length) delete next[columnKey];
      else next[columnKey] = values;
      return next;
    });
  }, []);

  const clearAllFilters = () => setColumnFilters({});

  const openRowDetail = useCallback(
    (row, columnKey = null) => {
      if (!row) return;
      setDetailRow(row);
      setFocusColumn(columnKey);
      setSaveErr("");
      setSaveMsg("");
      const draft = {};
      for (const name of columnNames) {
        const raw = row[name];
        draft[name] = raw != null && raw !== "" ? String(raw) : "";
      }
      setEditValues(draft);
    },
    [columnNames],
  );

  const closeRowDetail = useCallback(() => {
    setDetailRow(null);
    setFocusColumn(null);
    setEditValues({});
    setSaveErr("");
    setSaveMsg("");
    setSavingRow(false);
  }, []);

  const detailFields = useMemo(() => {
    if (!detailRow) return [];
    const fields = columnNames.map((name) => ({
      key: name,
      label: name.replace(/_/g, " ").toUpperCase(),
      value: cellDisplayValue(detailRow, name, columnNames),
      remark: detailRow[`${name}__dq_remark`] || "",
      passFlag: detailRow[`${name}__dq_pass`],
      readOnly: false,
    }));
    fields.push({
      key: "dq_status",
      label: "DQ STATUS",
      value: cellDisplayValue(detailRow, "dq_status", columnNames),
      remark: "",
      passFlag: null,
      readOnly: true,
    });
    // Always show DQ remarks field (read-only), even if empty
    fields.push({
      key: "dq_remarks",
      label: "DQ REMARKS",
      value: detailRow.dq_remarks ? String(detailRow.dq_remarks) : "—",
      remark: "",
      passFlag: null,
      readOnly: true,
    });
    if (detailRow.golden_remarks || detailRow.is_golden_record === "true") {
      fields.push({
        key: "golden_remarks",
        label: "GOLDEN RECORD",
        value: detailRow.golden_remarks || "Golden",
        remark: "",
        passFlag: null,
        readOnly: true,
      });
    }
    return fields;
  }, [detailRow, columnNames]);

  const gridColumns = useMemo(() => {
    const cols = columns.map((c) => ({
      key: c.name,
      name: c.name.replace(/_/g, " ").toUpperCase(),
      resizable: true,
      sortable: true,
      minWidth: 130,
      renderHeaderCell() {
        const label = c.name.replace(/_/g, " ").toUpperCase();
        return (
          <div className="flex h-full w-full items-center justify-between gap-1 px-1">
            <span className="truncate text-[10px] font-bold tracking-wider">{label}</span>
            <ColumnMultiFilter
              columnKey={c.name}
              label={label}
              options={filterOptionMap[c.name] || []}
              selected={columnFilters[c.name] || []}
              onChange={(vals) => setFilterForColumn(c.name, vals)}
            />
          </div>
        );
      },
      renderCell({ row }) {
        const value = row[c.name];
        const text = value != null && value !== "" ? String(value) : "—";
        const passFlag = row[`${c.name}__dq_pass`];
        const remark = row[`${c.name}__dq_remark`];
        const title = remark
          ? `${text} — ${remark}`
          : `${text} (click to open row details)`;
        return (
          <span
            className={cn(
              "block cursor-pointer truncate border-l-2 px-1.5 text-[11px] text-foreground hover:underline",
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
      minWidth: 110,
      renderHeaderCell() {
        return (
          <div className="flex h-full w-full items-center justify-between gap-1 px-1">
            <span className="truncate text-[10px] font-bold tracking-wider">DQ STATUS</span>
            <ColumnMultiFilter
              columnKey="dq_status"
              label="DQ STATUS"
              options={filterOptionMap.dq_status || ["Pass", "Failed", EMPTY_DISPLAY]}
              selected={columnFilters.dq_status || []}
              onChange={(vals) => setFilterForColumn("dq_status", vals)}
            />
          </div>
        );
      },
      renderCell({ row }) {
        return (
          <div
            className="flex cursor-pointer justify-center px-1.5 py-0.5"
            title="Click to open row details"
          >
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
  }, [columns, columnNames, columnFilters, filterOptionMap, setFilterForColumn]);

  const loadPage = useCallback(async () => {
    if (!enabled || datasetId == null || tableId == null) return [];
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
      const pageRows = (data?.rows || []).map((row, i) => ({
        ...row,
        _rowId: `${offset + i}`,
      }));
      const nextTotal = Number(data?.total ?? 0);
      setRows(pageRows);
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
      return pageRows;
    } catch (e) {
      setRows([]);
      setErr(formatDetail(e?.response?.data) || e?.message || "Failed to load rows.");
      return [];
    } finally {
      setLoading(false);
    }
  }, [datasetId, tableId, enabled, safePageIndex, pageSize, debouncedSmartQuery]);

  const handleSaveRow = useCallback(async () => {
    if (!detailRow || datasetId == null || tableId == null) return;
    const rowIndex = detailRow.row_index;
    if (rowIndex == null || rowIndex === "") {
      setSaveErr("Cannot save: row index is missing. Reload the grid and try again.");
      return;
    }
    setSavingRow(true);
    setSaveErr("");
    setSaveMsg("");

    const runningToastId = `dq-run-${datasetId}-${tableId}`;

    try {
      const values = {};
      for (const name of columnNames) {
        values[name] = editValues[name] ?? "";
      }

      // 1) Save edited values into backend DB
      setSaveMsg("Saving row to database…");
      const saveRes = await enterpriseGovernanceDatasetTableRowUpdate(datasetId, tableId, {
        rowIndex: Number(rowIndex),
        values,
      });
      const saveData = saveRes?.data ?? saveRes;
      const jobId = saveData?.job_id;

      pushToast({
        id: `row-saved-${Date.now()}`,
        status: "completed",
        title: "Saved",
        subtitle: "Record updated",
        message: "Your changes were saved to the backend database.",
      });
      setSaveMsg("Saved to database.");

      // 2) Auto-run DQ (Stewardship validation + Jobs Run DQ fallback for Owner roles)
      if (jobId != null) {
        pushToast({
          id: runningToastId,
          status: "running",
          title: "DQ running",
          subtitle: `Job #${jobId}`,
          message: "DQ validation is running…",
          startTime: new Date().toISOString(),
        });
        setSaveMsg("Saved. Running DQ…");

        let dqPassed = true;
        let dqSummary = "Validation engine completed";
        try {
          const dqRes = await enterpriseValidationRun({ job_id: Number(jobId) });
          const dqData = dqRes?.data ?? dqRes;
          dqPassed = dqData?.passed !== false;
          dqSummary = dqData?.summary || dqSummary;
        } catch (dqErr) {
          // Owner desk may hit 403 on enterprise validation — use /jobs/{id}/run
          const status = dqErr?.response?.status;
          if (status === 403) {
            const jobRes = await runJobEngine(Number(jobId));
            const jobData = jobRes?.data ?? jobRes;
            dqPassed = true;
            dqSummary = jobData?.message || "DQ job executed successfully";
          } else {
            throw dqErr;
          }
        }

        dismissToast(runningToastId);

        if (!dqPassed) {
          pushToast({
            id: `dq-done-${Date.now()}`,
            status: "failed",
            title: "DQ finished",
            subtitle: `Job #${jobId}`,
            message: dqSummary || "DQ completed with issues. Check status and remarks.",
          }, 8000);
          setSaveMsg(`Saved. DQ finished with issues: ${dqSummary || "see remarks"}.`);
        } else {
          pushToast({
            id: `dq-done-${Date.now()}`,
            status: "completed",
            title: "DQ completed",
            subtitle: `Job #${jobId}`,
            message: "DQ re-run finished. Status and remarks are updated.",
          }, 7000);
          setSaveMsg("Saved and DQ re-run completed. Status/remarks refreshed.");
        }
      } else {
        setSaveMsg("Saved. (No linked job — DQ was not run.)");
      }

      // 3) Reload grid + refresh modal DQ STATUS / DQ REMARKS from DB
      const pageRows = await loadPage();
      const refreshed = (pageRows || []).find(
        (r) => Number(r.row_index) === Number(rowIndex),
      );
      if (refreshed) {
        setDetailRow(refreshed);
        const draft = {};
        for (const name of columnNames) {
          const raw = refreshed[name];
          draft[name] = raw != null && raw !== "" ? String(raw) : "";
        }
        setEditValues(draft);
      } else {
        setDetailRow((prev) => {
          if (!prev) return prev;
          const next = { ...prev };
          for (const name of columnNames) {
            next[name] = values[name] ?? "";
          }
          return next;
        });
      }
    } catch (e) {
      dismissToast(runningToastId);
      const msg = formatDetail(e?.response?.data) || e?.message || "Failed to save / run DQ.";
      setSaveErr(msg);
      pushToast({
        id: `row-err-${Date.now()}`,
        status: "failed",
        title: "Save failed",
        subtitle: "Could not complete",
        message: msg,
      }, 8000);
    } finally {
      setSavingRow(false);
    }
  }, [
    detailRow,
    datasetId,
    tableId,
    columnNames,
    editValues,
    loadPage,
    pushToast,
    dismissToast,
  ]);

  useEffect(() => {
    if (!enabled || datasetId == null || tableId == null) {
      setRows([]);
      setTotal(0);
      setMessage("");
      setPageIndex(0);
      setSmartQuery("");
      setDebouncedSmartQuery("");
      setAiSummary("");
      setColumnFilters({});
      return;
    }
    loadPage();
  }, [datasetId, tableId, enabled, safePageIndex, pageSize, loadPage]);

  useEffect(() => {
    setPageIndex(0);
    setSortColumns([]);
    setColumnFilters({});
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
              {activeFilterCount > 0 ? (
                <span className="ml-1">
                  · filtered {filteredRows.length}/{rows.length} on this page
                </span>
              ) : null}
            </p>
          ) : null}
          {activeFilterCount > 0 ? (
            <button
              type="button"
              className="text-[10px] font-semibold uppercase tracking-wider text-primary hover:underline"
              onClick={clearAllFilters}
            >
              Clear filters ({activeFilterCount})
            </button>
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
            rows={filteredRows}
            rowKeyGetter={(row) => row._rowId}
            sortColumns={sortColumns}
            onSortColumnsChange={setSortColumns}
            onCellClick={({ row, column }) => {
              if (!row) return;
              const key = column?.key;
              if (key === "dq_remarks" || key === "golden_remarks") {
                openRowDetail(row, key);
                return;
              }
              openRowDetail(row, key || null);
            }}
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

      {!filteredRows.length && rows.length && !loading ? (
        <p className="text-xs text-muted-foreground">No rows match the selected filters on this page.</p>
      ) : null}
      {!rows.length && !loading && !err && !message ? (
        <p className="text-xs text-muted-foreground">No rows in this table yet.</p>
      ) : null}

      <DatasetRefreshToastStack toasts={actionToasts} onDismiss={dismissToast} />

      <AppModal
        open={!!detailRow}
        onClose={closeRowDetail}
        title="Row details"
        description="Edit values, then Save: stores in DB, shows a toast, then auto-runs Stewardship DQ and refreshes status/remarks."
        maxWidth="max-w-2xl"
        showDefaultFooter={false}
        footer={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={closeRowDetail}
              disabled={savingRow}
            >
              Close
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={handleSaveRow}
              disabled={savingRow || detailRow?.row_index == null}
            >
              {savingRow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {savingRow ? "Saving & running DQ…" : "Save"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Click any cell in the grid to open this form. Editable fields can be changed and saved.
          </p>
          {saveErr ? <p className="text-xs text-destructive">{saveErr}</p> : null}
          {saveMsg ? <p className="text-xs text-emerald-700">{saveMsg}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {detailFields.map((field) => {
              const focused = focusColumn === field.key;
              const readOnly = field.readOnly || READONLY_DETAIL_KEYS.has(field.key);
              return (
                <label
                  key={field.key}
                  className={cn(
                    "block rounded-lg border p-3",
                    focused
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border bg-muted/20",
                    field.key === "dq_remarks" || field.key === "golden_remarks"
                      ? "sm:col-span-2"
                      : null,
                  )}
                >
                  <span className={modalLabelClass}>
                    {field.label}
                    {readOnly ? (
                      <span className="ml-1 font-normal normal-case text-muted-foreground">(read-only)</span>
                    ) : null}
                  </span>
                  {readOnly ? (
                    <div
                      className={cn(
                        "mt-1 min-h-9 rounded-md border border-[var(--input-border)] bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground break-words",
                      )}
                    >
                      {field.value || "—"}
                    </div>
                  ) : (
                    <input
                      className={cn(
                        modalInputClass,
                        field.passFlag === "false" && "border-destructive/40 bg-destructive/5",
                        field.passFlag === "true" && "border-success/40 bg-success/5",
                      )}
                      value={editValues[field.key] ?? ""}
                      onChange={(e) =>
                        setEditValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      disabled={savingRow}
                    />
                  )}
                  {field.remark ? (
                    <p className="mt-1 text-[10px] text-rose-700">{field.remark}</p>
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>
      </AppModal>
    </div>
  );
}

import { cn } from "@/lib/utils";

export default function ColumnSelector({
  columns = [],
  selected = [],
  onChange,
  loading = false,
  className,
}) {
  const selectedSet = new Set(selected);
  const allSelected = columns.length > 0 && columns.every((c) => selectedSet.has(c));

  const toggle = (name) => {
    const next = new Set(selectedSet);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(columns.filter((c) => next.has(c)));
  };

  const selectAll = () => onChange([...columns]);
  const clearAll = () => onChange([]);

  if (loading) {
    return (
      <div className={cn("rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground", className)}>
        Loading columns…
      </div>
    );
  }

  if (!columns.length) {
    return null;
  }

  return (
    <div className={cn("rounded-xl border border-border bg-muted/30 p-3 space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Select columns ({selected.length} of {columns.length})
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            disabled={allSelected}
            className="text-[10px] font-semibold uppercase tracking-wide text-primary hover:underline disabled:opacity-40"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={selected.length === 0}
            className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:underline disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-card p-2">
        <div className="grid gap-1 sm:grid-cols-2">
          {columns.map((col) => (
            <label
              key={col}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/60"
            >
              <input
                type="checkbox"
                className="rounded border-border"
                checked={selectedSet.has(col)}
                onChange={() => toggle(col)}
              />
              <span className="truncate font-mono text-foreground" title={col}>
                {col}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

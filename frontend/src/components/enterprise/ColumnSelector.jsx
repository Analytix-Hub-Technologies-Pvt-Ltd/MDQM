import { ArrowRight, Check, Columns3 } from "lucide-react";
import { modalInputClass, modalLabelClass } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const compactInputClass =
  "w-full rounded-md border border-[var(--input-border)] bg-background px-2.5 py-1.5 text-sm font-medium text-[var(--input-foreground)] placeholder:font-normal placeholder:text-[var(--placeholder)] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export default function ColumnSelector({
  columns = [],
  selected = [],
  onChange,
  aliases = {},
  onAliasesChange,
  enableAliases = false,
  loading = false,
  className,
}) {
  const selectedSet = new Set(selected);
  const allSelected = columns.length > 0 && columns.every((c) => selectedSet.has(c));
  const aliasCount = Object.keys(aliases).filter((k) => aliases[k]?.trim()).length;

  const toggle = (name) => {
    const next = new Set(selectedSet);
    if (next.has(name)) {
      next.delete(name);
      if (enableAliases && onAliasesChange) {
        const nextAliases = { ...aliases };
        delete nextAliases[name];
        onAliasesChange(nextAliases);
      }
    } else {
      next.add(name);
    }
    onChange(columns.filter((c) => next.has(c)));
  };

  const selectAll = () => onChange([...columns]);

  const clearAll = () => {
    onChange([]);
    if (enableAliases && onAliasesChange) onAliasesChange({});
  };

  const setAlias = (column, value) => {
    if (!onAliasesChange) return;
    const next = { ...aliases };
    const trimmed = value.trim();
    if (!trimmed || trimmed === column) delete next[column];
    else next[column] = trimmed;
    onAliasesChange(next);
  };

  if (loading) {
    return (
      <div className={cn("rounded-xl border border-border bg-muted/30 p-3", className)}>
        <p className={modalLabelClass}>Columns to include</p>
        <div className="mt-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-8 text-center text-sm font-medium text-muted-foreground">
          Loading columns…
        </div>
      </div>
    );
  }

  if (!columns.length) {
    return null;
  }

  return (
    <div className={cn("rounded-xl border border-border bg-muted/30 p-3 space-y-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Columns3 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <p className={modalLabelClass}>Columns to include</p>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
              {selected.length} / {columns.length}
            </span>
            {enableAliases && aliasCount > 0 ? (
              <span className="text-[10px] font-medium text-muted-foreground">
                · {aliasCount} alias{aliasCount === 1 ? "" : "es"}
              </span>
            ) : null}
          </div>
          {enableAliases ? (
            <p className="text-[10px] leading-relaxed text-muted-foreground pl-5">
              Select columns to join. Add an alias to rename a column in the merged dataset.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={selectAll}
            disabled={allSelected}
            className="h-7 px-2.5 text-[10px] font-bold uppercase tracking-wide"
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            disabled={selected.length === 0}
            className="h-7 px-2.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] shadow-sm">
        {enableAliases ? (
          <div
            className="grid border-b border-[var(--input-border)] bg-[var(--table-header-bg)] text-[10px] font-bold uppercase tracking-wider text-[var(--table-header-fg)]"
            style={{ gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)" }}
          >
            <div className="px-3 py-2">Column</div>
            <div className="border-l border-[var(--input-border)] px-3 py-2">Alias</div>
          </div>
        ) : null}

        <div className="max-h-56 overflow-y-auto">
          {columns.map((col, index) => {
            const isSelected = selectedSet.has(col);
            const alias = aliases[col]?.trim() || "";
            const hasAlias = Boolean(alias && alias !== col);

            return (
              <div
                key={col}
                className={cn(
                  "group transition-colors",
                  enableAliases
                    ? "grid border-b border-border/50 last:border-b-0"
                    : "border-b border-border/50 last:border-b-0",
                  isSelected ? "bg-primary/[0.04]" : "bg-card hover:bg-muted/30",
                )}
                style={enableAliases ? { gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)" } : undefined}
              >
                <button
                  type="button"
                  onClick={() => toggle(col)}
                  title={col}
                  className={cn(
                    "flex min-w-0 items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                    !enableAliases && "w-full",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-[var(--input-border)] bg-background group-hover:border-primary/40",
                    )}
                  >
                    {isSelected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 truncate text-sm font-medium",
                      isSelected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    {col}
                  </span>
                  {hasAlias ? (
                    <span className="ml-auto hidden shrink-0 items-center gap-1 text-[10px] text-primary sm:inline-flex">
                      <ArrowRight className="h-3 w-3" aria-hidden />
                      {alias}
                    </span>
                  ) : null}
                </button>

                {enableAliases ? (
                  <div
                    className="flex items-center border-l border-border/50 px-2 py-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isSelected ? (
                      <input
                        id={`alias-${index}-${col}`}
                        className={compactInputClass}
                        placeholder="Keep original name"
                        value={aliases[col] || ""}
                        onChange={(e) => setAlias(col, e.target.value)}
                        aria-label={`Alias for ${col}`}
                      />
                    ) : (
                      <span className="px-2 text-xs text-muted-foreground/40 select-none">—</span>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

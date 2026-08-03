import { Plus, Trash2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalInputClass, modalLabelClass } from "@/components/layout/AppModal";

function normalizeCol(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, "");
}

/** Auto-map base columns to source columns by exact / normalized name match. */
export function suggestColumnMappings(baseColumns = [], sourceColumns = []) {
  const unused = new Set(sourceColumns);
  const pairs = [];
  for (const base of baseColumns) {
    const baseNorm = normalizeCol(base);
    let match = null;
    for (const src of unused) {
      if (String(src).toLowerCase() === String(base).toLowerCase()) {
        match = src;
        break;
      }
    }
    if (!match) {
      for (const src of unused) {
        if (normalizeCol(src) === baseNorm) {
          match = src;
          break;
        }
      }
    }
    if (match) {
      unused.delete(match);
      pairs.push({ base_column: base, source_column: match });
    }
  }
  return pairs.length ? pairs : [{ base_column: "", source_column: "" }];
}

export function emptyMappingPair() {
  return { base_column: "", source_column: "" };
}

export default function ColumnMappingEditor({
  pairs,
  onChange,
  baseColumns = [],
  sourceColumns = [],
  onAutoMap,
  className,
}) {
  const rows = pairs?.length ? pairs : [emptyMappingPair()];

  const updatePair = (index, field, value) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const addPair = () => onChange([...rows, emptyMappingPair()]);

  const removePair = (index) => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length ? next : [emptyMappingPair()]);
  };

  const mappedCount = rows.filter((p) => p.base_column && p.source_column).length;

  return (
    <div className={className ? `space-y-3 ${className}` : "space-y-3"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Column mapping
          </p>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
            {mappedCount} mapped
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!baseColumns.length || !sourceColumns.length}
          onClick={onAutoMap}
          className="text-[10px] uppercase tracking-wide"
        >
          Auto-map by name
        </Button>
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Map each base dataset column to the matching column in the new data source. This is saved in{" "}
        <span className="font-semibold text-foreground">mapping_config</span>.
      </p>

      <div className="space-y-2">
        {rows.map((pair, index) => (
          <div key={`map-${index}`} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <div>
              {index === 0 ? <label className={modalLabelClass}>Base dataset column</label> : null}
              <select
                className={modalInputClass}
                value={pair.base_column}
                onChange={(e) => updatePair(index, "base_column", e.target.value)}
              >
                <option value="">Select column…</option>
                {baseColumns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              {index === 0 ? <label className={modalLabelClass}>New source column</label> : null}
              <select
                className={modalInputClass}
                value={pair.source_column}
                onChange={(e) => updatePair(index, "source_column", e.target.value)}
              >
                <option value="">Select column…</option>
                {sourceColumns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={rows.length === 1}
              onClick={() => removePair(index)}
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
              title="Remove mapping"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addPair} className="text-[10px] uppercase tracking-wide">
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add mapping
      </Button>
    </div>
  );
}

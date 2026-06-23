import { Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalInputClass, modalLabelClass } from "@/components/layout/AppModal";

export function formatJoinKeysLabel(pairs) {
  const valid = (pairs || []).filter((p) => p?.left_key && p?.right_key);
  if (!valid.length) return "—";
  return valid.map((p) => `${p.left_key} = ${p.right_key}`).join(" · ");
}

export default function JoinKeyPairsEditor({
  pairs,
  onChange,
  baseColumns = [],
  rightColumns = [],
  onSuggest,
  suggestBusy = false,
  suggestSummary = "",
  suggestSource = "",
  keysEdited = false,
  onKeysEdited,
}) {
  const rows = pairs?.length ? pairs : [{ left_key: "", right_key: "" }];

  const updatePair = (index, field, value) => {
    onKeysEdited?.(true);
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const addPair = () => {
    onKeysEdited?.(true);
    onChange([...rows, { left_key: "", right_key: "" }]);
  };

  const removePair = (index) => {
    onKeysEdited?.(true);
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length ? next : [{ left_key: "", right_key: "" }]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Join keys</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!baseColumns.length || !rightColumns.length || suggestBusy}
          onClick={onSuggest}
          className="text-[10px] uppercase tracking-wide"
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          {suggestBusy ? "Analyzing…" : "Suggest join keys (AI)"}
        </Button>
      </div>

      {suggestSummary ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {suggestSummary}
          {suggestSource ? <span className="ml-1 uppercase text-primary/80">({suggestSource})</span> : null}
          {keysEdited ? <span className="ml-1 text-amber-600">· edited</span> : null}
        </p>
      ) : (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Add one or more key pairs. AI analyzes both datasets and pre-fills suggestions — you can edit any pair.
        </p>
      )}

      <div className="space-y-2">
        {rows.map((pair, index) => (
          <div key={`jk-${index}`} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <div>
              {index === 0 ? <label className={modalLabelClass}>Base dataset key</label> : null}
              <select className={modalInputClass} value={pair.left_key} onChange={(e) => updatePair(index, "left_key", e.target.value)}>
                <option value="">Select column…</option>
                {baseColumns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              {index === 0 ? <label className={modalLabelClass}>New source key</label> : null}
              <select className={modalInputClass} value={pair.right_key} onChange={(e) => updatePair(index, "right_key", e.target.value)}>
                <option value="">Select column…</option>
                {rightColumns.map((c) => (
                  <option key={c} value={c}>{c}</option>
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
              title="Remove key pair"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addPair} className="text-[10px] uppercase tracking-wide">
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add key pair
      </Button>
    </div>
  );
}

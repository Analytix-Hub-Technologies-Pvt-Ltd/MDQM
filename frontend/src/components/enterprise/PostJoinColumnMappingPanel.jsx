import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalSection, ModalAlert } from "@/components/layout/AppModal";
import ColumnMappingEditor, {
  emptyMappingPair,
  suggestColumnMappings,
} from "@/components/enterprise/ColumnMappingEditor";
import {
  enterpriseGovernanceDataSourceMappingUpdate,
  enterpriseGovernanceRecommendColumnMapping,
} from "@/pages/dashboards/enterpriseApi";

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

/**
 * Post-join LLM column mapping panel.
 * Shown after Add & join completes — maps base dataset columns ↔ joined source columns.
 */
export default function PostJoinColumnMappingPanel({
  datasetId,
  dataSources = [],
  baseColumns = [],
  autoOpenForId = null,
  onSaved,
}) {
  const joinSources = useMemo(
    () => (dataSources || []).filter((d) => d && (d.join_configuration?.role === "join" || d.join_configuration?.role !== "primary")),
    [dataSources],
  );

  const sources = joinSources.length ? joinSources : dataSources || [];
  const [selectedId, setSelectedId] = useState(null);
  const [pairs, setPairs] = useState([emptyMappingPair()]);
  const [busy, setBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [summary, setSummary] = useState("");
  const [sourceTag, setSourceTag] = useState("");

  const selected = useMemo(
    () => sources.find((s) => String(s.id) === String(selectedId)) || sources[0] || null,
    [sources, selectedId],
  );

  const sourceColumns = useMemo(() => {
    const cfg = selected?.mapping_config;
    if (cfg && Array.isArray(cfg.selected_columns)) {
      return cfg.selected_columns.map(String).filter(Boolean);
    }
    return [];
  }, [selected]);

  const baseNames = useMemo(
    () => (baseColumns || []).map((c) => (typeof c === "string" ? c : c?.name)).filter(Boolean),
    [baseColumns],
  );

  useEffect(() => {
    if (!sources.length) {
      setSelectedId(null);
      return;
    }
    if (autoOpenForId && sources.some((s) => String(s.id) === String(autoOpenForId))) {
      setSelectedId(autoOpenForId);
      return;
    }
    if (!selectedId || !sources.some((s) => String(s.id) === String(selectedId))) {
      setSelectedId(sources[sources.length - 1]?.id ?? null);
    }
  }, [sources, autoOpenForId, selectedId]);

  useEffect(() => {
    if (!selected) {
      setPairs([emptyMappingPair()]);
      return;
    }
    const cfg = selected.mapping_config;
    const existing = cfg && Array.isArray(cfg.column_mappings) ? cfg.column_mappings : [];
    const cleaned = existing
      .filter((p) => p?.base_column && p?.source_column)
      .map((p) => ({ base_column: p.base_column, source_column: p.source_column }));
    setPairs(cleaned.length ? cleaned : [emptyMappingPair()]);
    setError("");
    setOk("");
    setSummary("");
    setSourceTag("");
  }, [selected?.id]);

  // Auto LLM suggest when opened after a fresh join
  useEffect(() => {
    if (!autoOpenForId || !selected || String(selected.id) !== String(autoOpenForId)) return;
    if (!baseNames.length || !sourceColumns.length) return;
    const cfg = selected.mapping_config;
    const existing = cfg && Array.isArray(cfg.column_mappings) ? cfg.column_mappings : [];
    if (existing.some((p) => p?.base_column && p?.source_column)) return;
    suggestWithLlm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenForId, selected?.id, baseNames.length, sourceColumns.length]);

  if (!sources.length || !datasetId) return null;

  const suggestWithLlm = async () => {
    setBusy(true);
    setError("");
    setOk("");
    try {
      const res = await enterpriseGovernanceRecommendColumnMapping(datasetId, {
        data_source_id: selected?.id,
        base_columns: baseNames,
        source_columns: sourceColumns,
        source_label: selected?.data_source_name,
      });
      const body = res?.data ?? res;
      const mapped = Array.isArray(body?.column_mappings) ? body.column_mappings : [];
      if (mapped.length) {
        setPairs(
          mapped.map((p) => ({
            base_column: p.base_column,
            source_column: p.source_column,
          })),
        );
      } else {
        setPairs(suggestColumnMappings(baseNames, sourceColumns));
      }
      setSummary(body?.summary || "");
      setSourceTag(body?.source || "");
    } catch (e) {
      setError(formatDetail(e?.response?.data) || e?.message || "LLM mapping failed.");
      setPairs(suggestColumnMappings(baseNames, sourceColumns));
      setSourceTag("heuristic");
    } finally {
      setBusy(false);
    }
  };

  const saveMapping = async () => {
    if (!selected?.id) return;
    const cleaned = pairs.filter((p) => p.base_column && p.source_column);
    if (!cleaned.length) {
      setError("Add at least one complete column mapping before saving.");
      return;
    }
    setSaveBusy(true);
    setError("");
    setOk("");
    try {
      await enterpriseGovernanceDataSourceMappingUpdate(datasetId, selected.id, {
        column_mappings: cleaned,
      });
      setOk("Column mapping saved to mapping_config.");
      onSaved?.();
    } catch (e) {
      setError(formatDetail(e?.response?.data) || e?.message || "Failed to save mapping.");
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <ModalSection title="Column mapping (LLM)">
      <p className="mb-3 text-xs text-muted-foreground">
        After joining a data source, map base dataset columns to the joined source columns. AI can suggest matches;
        review and save to <span className="font-semibold text-foreground">mapping_config</span>.
      </p>

      {sources.length > 1 ? (
        <div className="mb-3">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Joined data source
          </label>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={selected?.id ?? ""}
            onChange={(e) => setSelectedId(Number(e.target.value))}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.data_source_name || `Source #${s.id}`}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="mb-3 text-xs font-medium text-foreground">
          Source: {selected?.data_source_name || "—"}
        </p>
      )}

      {!sourceColumns.length ? (
        <ModalAlert variant="warning">
          This data source has no selected_columns in mapping_config yet. Re-add the source or pick columns when joining.
        </ModalAlert>
      ) : (
        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !baseNames.length || !sourceColumns.length}
              onClick={suggestWithLlm}
              className="text-[10px] uppercase tracking-wide"
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              {busy ? "AI mapping…" : "Suggest with LLM"}
            </Button>
            {summary ? (
              <p className="text-[10px] text-muted-foreground">
                {summary}
                {sourceTag ? <span className="ml-1 uppercase text-primary/80">({sourceTag})</span> : null}
              </p>
            ) : null}
          </div>

          <ColumnMappingEditor
            pairs={pairs}
            onChange={setPairs}
            baseColumns={baseNames}
            sourceColumns={sourceColumns}
            onAutoMap={() => setPairs(suggestColumnMappings(baseNames, sourceColumns))}
          />

          <Button
            type="button"
            disabled={saveBusy || busy}
            onClick={saveMapping}
            className="w-full text-xs uppercase tracking-wide"
          >
            {saveBusy ? "Saving…" : "Save column mapping"}
          </Button>
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      {ok ? <p className="mt-2 text-xs text-success">{ok}</p> : null}
    </ModalSection>
  );
}

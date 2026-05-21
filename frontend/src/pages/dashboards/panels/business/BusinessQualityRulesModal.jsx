import { useCallback, useEffect, useState } from "react";
import { X, Play, Loader2 } from "lucide-react";
import { getTablesByJob, runJobEngine } from "../../../../api";
import TableRulesEditor from "../../../../components/rules/TableRulesEditor";
import ScoreRing from "../../../../components/business/ScoreRing";

/**
 * Configure DQ validation rules for a catalog dataset (same editor as Rules workspace).
 */
export default function BusinessQualityRulesModal({ dataset, open, onClose, onRunComplete }) {
  const [tables, setTables] = useState([]);
  const [activeTableId, setActiveTableId] = useState(null);
  const [loadingTables, setLoadingTables] = useState(false);
  const [tablesErr, setTablesErr] = useState("");
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState("");

  const jobId = dataset?.job_id;
  const assessed = dataset?.dq_job_linked || dataset?.score_source === "manual";

  const loadTables = useCallback(async () => {
    if (!jobId) return;
    setLoadingTables(true);
    setTablesErr("");
    try {
      const res = await getTablesByJob(jobId);
      const list = res.data || [];
      setTables(list);
      setActiveTableId((prev) => {
        if (prev && list.some((t) => t.table_id === prev)) return prev;
        return list[0]?.table_id ?? null;
      });
    } catch (e) {
      setTables([]);
      setTablesErr(e?.response?.data?.detail || "Could not load tables for this job.");
    } finally {
      setLoadingTables(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (!open || !jobId) return;
    loadTables();
  }, [open, jobId, loadTables]);

  const activeTable = tables.find((t) => t.table_id === activeTableId);

  const handleRunDq = async () => {
    if (!jobId) return;
    setRunning(true);
    setRunMsg("");
    try {
      await runJobEngine(jobId);
      setRunMsg("Data quality job started. Refresh the Quality tab after it finishes.");
      onRunComplete?.();
    } catch (e) {
      setRunMsg(e?.response?.data?.detail || e?.message || "Failed to run job.");
    } finally {
      setRunning(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4">
      <div className="enterprise-card w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col border border-[#22324f] shadow-xl text-sm">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[#22324f] shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            {assessed ? <ScoreRing score={dataset?.score} size={44} /> : null}
            <div className="min-w-0">
              <h3 className="enterprise-title text-sm truncate">{dataset?.name || "Dataset"}</h3>
              <p className="text-xs text-[#7f95b6] mt-1">
                Set validation rules per table, then run data quality to validate.
              </p>
              {jobId ? (
                <p className="text-[10px] text-[#5c6d8a] mt-1 font-mono">Job #{jobId}</p>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#9ab0d1] hover:text-white p-1 shrink-0" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {!jobId ? (
            <p className="text-sm text-amber-300">
              This dataset has no linked data quality job. Ask a steward or owner to link a job in the catalog first.
            </p>
          ) : loadingTables ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-[#4f8cff]" size={32} />
            </div>
          ) : tablesErr ? (
            <p className="text-sm text-red-400">{tablesErr}</p>
          ) : !tables.length ? (
            <p className="text-sm text-[#7f95b6]">No tables found on this job.</p>
          ) : (
            <>
              <label className="text-[10px] uppercase font-bold text-[#7f95b6] block mb-1">Table</label>
              <select
                className="w-full max-w-md mb-4 border border-[#2a3f63] bg-[#0f1b31] rounded px-3 py-2 text-[#d7e3f7] text-sm"
                value={activeTableId ?? ""}
                onChange={(e) => setActiveTableId(Number(e.target.value))}
              >
                {tables.map((t) => (
                  <option key={t.table_id} value={t.table_id}>
                    {t.table_name} ({t.rule_count ?? 0} active {t.rule_count === 1 ? "rule" : "rules"})
                  </option>
                ))}
              </select>

              {activeTableId ? (
                <TableRulesEditor
                  key={`${jobId}-${activeTableId}`}
                  jobId={jobId}
                  tableId={activeTableId}
                  tableName={activeTable?.table_name}
                  variant="enterprise"
                />
              ) : null}
            </>
          )}
        </div>

        <div className="p-4 border-t border-[#22324f] shrink-0 space-y-2">
          {runMsg ? <p className="text-xs text-[#9ab0d1]">{runMsg}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-xs uppercase font-bold tracking-wide rounded border border-[#2a3f63] text-[#9ab0d1] hover:bg-[#132542]"
            >
              Close
            </button>
            <button
              type="button"
              disabled={!jobId || running}
              onClick={handleRunDq}
              className="flex-1 py-2.5 text-xs uppercase font-bold tracking-wide rounded bg-[#2a4a7a] text-white hover:bg-[#3a5a8a] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Run data quality
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { getTablesByJob, runJobEngine } from "../../../../api";
import TableRulesEditor from "../../../../components/rules/TableRulesEditor";
import ScoreRing from "../../../../components/business/ScoreRing";
import { AppModal, modalInputClass, modalLabelClass } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

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

  return (
    <AppModal
      open={open}
      onClose={onClose}
      maxWidth="max-w-5xl"
      showDefaultFooter={false}
      headerContent={
        <div className="flex items-start gap-3 min-w-0">
          {assessed ? <ScoreRing score={dataset?.score} size={44} /> : null}
          <div className="min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground truncate">
              {dataset?.name || "Dataset"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Set validation rules per table, then run data quality to validate.
            </p>
            {jobId ? <p className="mt-1 font-mono text-[10px] text-muted-foreground">Job #{jobId}</p> : null}
          </div>
        </div>
      }
      footer={
        <div className="space-y-2">
          {runMsg ? <p className="text-xs text-muted-foreground">{runMsg}</p> : null}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 text-xs uppercase tracking-wide" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              disabled={!jobId || running}
              onClick={handleRunDq}
              className="flex-1 gap-2 text-xs uppercase tracking-wide"
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Run data quality
            </Button>
          </div>
        </div>
      }
    >
      {!jobId ? (
        <p className="text-sm text-warning">This dataset has no linked data quality job. Ask a steward or owner to link a job first.</p>
      ) : loadingTables ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : tablesErr ? (
        <p className="text-sm text-destructive">{tablesErr}</p>
      ) : !tables.length ? (
        <p className="text-sm text-muted-foreground">No tables found on this job.</p>
      ) : (
        <>
          <label className={modalLabelClass}>Table</label>
          <Select
            className="mb-4 max-w-md"
            value={activeTableId ?? ""}
            onChange={(e) => setActiveTableId(Number(e.target.value))}
          >
            {tables.map((t) => (
              <option key={t.table_id} value={t.table_id}>
                {t.table_name} ({t.rule_count ?? 0} active {t.rule_count === 1 ? "rule" : "rules"})
              </option>
            ))}
          </Select>
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
    </AppModal>
  );
}

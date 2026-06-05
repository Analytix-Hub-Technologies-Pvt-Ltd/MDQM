import { useCallback, useEffect, useState } from "react";
import { importJobFromDb, refreshJobFromDb } from "../../../api";
import { enterpriseGovernanceDatasetPreview, invalidateEdaReportCache } from "../enterpriseApi";
import DatasetEdaReportModal from "./DatasetEdaReportModal";
import ScoreRing from "../../../components/business/ScoreRing";
import { AppModal, ModalSection, ModalAlert } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import DatasetTableInventoryBlock from "@/components/enterprise/DatasetTableInventoryBlock";

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

export default function DatasetPreviewModal({ datasetId, open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [payload, setPayload] = useState(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshErr, setRefreshErr] = useState("");
  const [refreshOk, setRefreshOk] = useState("");
  const [runBusy, setRunBusy] = useState(false);
  const [edaOpen, setEdaOpen] = useState(false);

  const loadPreview = useCallback(async () => {
    if (datasetId == null) return;
    setLoading(true);
    setErr("");
    try {
      const res = await enterpriseGovernanceDatasetPreview(datasetId);
      setPayload(res?.data ?? res);
    } catch (e) {
      setPayload(null);
      setErr(formatDetail(e?.response?.data) || e?.message || "Failed to load preview.");
    } finally {
      setLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    if (!open || datasetId == null) return;
    setRefreshErr("");
    setRefreshOk("");
    loadPreview();
  }, [open, datasetId, loadPreview]);

  const ds = payload?.dataset;
  const job = payload?.linked_job;
  const refreshMeta = payload?.refresh || {};
  const canRefresh = Boolean(job?.job_id && refreshMeta.available);

  const handleRunImport = async () => {
    if (!job?.job_id) return;
    setRunBusy(true);
    setRefreshErr("");
    setRefreshOk("");
    try {
      await importJobFromDb(job.job_id);
      setRefreshOk("Import started in the background. Refresh this view in a moment.");
    } catch (e) {
      setRefreshErr(formatDetail(e?.response?.data) || e?.message || "Import failed to start.");
    } finally {
      setRunBusy(false);
    }
  };

  const handleRefresh = async () => {
    if (!job?.job_id) return;
    setRefreshBusy(true);
    setRefreshErr("");
    setRefreshOk("");
    try {
      await refreshJobFromDb(job.job_id, {});
      if (datasetId != null) invalidateEdaReportCache(datasetId);
      setRefreshOk("Snapshot updated from the database.");
      await loadPreview();
    } catch (e) {
      setRefreshErr(formatDetail(e?.response?.data) || e?.message || "Refresh failed.");
    } finally {
      setRefreshBusy(false);
    }
  };

  const handleEdaReport = () => {
    if (datasetId == null) return;
    setEdaOpen(true);
  };

  const jobStatus = (job?.status || "").toLowerCase();
  const needsImport = jobStatus === "registered" || jobStatus === "import failed";
  const dataLoaded = Boolean(payload?.data_loaded);
  const hasTableData =
    dataLoaded &&
    (payload?.tables || []).some((t) => (t.row_count || 0) > 0 || (t.sample_rows || []).length > 0);

  return (
    <>
    <AppModal
      open={open}
      onClose={onClose}
      title="Dataset storage"
      description="Registered columns (from MDQM metadata) and a short sample of rows loaded into this product."
      maxWidth="max-w-4xl"
      footer={
        <Button type="button" variant="outline" className="w-full" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading ? (
        <div className="flex min-h-[16rem] items-center justify-center">
          <p className="text-center text-muted-foreground">Loading…</p>
        </div>
      ) : err ? (
        <p className="text-sm text-destructive">{err}</p>
      ) : (
        <div className="space-y-4">
          <ModalSection title="Catalog">
            <p className="text-lg font-semibold text-foreground">{ds?.name ?? "—"}</p>
            <div className="flex flex-wrap items-center gap-4">
              {ds?.eda_score != null ? (
                <div className="flex items-center gap-2">
                  <ScoreRing score={ds.eda_score} size={40} />
                  <span className="text-xs text-muted-foreground">EDA score</span>
                </div>
              ) : null}
              {ds?.dq_score != null ? (
                <div className="flex items-center gap-2">
                  <ScoreRing score={ds.dq_score} size={40} />
                  <span className="text-xs text-muted-foreground">DQ score</span>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {ds?.classification ? <span>Class: {ds.classification}</span> : null}
              {ds?.catalog_job_id != null ? <span>Linked job id: #{ds.catalog_job_id}</span> : null}
            </div>
            {ds?.description ? (
              <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{ds.description}</p>
            ) : null}
          </ModalSection>

          {payload?.hint ? <ModalAlert variant="warning">{payload.hint}</ModalAlert> : null}

          {job ? (
            <ModalAlert variant="success">
              <span className="font-semibold text-success">DQ job </span>
              <span className="font-mono">#{job.job_id}</span>
              {job.job_name ? <span className="text-muted-foreground"> — {job.job_name}</span> : null}
              {job.status ? <span className="text-muted-foreground"> ({job.status})</span> : null}
            </ModalAlert>
          ) : null}

          {canRefresh ? (
            <ModalSection title="Database actions">
              <div className="flex flex-wrap gap-2">
                {needsImport ? (
                  <Button type="button" disabled={runBusy} onClick={handleRunImport} className="text-xs uppercase tracking-wide">
                    {runBusy ? "Starting…" : "Run import"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={refreshBusy}
                    onClick={handleRefresh}
                    className="text-xs uppercase tracking-wide"
                  >
                    {refreshBusy ? "Refreshing…" : "Refresh"}
                  </Button>
                )}
                {hasTableData ? (
                  <Button type="button" variant="outline" onClick={handleEdaReport} className="text-xs uppercase tracking-wide">
                    EDA report
                  </Button>
                ) : null}
              </div>
              {refreshErr ? <p className="text-xs text-destructive mt-2">{refreshErr}</p> : null}
              {refreshOk ? <p className="text-xs text-success mt-2">{refreshOk}</p> : null}
            </ModalSection>
          ) : job?.job_id && !refreshMeta.available ? (
            <ModalAlert variant="info">
              Refresh from database is only available for jobs created via <strong>Table (DB)</strong> in Data Owner.
              File-based datasets: replace the file from the Jobs screen or re-upload.
            </ModalAlert>
          ) : null}

          {(payload?.tables || []).map((t) => (
            <DatasetTableInventoryBlock
              key={`${t.table_id}-${t.table_name}`}
              table={t}
              maxSampleRows={15}
              showSampleRows={dataLoaded}
            />
          ))}

          {!loading && !err && !(payload?.tables || []).length && !payload?.hint ? (
            <p className="text-xs text-muted-foreground">No tables on the linked job yet.</p>
          ) : null}
        </div>
      )}
    </AppModal>
    <DatasetEdaReportModal
      datasetId={datasetId}
      datasetName={ds?.name}
      open={edaOpen}
      onClose={() => setEdaOpen(false)}
    />
    </>
  );
}

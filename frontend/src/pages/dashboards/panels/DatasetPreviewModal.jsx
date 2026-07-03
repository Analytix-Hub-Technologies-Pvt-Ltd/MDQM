import { useCallback, useEffect, useState } from "react";
import { importJobFromDb, refreshJobFromDb, removeJobJoinSource } from "../../../api";
import { enterpriseGovernanceDatasetPreview, invalidateEdaReportCache } from "../enterpriseApi";
import DatasetEdaReportModal from "./DatasetEdaReportModal";
import EditDatasetSourceModal from "./EditDatasetSourceModal";
import AddDataSourceModal from "./AddDataSourceModal";
import DatasetDeleteModal from "./DatasetDeleteModal";
import ScoreRing from "../../../components/business/ScoreRing";
import { AppModal, ModalSection, ModalAlert } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import DatasetTableInventoryBlock from "@/components/enterprise/DatasetTableInventoryBlock";
import DatasetCatalogChartInsights from "@/components/enterprise/DatasetCatalogChartInsights";
import { formatJoinKeysLabel } from "@/components/enterprise/JoinKeyPairsEditor";
import GoldenMergePanel from "@/components/enterprise/GoldenMergePanel";

function formatJoinColumns(join) {
  const cols = join?.selected_columns || [];
  const aliases = join?.column_aliases || {};
  if (!cols.length) return "";
  return cols
    .map((c) => {
      const alias = aliases[c];
      return alias && alias !== c ? `${c} → ${alias}` : c;
    })
    .join(", ");
}

function joinKeysText(join) {
  if (join?.join_keys?.length) return formatJoinKeysLabel(join.join_keys);
  if (join?.left_key && join?.right_key) return `${join.left_key} = ${join.right_key}`;
  return "—";
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

export default function DatasetPreviewModal({ datasetId, open, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [payload, setPayload] = useState(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshErr, setRefreshErr] = useState("");
  const [refreshOk, setRefreshOk] = useState("");
  const [runBusy, setRunBusy] = useState(false);
  const [edaOpen, setEdaOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [removeJoinBusy, setRemoveJoinBusy] = useState("");
  const [chartRevision, setChartRevision] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
  const canEditDataset = Boolean(job?.job_id && refreshMeta.available);
  const baseTable = (payload?.tables || [])[0];
  const baseColumns = baseTable?.columns || [];
  const canAddDataSource = Boolean(job?.job_id && baseColumns.length > 0);
  const joinSources = payload?.join_sources || [];
  const activeJoins = joinSources.filter((j) => j.materialized !== false && j.status !== "broken");
  const brokenJoins = joinSources.filter((j) => j.materialized === false || j.status === "broken");

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
      setChartRevision((n) => n + 1);
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

  const handleRemoveJoin = async (joinId) => {
    if (!job?.job_id || !joinId) return;
    setRemoveJoinBusy(joinId);
    setRefreshErr("");
    setRefreshOk("");
    try {
      await removeJobJoinSource(job.job_id, joinId);
      if (datasetId != null) invalidateEdaReportCache(datasetId);
      setRefreshOk("Join removed. Dataset restored without that source.");
      await loadPreview();
      setChartRevision((n) => n + 1);
    } catch (e) {
      setRefreshErr(formatDetail(e?.response?.data) || e?.message || "Failed to remove join.");
    } finally {
      setRemoveJoinBusy("");
    }
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
      headerContent={
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h2 id="app-modal-title" className="text-sm font-bold uppercase tracking-wider text-foreground">
              Dataset storage
            </h2>
            <div className="flex shrink-0 flex-wrap gap-2">
              {canAddDataSource ? (
                <Button type="button" variant="default" size="sm" onClick={() => setAddSourceOpen(true)} className="text-xs uppercase tracking-wide">
                  Add data source
                </Button>
              ) : null}
              {canEditDataset ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)} className="text-xs uppercase tracking-wide">
                  Edit dataset
                </Button>
              ) : null}
              {datasetId != null ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                  className="text-xs uppercase tracking-wide text-destructive hover:text-destructive"
                >
                  Delete dataset
                </Button>
              ) : null}
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Registered columns (from MDQM metadata) and a short sample of rows loaded into this product.
          </p>
        </div>
      }
      maxWidth="max-w-7xl"
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
        <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
          <div className="space-y-4 lg:col-span-7 xl:col-span-8">
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

            {activeJoins.length > 0 ? (
              <ModalSection title="Joined data sources">
                <div className="space-y-2">
                  {activeJoins.map((j) => (
                    <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                      <div className="min-w-0 text-xs">
                        <p className="font-semibold text-foreground">{j.label || j.file_name || j.table_name || "Join source"}</p>
                        <p className="text-muted-foreground">
                          {(j.source_kind || "file").toUpperCase()} · {(j.join_type || "outer").toUpperCase()} JOIN ·{" "}
                          <span className="font-mono">{joinKeysText(j)}</span>
                        </p>
                        {j.selected_columns?.length ? (
                          <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                            Columns: {formatJoinColumns(j)}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={removeJoinBusy === j.id}
                        onClick={() => handleRemoveJoin(j.id)}
                        className="text-xs uppercase tracking-wide text-destructive hover:text-destructive"
                      >
                        {removeJoinBusy === j.id ? "Removing…" : "Remove join"}
                      </Button>
                    </div>
                  ))}
                </div>
              </ModalSection>
            ) : null}

            {activeJoins.length > 0 && ds && job && (
              <ModalSection title="Golden records">
                <GoldenMergePanel datasetId={ds.id} jobId={job.job_id} joinSources={activeJoins} />
              </ModalSection>
            )}

            {brokenJoins.length > 0 ? (
              <ModalSection title="Incomplete joins">
                <ModalAlert variant="warning">
                  These joins were not completed successfully. Remove them and try again with matching join keys.
                </ModalAlert>
                <div className="mt-2 space-y-2">
                  {brokenJoins.map((j) => (
                    <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-amber-50/50 px-3 py-2 dark:border-amber-700/50 dark:bg-amber-950/20">
                      <div className="min-w-0 text-xs">
                        <p className="font-semibold text-foreground">{j.label || j.file_name || "Failed join"}</p>
                        <p className="text-muted-foreground">
                          Not materialized · <span className="font-mono">{joinKeysText(j)}</span>
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={removeJoinBusy === j.id}
                        onClick={() => handleRemoveJoin(j.id)}
                        className="text-xs uppercase tracking-wide"
                      >
                        {removeJoinBusy === j.id ? "Removing…" : "Remove"}
                      </Button>
                    </div>
                  ))}
                </div>
              </ModalSection>
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
                datasetId={datasetId}
                serverSideSampleRows
                maxSampleRows={15}
                showSampleRows={dataLoaded}
              />
            ))}

            {!loading && !err && !(payload?.tables || []).length && !payload?.hint ? (
              <p className="text-xs text-muted-foreground">No tables on the linked job yet.</p>
            ) : null}
          </div>

          <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-0">
            <DatasetCatalogChartInsights datasetId={datasetId} enabled={hasTableData} dataRevision={chartRevision} />
          </div>
        </div>
      )}
    </AppModal>
    <DatasetEdaReportModal
      datasetId={datasetId}
      datasetName={ds?.name}
      open={edaOpen}
      onClose={() => setEdaOpen(false)}
    />
    <EditDatasetSourceModal
      open={editOpen}
      onClose={() => setEditOpen(false)}
      jobId={job?.job_id}
      sourceConfig={payload?.source_config}
      onSaved={async () => {
        await loadPreview();
        setEditOpen(false);
        setRefreshOk("Dataset source updated. Run import to load updated source data.");
      }}
    />
    <AddDataSourceModal
      open={addSourceOpen}
      onClose={() => setAddSourceOpen(false)}
      jobId={job?.job_id}
      baseColumns={baseColumns}
      onSaved={async (result) => {
        if (datasetId != null) invalidateEdaReportCache(datasetId);
        await loadPreview();
        setChartRevision((n) => n + 1);
        const rows = result?.materialized?.row_count;
        const cols = result?.materialized?.column_count;
        const detail =
          rows != null && cols != null
            ? ` Join complete — ${rows.toLocaleString()} rows, ${cols} columns.`
            : "";
        setRefreshOk(`Data source joined successfully.${detail}`);
      }}
    />
    <DatasetDeleteModal
      open={deleteOpen}
      onClose={() => setDeleteOpen(false)}
      datasetId={datasetId}
      datasetName={ds?.name}
      onDeleted={(info) => {
        setDeleteOpen(false);
        onClose?.();
        onDeleted?.(info);
      }}
    />
    </>
  );
}

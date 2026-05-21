import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { refreshJobFromDb } from "../../../api";
import { enterpriseGovernanceDatasetPreview } from "../enterpriseApi";
import ScoreRing from "../../../components/business/ScoreRing";

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

/** Shows catalog dataset + linked MDQM job tables: column types and sample rows from stored CSVs. */
export default function DatasetPreviewModal({ datasetId, open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [payload, setPayload] = useState(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshErr, setRefreshErr] = useState("");
  const [refreshOk, setRefreshOk] = useState("");
  const [refreshPass, setRefreshPass] = useState("");

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
    setRefreshPass("");
    loadPreview();
  }, [open, datasetId, loadPreview]);

  if (!open) return null;

  const ds = payload?.dataset;
  const job = payload?.linked_job;
  const refreshMeta = payload?.refresh || {};
  const canRefresh = Boolean(job?.job_id && refreshMeta.available);

  const handleRefresh = async () => {
    if (!job?.job_id) return;
    setRefreshBusy(true);
    setRefreshErr("");
    setRefreshOk("");
    try {
      if (
        refreshMeta.manual_connection &&
        !refreshPass.trim() &&
        !refreshMeta.stored_password_available
      ) {
        setRefreshErr("Enter the database password to refresh (manual connection — or set MDQM_DB_SOURCE_MASTER_SECRET and re-import to store encrypted).");
        setRefreshBusy(false);
        return;
      }
      const body = {};
      if (refreshPass.trim()) body.pass = refreshPass.trim();
      await refreshJobFromDb(job.job_id, body);
      setRefreshOk("Snapshot updated from the database.");
      await loadPreview();
    } catch (e) {
      setRefreshErr(formatDetail(e?.response?.data) || e?.message || "Refresh failed.");
    } finally {
      setRefreshBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="enterprise-card w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-[#22324f] shadow-xl text-sm">
        <div className="flex items-start justify-between gap-2 p-4 border-b border-[#22324f] shrink-0">
          <div className="min-w-0">
            <h3 className="enterprise-title text-sm">Dataset storage</h3>
            <p className="text-xs text-[#7f95b6] mt-1">
              Registered columns (from MDQM metadata) and a short sample of rows loaded into this product.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[#9ab0d1] hover:text-white p-1 shrink-0" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4 flex-1 text-[#d7e3f7]">
          {loading ? (
            <p className="text-[#9ab0d1] py-8 text-center">Loading…</p>
          ) : err ? (
            <p className="text-red-400 text-sm">{err}</p>
          ) : (
            <>
              <div className="rounded-lg border border-[#2a4a7a]/50 bg-[#0a1424] p-3 space-y-2">
                <p className="text-[10px] uppercase font-bold text-[#7f95b6]">Catalog</p>
                <p className="font-semibold text-[#d7e3f7]">{ds?.name ?? "—"}</p>
                <div className="flex flex-wrap items-center gap-4">
                  {ds?.eda_score != null ? (
                    <div className="flex items-center gap-2">
                      <ScoreRing score={ds.eda_score} size={40} />
                      <span className="text-xs text-[#9ab0d1]">EDA score</span>
                    </div>
                  ) : null}
                  {ds?.dq_score != null ? (
                    <div className="flex items-center gap-2">
                      <ScoreRing score={ds.dq_score} size={40} />
                      <span className="text-xs text-[#9ab0d1]">DQ score</span>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#9ab0d1]">
                  {ds?.classification ? <span>Class: {ds.classification}</span> : null}
                  {ds?.catalog_job_id != null ? <span>Linked job id: #{ds.catalog_job_id}</span> : null}
                </div>
                {ds?.description ? <p className="text-xs text-[#9ab0d1] mt-2 whitespace-pre-wrap">{ds.description}</p> : null}
              </div>

              {payload?.hint ? (
                <p className="text-xs text-amber-200/95 bg-amber-500/10 border border-amber-500/25 rounded px-3 py-2">{payload.hint}</p>
              ) : null}

              {job ? (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs">
                  <span className="text-emerald-300 font-semibold">DQ job </span>
                  <span className="font-mono">#{job.job_id}</span>
                  {job.job_name ? <span className="text-[#9ab0d1]"> — {job.job_name}</span> : null}
                  {job.status ? <span className="text-[#7f95b6] ml-2">({job.status})</span> : null}
                </div>
              ) : null}

              {canRefresh ? (
                <div className="rounded-lg border border-[#2a5a9a]/40 bg-[#0a1424] p-3 space-y-2">
                  <p className="text-[10px] uppercase font-bold text-[#7f95b6]">Refresh from database</p>
                  <p className="text-[11px] text-[#9ab0d1]">
                    Re-run the same SELECT as when this job was created, update CSV files and column metadata. Use after the source
                    table gains or loses rows.
                  </p>
                  {!refreshMeta.encryption_configured ? (
                    <p className="text-[11px] text-amber-200/95 bg-amber-500/10 border border-amber-500/25 rounded px-2 py-2">
                      For one-click refresh without typing a password each time: set{" "}
                      <code className="text-[10px]">MDQM_DB_SOURCE_MASTER_SECRET</code> in the backend <code className="text-[10px]">.env</code>{" "}
                      (long random string), restart the API, then create this dataset once more from Table (DB) so the password is
                      encrypted and stored on the job.
                    </p>
                  ) : null}
                  {refreshMeta.stored_password_available ? (
                    <p className="text-[11px] text-emerald-200/95 border border-emerald-500/30 rounded px-2 py-2 bg-emerald-500/10">
                      A database password was saved <strong>encrypted</strong> when this dataset was imported. Leave the field blank
                      to reuse it—or type a password only if you want to override for this refresh.
                    </p>
                  ) : null}
                  {refreshMeta.stored_password_available ? (
                    <div>
                      <label className="text-[10px] uppercase text-[#7f95b6] font-bold" htmlFor="ds-refresh-pass">
                        Override password (optional)
                      </label>
                      <input
                        id="ds-refresh-pass"
                        type="password"
                        autoComplete="off"
                        className="mt-1 w-full max-w-sm border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2 text-xs"
                        placeholder="Leave blank to use stored encrypted password"
                        value={refreshPass}
                        onChange={(e) => setRefreshPass(e.target.value)}
                      />
                    </div>
                  ) : refreshMeta.manual_connection ? (
                    <div>
                      <label className="text-[10px] uppercase text-[#7f95b6] font-bold" htmlFor="ds-refresh-pass">
                        Database password
                      </label>
                      <input
                        id="ds-refresh-pass"
                        type="password"
                        autoComplete="off"
                        className="mt-1 w-full max-w-sm border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2 text-xs"
                        placeholder="Same password you use for this database user"
                        value={refreshPass}
                        onChange={(e) => setRefreshPass(e.target.value)}
                      />
                      <p className="text-[11px] text-[#5c7a9e] mt-1">
                        Not stored unless the server master secret is set — then re-import once to save encrypted password.
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-[11px] text-[#9ab0d1]">
                        <strong className="text-[#d7e3f7]">Saved connection:</strong> if the profile was saved with{" "}
                        <code className="text-[10px]">MDQM_DB_SOURCE_MASTER_SECRET</code> set, leave the password blank—refresh uses the
                        encrypted password from the database. Otherwise enter your database password once.
                      </p>
                      <input
                        type="password"
                        autoComplete="off"
                        className="w-full max-w-sm border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2 text-xs"
                        placeholder="Database password if required"
                        value={refreshPass}
                        onChange={(e) => setRefreshPass(e.target.value)}
                      />
                    </>
                  )}
                  {refreshErr ? <p className="text-xs text-red-400">{refreshErr}</p> : null}
                  {refreshOk ? <p className="text-xs text-emerald-400">{refreshOk}</p> : null}
                  <button
                    type="button"
                    disabled={refreshBusy}
                    onClick={handleRefresh}
                    className="text-xs font-bold uppercase tracking-wide px-4 py-2 rounded bg-[#2b7fff] text-white disabled:opacity-50"
                  >
                    {refreshBusy ? "Refreshing…" : "Refresh snapshot now"}
                  </button>
                </div>
              ) : job?.job_id && !refreshMeta.available ? (
                <p className="text-[11px] text-[#7f95b6] border border-[#2a3f63] rounded px-3 py-2">
                  Refresh from database is only available for jobs created via <strong>Table (DB)</strong> in Data Owner. File-based
                  datasets: replace the file from the Jobs screen or re-upload.
                </p>
              ) : null}

              {(payload?.tables || []).map((t) => (
                <div key={`${t.table_id}-${t.table_name}`} className="rounded-lg border border-[#2a3f63] overflow-hidden">
                  <div className="bg-[#0f1b31] px-3 py-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-[#2a3f63]">
                    <span className="font-mono font-semibold text-[#d7e3f7]">{t.table_name}</span>
                    <span className="text-[11px] text-[#7f95b6]">
                      {t.row_count != null ? `${t.row_count} rows stored` : "—"}
                      {t.source_file ? ` · ${t.source_file}` : ""}
                    </span>
                  </div>
                  <div className="p-3 space-y-3">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-[#7f95b6] mb-1.5">Columns (type)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(t.columns || []).map((c) => (
                          <span
                            key={c.name}
                            className="text-[11px] px-2 py-0.5 rounded border border-[#2a5a9a]/40 bg-[#0a1424] text-[#c5d8f0]"
                            title={c.data_type}
                          >
                            <span className="font-mono">{c.name}</span>
                            <span className="text-[#6b7f9e] ml-1">({c.data_type || "?"})</span>
                          </span>
                        ))}
                      </div>
                      {!(t.columns || []).length ? (
                        <p className="text-xs text-[#7f95b6]">No column metadata — run import or open this job in Jobs.</p>
                      ) : null}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-[#7f95b6] mb-1.5">
                        Sample rows (first {Math.min((t.sample_rows || []).length, 15)})
                      </p>
                      {(t.sample_rows || []).length ? (
                        <div className="mdqm-scroll-x overflow-x-auto rounded border border-[#22324f] max-h-56 overflow-y-auto">
                          <table className="w-full text-[11px] min-w-[400px]">
                            <thead className="sticky top-0 bg-[#0a1220] text-[#9ab0d1]">
                              <tr>
                                {(t.columns || []).map((c) => (
                                  <th key={c.name} className="text-left p-2 border-b border-[#22324f] whitespace-nowrap">
                                    {c.name}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(t.sample_rows || []).map((row, ri) => (
                                <tr key={ri} className="border-b border-[#22324f]/50">
                                  {(t.columns || []).map((c) => (
                                    <td
                                      key={c.name}
                                      className="p-2 align-top text-[#d7e3f7] max-w-[220px] truncate"
                                      title={String(row[c.name] ?? "")}
                                    >
                                      {row[c.name] != null && row[c.name] !== "" ? String(row[c.name]) : "—"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-[#7f95b6]">
                          No sample available (CSV missing or unreadable under uploads/). Column list above reflects registered schema.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {!loading && !err && !(payload?.tables || []).length && !payload?.hint ? (
                <p className="text-xs text-[#7f95b6]">No tables on the linked job yet.</p>
              ) : null}
            </>
          )}
        </div>

        <div className="p-3 border-t border-[#22324f] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-xs uppercase font-bold tracking-wide rounded border border-[#2a3f63] text-[#9ab0d1] hover:bg-[#132542]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

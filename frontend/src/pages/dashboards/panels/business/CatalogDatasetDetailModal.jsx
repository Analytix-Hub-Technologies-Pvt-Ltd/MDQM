import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { enterpriseBusinessCatalogDetail } from "../../enterpriseApi";
import ScoreRing from "../../../../components/business/ScoreRing";
import { StatusBadge } from "../../../../components/enterprise/EnterpriseDataPanel";
import { formatRelativeTime } from "../../../../utils/formatRelativeTime";

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

function ruleLabel(ruleType) {
  const t = String(ruleType || "").toLowerCase();
  if (t === "not_null") return "Not null";
  if (t === "unique") return "Unique";
  if (t === "regex") return "Pattern";
  if (t === "fuzzy_match") return "Fuzzy match";
  if (t === "in_list") return "Allowed values";
  if (t === "range") return "Range";
  return ruleType || "Rule";
}

/** Dataset detail: validation rules + results from the last data quality run (read-only). */
export default function CatalogDatasetDetailModal({ datasetId, open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [payload, setPayload] = useState(null);

  const load = useCallback(async () => {
    if (datasetId == null) return;
    setLoading(true);
    setErr("");
    try {
      const res = await enterpriseBusinessCatalogDetail(datasetId);
      setPayload(res?.data ?? res);
    } catch (e) {
      setPayload(null);
      setErr(formatDetail(e?.response?.data) || e?.message || "Failed to load dataset detail.");
    } finally {
      setLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    if (!open || datasetId == null) return;
    load();
  }, [open, datasetId, load]);

  if (!open) return null;

  const cat = payload?.catalog || {};
  const job = payload?.linked_job;
  const dq = payload?.dq || {};
  const tables = payload?.tables || [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4">
      <div className="enterprise-card w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-[#22324f] shadow-xl text-sm">
        <div className="flex items-start justify-between gap-2 p-4 border-b border-[#22324f] shrink-0">
          <div className="min-w-0 flex items-start gap-3">
            <ScoreRing score={cat.dq_job_linked || cat.score_source === "manual" ? cat.score : null} size={48} />
            <div>
              <h3 className="enterprise-title text-sm">{cat.name || "Dataset"}</h3>
              <p className="text-xs text-[#7f95b6] mt-1">
                Validation rules and data quality results (read-only)
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <StatusBadge status={cat.certification} />
                {cat.access_granted ? <StatusBadge status="Access granted" /> : null}
              </div>
            </div>
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
              {job ? (
                <p className="text-xs text-[#9ab0d1]">
                  Linked DQ job <span className="font-mono text-[#d7e3f7]">#{job.job_id}</span>
                  {job.job_name ? ` — ${job.job_name}` : ""}
                  {job.status ? ` (${job.status})` : ""}
                </p>
              ) : null}

              <div className="rounded-lg border border-[#2a5a9a]/40 bg-[#0a1424] p-3">
                <p className="text-[10px] uppercase font-bold text-[#7f95b6] mb-2">Data quality summary</p>
                <div className="flex flex-wrap gap-4 text-xs text-[#9ab0d1]">
                  <span>
                    <strong className="text-[#d7e3f7]">{dq.rules_total ?? 0}</strong> validation rules configured
                  </span>
                  {dq.has_run ? (
                    <span className="text-emerald-400">Last run results available below</span>
                  ) : (
                    <span className="text-amber-300">{dq.message || "No DQ run yet."}</span>
                  )}
                </div>
              </div>

              {payload?.hint ? (
                <p className="text-xs text-amber-200/95 bg-amber-500/10 border border-amber-500/25 rounded px-3 py-2">
                  {payload.hint}
                </p>
              ) : null}

              {tables.map((t) => (
                <div key={`${t.table_id}-${t.table_name}`} className="rounded-lg border border-[#2a3f63] overflow-hidden">
                  <div className="bg-[#0f1b31] px-3 py-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-[#2a3f63]">
                    <span className="font-mono font-semibold">{t.table_name}</span>
                    <span className="text-[11px] text-[#7f95b6]">
                      {t.row_count != null ? `${t.row_count} rows` : "—"}
                    </span>
                  </div>

                  {t.dq_run ? (
                    <div className="px-3 py-3 border-b border-[#2a3f63] bg-[#0a1424]/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      <div>
                        <div className="text-[10px] text-[#5c6d8a] uppercase">Pass rate</div>
                        <div className="text-lg font-bold text-emerald-400">{t.dq_run.pass_rate}%</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#5c6d8a] uppercase">Good rows</div>
                        <div className="text-lg font-bold">{t.dq_run.good_rows}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#5c6d8a] uppercase">Validation fails</div>
                        <div className="text-lg font-bold text-amber-400">{t.dq_run.validation_errors}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#5c6d8a] uppercase">Fuzzy fails</div>
                        <div className="text-lg font-bold text-red-300">{t.dq_run.fuzzy_errors}</div>
                      </div>
                      {t.dq_run.end_time ? (
                        <p className="col-span-full text-[10px] text-[#5c6d8a] text-left">
                          Last run: {formatRelativeTime(t.dq_run.end_time)}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="px-3 py-2 text-xs text-[#7f95b6] border-b border-[#2a3f63]">
                      No DQ run stats for this table yet.
                    </p>
                  )}

                  <div className="p-3 space-y-3">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-[#7f95b6] mb-2">
                        Validation rules ({(t.rules || []).length})
                      </p>
                      {(t.rules || []).length ? (
                        <div className="overflow-x-auto rounded border border-[#22324f]">
                          <table className="w-full text-[11px] min-w-[480px]">
                            <thead className="bg-[#0a1220] text-[#9ab0d1]">
                              <tr>
                                <th className="text-left p-2">Column</th>
                                <th className="text-left p-2">Rule</th>
                                <th className="text-left p-2">Value</th>
                                <th className="text-left p-2">Type</th>
                                <th className="text-left p-2">Active</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(t.rules || []).map((r) => (
                                <tr key={r.rule_id} className="border-t border-[#22324f]/50">
                                  <td className="p-2 font-mono">{r.column_name}</td>
                                  <td className="p-2">{ruleLabel(r.rule_type)}</td>
                                  <td className="p-2 text-[#9ab0d1] max-w-[200px] truncate" title={r.rule_value || ""}>
                                    {r.rule_value || "—"}
                                  </td>
                                  <td className="p-2 text-[#7f95b6]">{r.data_type || "—"}</td>
                                  <td className="p-2">
                                    <StatusBadge status={r.is_active ? "active" : "inactive"} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-[#7f95b6]">No validation rules on this table.</p>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] uppercase font-bold text-[#7f95b6] mb-1.5">Sample data</p>
                      {(t.sample_rows || []).length ? (
                        <div className="mdqm-scroll-x overflow-x-auto rounded border border-[#22324f] max-h-40 overflow-y-auto">
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
                              {(t.sample_rows || []).slice(0, 8).map((row, ri) => (
                                <tr key={ri} className="border-b border-[#22324f]/50">
                                  {(t.columns || []).map((c) => (
                                    <td key={c.name} className="p-2 max-w-[180px] truncate" title={String(row[c.name] ?? "")}>
                                      {row[c.name] != null && row[c.name] !== "" ? String(row[c.name]) : "—"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-[#7f95b6]">No sample rows available.</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {!tables.length && !payload?.hint ? (
                <p className="text-xs text-[#7f95b6]">No tables on the linked job.</p>
              ) : null}
            </>
          )}
        </div>

        <div className="p-3 border-t border-[#22324f] shrink-0 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 text-xs uppercase font-bold tracking-wide rounded border border-[#2a3f63] text-[#9ab0d1] hover:bg-[#132542]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

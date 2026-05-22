import { useCallback, useEffect, useState } from "react";
import { enterpriseBusinessCatalogDetail } from "../../enterpriseApi";
import ScoreRing from "../../../../components/business/ScoreRing";
import { StatusBadge } from "../../../../components/enterprise/EnterpriseDataPanel";
import { formatRelativeTime } from "../../../../utils/formatRelativeTime";
import { AppModal, ModalSection, ModalAlert, modalLabelClass } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

  const cat = payload?.catalog || {};
  const job = payload?.linked_job;
  const dq = payload?.dq || {};
  const tables = payload?.tables || [];

  return (
    <AppModal
      open={open}
      onClose={onClose}
      maxWidth="max-w-4xl"
      headerContent={
        <div className="flex items-start gap-3 min-w-0">
          <ScoreRing score={cat.dq_job_linked || cat.score_source === "manual" ? cat.score : null} size={48} />
          <div className="min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{cat.name || "Dataset"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Validation rules and data quality results (read-only)</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge status={cat.certification} />
              {cat.access_granted ? <StatusBadge status="Access granted" /> : null}
            </div>
          </div>
        </div>
      }
      footer={
        <Button type="button" variant="outline" className="w-full" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Loading…</p>
      ) : err ? (
        <p className="text-sm text-destructive">{err}</p>
      ) : (
        <div className="space-y-4">
          {job ? (
            <p className="text-xs text-muted-foreground">
              Linked DQ job <span className="font-mono font-medium text-foreground">#{job.job_id}</span>
              {job.job_name ? ` — ${job.job_name}` : ""}
              {job.status ? ` (${job.status})` : ""}
            </p>
          ) : null}

          <ModalSection title="Data quality summary">
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>
                <strong className="text-foreground">{dq.rules_total ?? 0}</strong> validation rules configured
              </span>
              {dq.has_run ? (
                <span className="font-medium text-success">Last run results available below</span>
              ) : (
                <span className="text-warning">{dq.message || "No DQ run yet."}</span>
              )}
            </div>
          </ModalSection>

          {payload?.hint ? <ModalAlert variant="warning">{payload.hint}</ModalAlert> : null}

          {tables.map((t) => (
            <div key={`${t.table_id}-${t.table_name}`} className="overflow-hidden rounded-xl border border-border">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted/50 px-3 py-2">
                <span className="font-mono font-semibold text-foreground">{t.table_name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {t.row_count != null ? `${t.row_count} rows` : "—"}
                </span>
              </div>

              {t.dq_run ? (
                <div className="grid grid-cols-2 gap-3 border-b border-border bg-muted/30 px-3 py-3 text-center sm:grid-cols-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Pass rate</div>
                    <div className="text-lg font-bold text-success">{t.dq_run.pass_rate}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Good rows</div>
                    <div className="text-lg font-bold text-foreground">{t.dq_run.good_rows}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Validation fails</div>
                    <div className="text-lg font-bold text-warning">{t.dq_run.validation_errors}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Fuzzy fails</div>
                    <div className="text-lg font-bold text-destructive">{t.dq_run.fuzzy_errors}</div>
                  </div>
                  {t.dq_run.end_time ? (
                    <p className="col-span-full text-left text-[10px] text-muted-foreground">
                      Last run: {formatRelativeTime(t.dq_run.end_time)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">No DQ run stats for this table yet.</p>
              )}

              <div className="space-y-3 p-3">
                <div>
                  <p className={cn(modalLabelClass, "mb-2")}>Validation rules ({(t.rules || []).length})</p>
                  {(t.rules || []).length ? (
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[480px] text-[11px]">
                        <thead className="bg-[var(--table-header-bg)] text-[var(--table-header-fg)]">
                          <tr>
                            <th className="p-2 text-left">Column</th>
                            <th className="p-2 text-left">Rule</th>
                            <th className="p-2 text-left">Value</th>
                            <th className="p-2 text-left">Type</th>
                            <th className="p-2 text-left">Active</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(t.rules || []).map((r) => (
                            <tr key={r.rule_id} className="border-t border-border">
                              <td className="p-2 font-mono text-foreground">{r.column_name}</td>
                              <td className="p-2 text-foreground">{ruleLabel(r.rule_type)}</td>
                              <td className="max-w-[200px] truncate p-2 text-muted-foreground" title={r.rule_value || ""}>
                                {r.rule_value || "—"}
                              </td>
                              <td className="p-2 text-muted-foreground">{r.data_type || "—"}</td>
                              <td className="p-2">
                                <StatusBadge status={r.is_active ? "active" : "inactive"} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No validation rules on this table.</p>
                  )}
                </div>

                <div>
                  <p className={cn(modalLabelClass, "mb-1.5")}>Sample data</p>
                  {(t.sample_rows || []).length ? (
                    <div className="mdqm-scroll-x max-h-40 overflow-auto rounded-lg border border-border">
                      <table className="w-full min-w-[400px] text-[11px]">
                        <thead className="sticky top-0 bg-[var(--table-header-bg)] text-[var(--table-header-fg)]">
                          <tr>
                            {(t.columns || []).map((c) => (
                              <th key={c.name} className="whitespace-nowrap border-b border-border p-2 text-left">
                                {c.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(t.sample_rows || []).slice(0, 8).map((row, ri) => (
                            <tr key={ri} className="border-b border-border">
                              {(t.columns || []).map((c) => (
                                <td
                                  key={c.name}
                                  className="max-w-[180px] truncate p-2 text-foreground"
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
                    <p className="text-xs text-muted-foreground">No sample rows available.</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {!tables.length && !payload?.hint ? (
            <p className="text-xs text-muted-foreground">No tables on the linked job.</p>
          ) : null}
        </div>
      )}
    </AppModal>
  );
}

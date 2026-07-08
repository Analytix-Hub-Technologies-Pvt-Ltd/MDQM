import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { enterpriseStewardCatalog } from "../../enterpriseApi";
import ScoreRing from "../../../../components/business/ScoreRing";
import { StatusBadge } from "../../../../components/enterprise/EnterpriseDataPanel";
import { formatRelativeTime } from "../../../../utils/formatRelativeTime";
import StewardCatalogDetailModal from "./StewardCatalogDetailModal";

const inputClass =
  "w-full max-w-md rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground placeholder:text-[var(--placeholder)] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const btnOutline =
  "rounded border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors";

const btnPrimaryOutline =
  "rounded border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15 dark:border-[#4f8cff]/50 dark:bg-[#1a2844] dark:text-[#d7e3f7] dark:hover:border-[#4f8cff]";

export default function StewardCatalogPanel() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [err, setErr] = useState("");
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailDatasetId, setDetailDatasetId] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await enterpriseStewardCatalog({
        page: 1,
        page_size: 50,
        q: debounced || undefined,
        assigned_to_me: assignedToMe || undefined,
      });
      setItems(res.data?.items || []);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to load catalog");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [debounced, assignedToMe]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetailModal = (dataset) => {
    if (dataset?.id == null) return;
    setDetailDatasetId(dataset.id);
    setDetailModalOpen(true);
  };

  const goValidation = (jobId) => {
    if (!jobId) return;
    navigate(`/dashboard?tab=validation&job=${jobId}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className={inputClass}
          placeholder="Search datasets by name or domain…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded border-border"
            checked={assignedToMe}
            onChange={(e) => setAssignedToMe(e.target.checked)}
          />
          My datasets only
        </label>
      </div>
      {err ? <p className="text-xs text-amber-700 dark:text-amber-400">{err}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading catalog…</p> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {items.map((d) => (
          <div key={d.id ?? d.name} className="enterprise-card p-4">
            <div className="flex gap-3 items-start mb-3">
              <ScoreRing score={d.dq_job_linked || d.score_source === "manual" ? d.score : null} size={52} />
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-foreground">{d.name}</h4>
                <p className="text-xs text-muted-foreground">
                  Domain: {d.domain || "—"} · {d.record_count} · Owner: {d.owner}
                  {d.steward && d.steward !== "—" ? ` · Steward: ${d.steward}` : ""}
                </p>
                {!d.dq_job_linked && d.score_source !== "manual" ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400/90 mt-1">
                    No DQ job linked — scores unavailable until owner links a job.
                  </p>
                ) : null}
                {d.description ? <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.description}</p> : null}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <StatusBadge status={d.certification} />
                  <StatusBadge status={d.tier} />
                  <StatusBadge status={d.classification} />
                  {d.pii ? <StatusBadge status="PII" /> : null}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3 text-center">
              {[
                { l: "Complete", v: d.completeness },
                { l: "Valid", v: d.validity },
                { l: "Unique", v: d.uniqueness },
              ].map((m) => (
                <div key={m.l} className="rounded bg-slate-100 px-2 py-1.5 dark:bg-[#141d2e]">
                  <div className="text-[10px] text-muted-foreground">{m.l}</div>
                  <div className="text-sm font-bold text-foreground">
                    {d.dq_job_linked || d.score_source === "manual" ? `${m.v}%` : "—"}
                  </div>
                </div>
              ))}
            </div>
            {d.last_run ? (
              <p className="text-[10px] text-muted-foreground mb-2">Last DQ run: {formatRelativeTime(d.last_run)}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnPrimaryOutline}
                onClick={() => openDetailModal(d)}
                disabled={!d.id}
                title="View validation rules and DQ run results"
              >
                View details
              </button>
              {d.job_id ? (
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => goValidation(d.job_id)}
                  title="Open validation tab for this job"
                >
                  Run validation
                </button>
              ) : null}
              <button
                type="button"
                className={btnOutline}
                onClick={() => navigate("/quarantine")}
              >
                Quarantine
              </button>
            </div>
          </div>
        ))}
      </div>
      {!loading && !items.length ? <p className="text-sm text-muted-foreground">No datasets match your search.</p> : null}

      {detailModalOpen ? (
        <StewardCatalogDetailModal
          datasetId={detailDatasetId}
          open={detailModalOpen}
          onClose={() => {
            setDetailModalOpen(false);
            setDetailDatasetId(null);
          }}
        />
      ) : null}
    </div>
  );
}

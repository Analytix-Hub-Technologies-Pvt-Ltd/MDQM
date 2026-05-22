import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { enterpriseBusinessCatalog } from "../../enterpriseApi";
import ScoreRing from "../../../../components/business/ScoreRing";
import { StatusBadge } from "../../../../components/enterprise/EnterpriseDataPanel";
import { formatRelativeTime } from "../../../../utils/formatRelativeTime";
import DataAccessRequestModal from "./DataAccessRequestModal";
import CatalogDatasetDetailModal from "./CatalogDatasetDetailModal";

export default function CatalogPanel() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [err, setErr] = useState("");
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestDataset, setRequestDataset] = useState("");
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
      const res = await enterpriseBusinessCatalog({ page: 1, page_size: 50, q: debounced || undefined });
      setItems(res.data?.items || []);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to load catalog");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    load();
  }, [load]);

  /** Open request modal when redirected from legacy ?tab=requests or ?openRequest=name */
  useEffect(() => {
    const ds = searchParams.get("openRequest") || "";
    if (!ds) return;
    setRequestDataset(ds);
    setRequestModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("openRequest");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openRequestModal = (name) => {
    setRequestDataset(name || "");
    setRequestModalOpen(true);
  };

  const openDetailModal = (dataset) => {
    if (dataset?.id == null) return;
    setDetailDatasetId(dataset.id);
    setDetailModalOpen(true);
  };

  const goLineage = (name) => navigate(`/dashboard?tab=lineage&dataset=${encodeURIComponent(name)}`);

  const canAccess = (d) => Boolean(d.access_granted) || (d.dq_job_linked && (d.score ?? 0) >= 70);

  const onRequestSubmitted = () => {
    setRequestModalOpen(false);
    setRequestDataset("");
    window.dispatchEvent(new CustomEvent("mdqm-notifications-refresh"));
    window.dispatchEvent(new CustomEvent("mdqm-owner-access-refresh"));
    load();
  };

  return (
    <div className="space-y-4">
      <input
        className="w-full max-w-md rounded border border-[#2a3f63] bg-[#0a1220] px-3 py-2 text-sm text-[#d7e3f7]"
        placeholder="Search datasets by name or domain…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {err ? <p className="text-xs text-amber-400">{err}</p> : null}
      {loading ? <p className="text-sm text-[#7f95b6]">Loading catalog…</p> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {items.map((d) => (
          <div key={d.id ?? d.name} className="enterprise-card p-4">
            <div className="flex gap-3 items-start mb-3">
              <ScoreRing score={d.dq_job_linked || d.score_source === "manual" ? d.score : null} size={52} />
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-[#d7e3f7]">{d.name}</h4>
                <p className="text-xs text-[#5c6d8a]">
                  Domain: {d.domain || "—"} · {d.record_count} · Owner: {d.owner}
                  {d.steward && d.steward !== "—" ? ` · Steward: ${d.steward}` : ""}
                </p>
                {!d.dq_job_linked && d.score_source !== "manual" ? (
                  <p className="text-xs text-amber-400/90 mt-1">No DQ job linked — scores unavailable until owner links a job.</p>
                ) : null}
                {d.description ? <p className="text-xs text-[#7f95b6] mt-1 line-clamp-2">{d.description}</p> : null}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <StatusBadge status={d.certification} />
                  <StatusBadge status={d.tier} />
                  <StatusBadge status={d.classification} />
                  {d.pii ? <StatusBadge status="PII" /> : null}
                  {d.access_granted ? <StatusBadge status="Access granted" /> : null}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3 text-center">
              {[
                { l: "Complete", v: d.completeness },
                { l: "Valid", v: d.validity },
                { l: "Unique", v: d.uniqueness },
              ].map((m) => (
                <div key={m.l} className="rounded bg-[#141d2e] px-2 py-1.5">
                  <div className="text-[10px] text-[#5c6d8a]">{m.l}</div>
                  <div className="text-sm font-bold text-[#d7e3f7]">
                    {d.dq_job_linked || d.score_source === "manual" ? `${m.v}%` : "—"}
                  </div>
                </div>
              ))}
            </div>
            {d.last_run ? (
              <p className="text-[10px] text-[#5c6d8a] mb-2">Last DQ run: {formatRelativeTime(d.last_run)}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-[#4f8cff]/50 bg-[#1a2844] px-3 py-1.5 text-xs font-semibold text-[#9ab0d1] hover:border-[#4f8cff] hover:text-[#d7e3f7]"
                onClick={() => openDetailModal(d)}
                disabled={!d.id && !d.dq_job_linked}
                title={d.dq_job_linked ? "View validation rules and DQ run results" : "No dataset detail available"}
              >
                View details
              </button>
              {canAccess(d) ? (
                <button
                  type="button"
                  className="rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
                  title={d.job_id ? `Open Jobs workspace (job #${d.job_id})` : "Browse jobs workspace"}
                  onClick={() => navigate(d.job_id ? `/jobs` : "/jobs")}
                >
                  Access data
                </button>
              ) : (
                <button type="button" className="rounded border border-[#2a3f63] px-3 py-1.5 text-xs text-[#5c6d8a]" disabled title="Request access or link DQ job">
                  Restricted
                </button>
              )}
              <button
                type="button"
                className="rounded border border-[#2a3f63] px-3 py-1.5 text-xs text-[#d7e3f7] hover:border-[#4f8cff]"
                onClick={() => openRequestModal(d.name)}
              >
                Request access
              </button>
              <button type="button" className="rounded border border-[#2a3f63] px-3 py-1.5 text-xs text-[#d7e3f7]" onClick={() => goLineage(d.name)}>
                View lineage
              </button>
            </div>
          </div>
        ))}
      </div>
      {!loading && !items.length ? <p className="text-sm text-[#7f95b6]">No datasets match your search.</p> : null}

      {requestModalOpen ? (
        <DataAccessRequestModal
          initialDataset={requestDataset}
          onClose={() => {
            setRequestModalOpen(false);
            setRequestDataset("");
          }}
          onSubmitted={onRequestSubmitted}
        />
      ) : null}

      {detailModalOpen ? (
        <CatalogDatasetDetailModal
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

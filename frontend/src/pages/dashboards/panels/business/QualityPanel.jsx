import { useCallback, useEffect, useState } from "react";
import { enterpriseBusinessQualityScores } from "../../enterpriseApi";
import ScoreRing from "../../../../components/business/ScoreRing";
import PassBar from "../../../../components/business/PassBar";
import StatCard from "../../../../components/business/StatCard";
import { Sparkles, CheckCircle2, TriangleAlert, AlertCircle } from "lucide-react";
import { StatusBadge } from "../../../../components/enterprise/EnterpriseDataPanel";
import { formatRelativeTime } from "../../../../utils/formatRelativeTime";
import BusinessQualityRulesModal from "./BusinessQualityRulesModal";

export default function QualityPanel() {
  const [data, setData] = useState({ items: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [rulesDataset, setRulesDataset] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await enterpriseBusinessQualityScores({ page: 1, page_size: 100 });
      const body = res.data || {};
      setData({ items: body.items || [], summary: body.summary || {} });
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to load quality scores");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const s = data.summary;

  const openRules = (row) => {
    if (!row?.job_id) return;
    setRulesDataset(row);
    setRulesModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Avg quality score" value={s.avg_score ?? "—"} sub="Across catalog datasets" icon={Sparkles} tone="warning" />
        <StatCard label="Certified datasets" value={s.certified_count ?? 0} sub="Score ≥ 90" icon={CheckCircle2} tone="success" />
        <StatCard label="Caution datasets" value={s.caution_count ?? 0} sub="Score below 80" icon={TriangleAlert} tone="danger" />
        <StatCard label="Total issues" value={s.total_issues ?? 0} sub="Validation + fuzzy errors" icon={AlertCircle} tone="warning" />
      </div>
      {err ? <p className="text-xs text-amber-400">{err}</p> : null}
      <div className="enterprise-card overflow-x-auto">
        <h3 className="enterprise-title p-4 pb-2">Quality score overview</h3>
        <p className="px-4 pb-2 text-[11px] text-[#7f95b6]">
          Click a dataset with a linked DQ job to configure validation rules and run checks.
        </p>
        {loading ? (
          <p className="p-4 text-sm text-[#7f95b6]">Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[#9ab0d1] border-b border-[#22324f]">
              <tr>
                <th className="text-left p-3">Dataset</th>
                <th className="text-left p-3">Overall</th>
                <th className="text-left p-3">Completeness</th>
                <th className="text-left p-3">Validity</th>
                <th className="text-left p-3">Uniqueness</th>
                <th className="text-left p-3">Timeliness</th>
                <th className="text-left p-3">Consistency</th>
                <th className="text-left p-3">Accuracy</th>
                <th className="text-left p-3">Issues</th>
                <th className="text-left p-3">Refreshed</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => {
                const assessed = r.dq_job_linked || r.score_source === "manual";
                const canEditRules = Boolean(r.job_id);
                return (
                  <tr
                    key={r.id ?? r.name}
                    className={`border-b border-[#22324f]/50 ${canEditRules ? "cursor-pointer hover:bg-[#132542]/60" : ""}`}
                    onClick={() => canEditRules && openRules(r)}
                    title={canEditRules ? "Configure DQ rules and run validation" : undefined}
                  >
                    <td className="p-3 font-medium text-[#d7e3f7]">
                      {r.name}
                      {canEditRules ? (
                        <span className="block text-[10px] font-normal text-[#4f8cff]/90 mt-0.5">Click to set rules</span>
                      ) : !assessed ? (
                        <span className="block text-[10px] font-normal text-amber-400/90 mt-0.5">No DQ job linked</span>
                      ) : null}
                    </td>
                    <td className="p-3">{assessed ? <ScoreRing score={r.score} size={34} /> : <span className="text-xs text-[#5c6d8a]">—</span>}</td>
                    <td className="p-3">{assessed ? <PassBar value={r.completeness} threshold={90} /> : "—"}</td>
                    <td className="p-3">{assessed ? <PassBar value={r.validity} threshold={90} /> : "—"}</td>
                    <td className="p-3">{assessed ? <PassBar value={r.uniqueness} threshold={98} /> : "—"}</td>
                    <td className="p-3">{assessed ? <PassBar value={r.timeliness} threshold={85} /> : "—"}</td>
                    <td className="p-3">{assessed ? <PassBar value={r.consistency} threshold={90} /> : "—"}</td>
                    <td className="p-3">{assessed ? <PassBar value={r.accuracy} threshold={90} /> : "—"}</td>
                    <td className="p-3">
                      {assessed ? (
                        <>
                          <StatusBadge status={(r.issues || 0) > 50 ? "failed" : (r.issues || 0) > 10 ? "warning" : "success"} />
                          <span className="ml-1 text-xs text-[#9ab0d1]">{r.issues ?? 0}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 text-xs text-[#5c6d8a]">{r.last_run ? formatRelativeTime(r.last_run) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && !data.items.length ? <p className="p-4 text-xs text-[#7f95b6]">Add datasets to the enterprise catalog to see scores.</p> : null}
      </div>

      {rulesModalOpen ? (
        <BusinessQualityRulesModal
          dataset={rulesDataset}
          open={rulesModalOpen}
          onClose={() => {
            setRulesModalOpen(false);
            setRulesDataset(null);
          }}
          onRunComplete={load}
        />
      ) : null}
    </div>
  );
}

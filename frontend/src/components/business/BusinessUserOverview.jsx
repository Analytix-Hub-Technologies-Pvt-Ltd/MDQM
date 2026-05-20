import { useEffect, useState } from "react";
import { Bell, BookMarked, FileBarChart, Inbox, CheckCircle2 } from "lucide-react";
import { enterpriseBusinessOverview } from "../../pages/dashboards/enterpriseApi";
import ScoreRing from "./ScoreRing";
import StatCard from "./StatCard";

function CertBadge({ label }) {
  const s = String(label || "").toLowerCase();
  let c = "#7f95b6";
  if (s.includes("certified")) c = "#4ade80";
  else if (s.includes("trusted")) c = "#2dd4bf";
  else if (s.includes("caution")) c = "#f59e0b";
  else if (s.includes("low")) c = "#f87171";
  return (
    <span className="text-[10px] px-2 py-0.5 rounded border font-semibold uppercase" style={{ color: c, borderColor: `${c}55`, background: `${c}18` }}>
      {label}
    </span>
  );
}

export default function BusinessUserOverview() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await enterpriseBusinessOverview();
        if (on) setData(res.data);
      } catch (e) {
        if (on) setErr(e?.response?.data?.detail || "Could not load overview");
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  if (loading) {
    return <div className="enterprise-card p-8 text-center text-sm text-[#9ab0d1] animate-pulse">Loading workspace overview…</div>;
  }
  if (err) return <p className="text-sm text-amber-400">{err}</p>;

  const stats = data?.stats || {};
  const top = Array.isArray(data?.top_datasets) ? data.top_datasets : [];
  const glossary = Array.isArray(data?.glossary_highlights) ? data.glossary_highlights : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Available datasets" value={stats.certified_datasets ?? 0} sub="Score ≥ 80 (certified for use)" icon={CheckCircle2} tone="success" />
        <StatCard
          label="My data requests"
          value={stats.my_requests_total ?? 0}
          sub={`${stats.my_requests_pending ?? 0} pending approval`}
          icon={Inbox}
          tone="warning"
        />
        <StatCard label="My reports" value={stats.my_reports ?? 0} sub="In your catalog" icon={FileBarChart} />
        <StatCard
          label="Watched alerts"
          value={stats.watched_alerts ?? 0}
          sub={`${stats.unread_notifications ?? 0} unread notifications`}
          icon={Bell}
          tone={stats.unread_notifications ? "warning" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="enterprise-card p-4">
          <h3 className="enterprise-title mb-1">Data quality at a glance</h3>
          <p className="text-xs text-[#7f95b6] mb-4">Datasets available for your use</p>
          {!top.length ? (
            <p className="text-xs text-[#7f95b6]">No datasets in catalog yet.</p>
          ) : (
            <ul className="divide-y divide-[#22324f]/60">
              {top.map((d) => (
                <li key={d.id ?? d.name} className="flex items-center gap-3 py-3">
                  <ScoreRing score={d.score} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#d7e3f7] truncate">{d.name}</p>
                    <p className="text-xs text-[#5c6d8a]">
                      {d.domain} · {d.record_count}
                    </p>
                  </div>
                  <CertBadge label={d.certification} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="enterprise-card p-4">
          <h3 className="enterprise-title mb-1">Business glossary highlights</h3>
          <p className="text-xs text-[#7f95b6] mb-4">Recently approved terms</p>
          {!glossary.length ? (
            <p className="text-xs text-[#7f95b6]">No approved glossary terms yet.</p>
          ) : (
            <ul className="divide-y divide-[#22324f]/60">
              {glossary.map((g) => (
                <li key={g.id} className="py-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-bold text-sky-400">{g.term}</span>
                    {g.domain ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950/50 text-indigo-300 border border-indigo-600/30">{g.domain}</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-[#9ab0d1] line-clamp-2">{g.definition}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

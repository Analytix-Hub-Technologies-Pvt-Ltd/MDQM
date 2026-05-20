import { useEffect, useState } from "react";
import { enterpriseBusinessReports, enterpriseReportsExportDownload } from "../../enterpriseApi";
import { buildBusinessReportCsv, businessReportCsvFilename, downloadTextFile } from "../../../../utils/downloadCsv";
import ScoreRing from "../../../../components/business/ScoreRing";
import StatCard from "../../../../components/business/StatCard";
import { FileBarChart, CheckCircle2, TriangleAlert } from "lucide-react";
import { StatusBadge } from "../../../../components/enterprise/EnterpriseDataPanel";

export default function ReportsPanel() {
  const [data, setData] = useState({ items: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(null);
  const [openHint, setOpenHint] = useState("");
  const [exportHint, setExportHint] = useState("");

  const onOpen = (r) => {
    const url = (r.external_url || "").trim();
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      setOpenHint("");
      return;
    }
    setOpenHint(
      `"${r.title}" has no Open URL. A data owner must add a link when publishing (Governance → Business reports → Open URL).`,
    );
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await enterpriseBusinessReports({ page: 1, page_size: 50 });
        setData({ items: res.data?.items || [], summary: res.data?.summary || {} });
      } catch {
        setData({ items: [], summary: {} });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onExport = (r) => {
    setExporting(r.id);
    setExportHint("");
    try {
      const filename = businessReportCsvFilename(r.title);
      downloadTextFile(buildBusinessReportCsv(r), filename);
      setExportHint(`Saved ${filename} — check your Downloads folder (report summary, not full dataset rows).`);
      // Optional: log export on server (do not block download if API fails)
      enterpriseReportsExportDownload({
        report_type: r.report_type,
        format: "csv",
        payload: {
          report_id: r.id,
          title: r.title,
          report_type: r.report_type,
          dataset_name: r.dataset_name,
          status: r.status,
          quality_score: r.quality_score,
          last_refreshed: r.last_refreshed,
          external_url: r.external_url,
        },
      })
        .then(() => window.dispatchEvent(new CustomEvent("mdqm-notifications-refresh")))
        .catch(() => {});
    } catch (err) {
      setExportHint(`Export failed: ${err?.message || "unknown error"}`);
    } finally {
      setExporting(null);
    }
  };

  const s = data.summary;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total reports" value={s.total ?? data.items.length} sub="Available to you" icon={FileBarChart} />
        <StatCard label="Certified" value={s.certified ?? 0} sub="Data quality verified" icon={CheckCircle2} tone="success" />
        <StatCard label="Stale / outdated" value={s.stale ?? 0} sub="Need refresh" icon={TriangleAlert} tone="warning" />
      </div>
      {loading ? <p className="text-sm text-[#7f95b6]">Loading reports…</p> : null}
      {openHint ? (
        <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{openHint}</p>
      ) : null}
      {exportHint ? (
        <p className="rounded border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">{exportHint}</p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.items.map((r) => (
          <div key={r.id} className="enterprise-card p-4">
            <div className="flex justify-between gap-3 mb-3">
              <div>
                <h4 className="font-semibold text-[#d7e3f7]">{r.title}</h4>
                <p className="text-xs text-[#5c6d8a]">
                  {r.report_type} · Source: {r.dataset_name || "—"}
                </p>
                <p className="text-xs text-[#5c6d8a]">Last refresh: {r.last_refreshed || "—"}</p>
              </div>
              {r.quality_score != null ? <ScoreRing score={r.quality_score} size={36} /> : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <StatusBadge status={r.status} />
                <StatusBadge status={r.report_type} />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`rounded px-3 py-1.5 text-xs font-semibold text-white ${
                    r.external_url ? "bg-sky-600 hover:bg-sky-500" : "bg-sky-600/50"
                  }`}
                  title={r.external_url ? "Open report in a new tab" : "No URL configured for this report"}
                  onClick={() => onOpen(r)}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="rounded border border-[#2a3f63] px-3 py-1.5 text-xs text-[#d7e3f7]"
                  disabled={exporting === r.id}
                  onClick={() => onExport(r)}
                >
                  {exporting === r.id ? "Exporting…" : "Export CSV"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { enterpriseBusinessDataRequestCreate, enterpriseGovernanceDatasets } from "../../enterpriseApi";

const DURATION_OPTIONS = [
  { value: "7_days", label: "7 days" },
  { value: "30_days", label: "30 days" },
  { value: "90_days", label: "90 days" },
  { value: "180_days", label: "180 days" },
  { value: "ongoing", label: "Ongoing" },
];

/** Submit a dataset access request without leaving the catalog. */
export default function DataAccessRequestModal({ onClose, onSubmitted, initialDataset = "" }) {
  const [datasetOptions, setDatasetOptions] = useState([]);
  const [datasetName, setDatasetName] = useState(initialDataset);
  const [manualDataset, setManualDataset] = useState("");
  const [reason, setReason] = useState("");
  const [accessType, setAccessType] = useState("read");
  const [duration, setDuration] = useState("30_days");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDatasetName(initialDataset);
  }, [initialDataset]);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      try {
        const res = await enterpriseGovernanceDatasets({ page: 1, page_size: 200 });
        const items = Array.isArray(res?.data?.items) ? res.data.items : [];
        const names = [...new Set(items.map((r) => r.name).filter(Boolean))].sort();
        if (on) setDatasetOptions(names);
      } catch {
        if (on) setDatasetOptions([]);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  const effectiveDataset = datasetOptions.length ? datasetName.trim() : manualDataset.trim();

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!effectiveDataset) {
      setErr(datasetOptions.length ? "Select a dataset." : "Enter a dataset name.");
      return;
    }
    if (!reason.trim()) {
      setErr("Describe the business purpose.");
      return;
    }
    try {
      await enterpriseBusinessDataRequestCreate({
        reason: reason.trim(),
        dataset_name: effectiveDataset,
        access_type: accessType,
        duration,
        department: null,
      });
      onSubmitted?.();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Submit failed");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-[#2a3f63] bg-[#0f1b31] p-5 shadow-xl"
        role="dialog"
        aria-labelledby="dar-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 id="dar-title" className="enterprise-title text-base">
            Request data access
          </h2>
          <button type="button" className="rounded p-1 text-[#9ab0d1] hover:bg-[#1a2844]" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <p className="mb-4 text-xs text-[#7f95b6]">Sent to the data owner for review. You will be notified when it is approved.</p>
        {err ? <p className="mb-3 text-xs text-red-400">{err}</p> : null}
        <form className="space-y-4 text-sm" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-xs text-[#7f95b6]">Dataset</label>
            {loading ? (
              <p className="text-xs text-[#7f95b6]">Loading catalog…</p>
            ) : datasetOptions.length ? (
              <select
                required
                className="w-full rounded border border-[#2a3f63] bg-[#0a1220] px-3 py-2 text-[#d7e3f7]"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
              >
                <option value="">Select dataset…</option>
                {datasetOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="w-full rounded border border-[#2a3f63] bg-[#0a1220] px-3 py-2 text-[#d7e3f7]"
                placeholder="Dataset name"
                value={manualDataset}
                onChange={(e) => setManualDataset(e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#7f95b6]">Business purpose</label>
            <textarea
              required
              className="min-h-[88px] w-full rounded border border-[#2a3f63] bg-[#0a1220] px-3 py-2 text-[#d7e3f7]"
              placeholder="Describe why you need access"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#7f95b6]">Access type</label>
            <select
              className="w-full rounded border border-[#2a3f63] bg-[#0a1220] px-3 py-2 text-[#d7e3f7]"
              value={accessType}
              onChange={(e) => setAccessType(e.target.value)}
            >
              <option value="read">Read</option>
              <option value="read_export">Read/Export</option>
              <option value="write">Write</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#7f95b6]">Duration</label>
            <select
              className="w-full rounded border border-[#2a3f63] bg-[#0a1220] px-3 py-2 text-[#d7e3f7]"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            >
              {DURATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button type="submit" className="rounded bg-[#2b7fff] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white">
              Submit request
            </button>
            <button
              type="button"
              className="rounded border border-[#2a3f63] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#d7e3f7]"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { enterpriseBusinessDataRequestCreate, enterpriseGovernanceDatasets } from "../../enterpriseApi";
import { AppModal, modalInputClass, modalLabelClass } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const DURATION_OPTIONS = [
  { value: "7_days", label: "7 days" },
  { value: "30_days", label: "30 days" },
  { value: "90_days", label: "90 days" },
  { value: "180_days", label: "180 days" },
  { value: "ongoing", label: "Ongoing" },
];

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
      window.dispatchEvent(new CustomEvent("mdqm-notifications-refresh"));
      window.dispatchEvent(new CustomEvent("mdqm-owner-access-refresh"));
      onSubmitted?.();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Submit failed");
    }
  };

  return (
    <AppModal
      open
      onClose={onClose}
      title="Request data access"
      description="Sent to the data owner for review. You will be notified when it is approved."
      maxWidth="max-w-md"
      showDefaultFooter={false}
      footer={
        <div className="flex flex-wrap gap-2">
          <Button type="submit" form="dar-form" className="text-xs uppercase tracking-wide">
            Submit request
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="text-xs uppercase tracking-wide">
            Cancel
          </Button>
        </div>
      }
    >
      {err ? <p className="mb-3 text-xs text-destructive">{err}</p> : null}
      <form id="dar-form" className="space-y-4" onSubmit={submit}>
        <div>
          <label className={modalLabelClass}>Dataset</label>
          {loading ? (
            <p className="mt-1 text-xs text-muted-foreground">Loading catalog…</p>
          ) : datasetOptions.length ? (
            <Select required className="mt-1" value={datasetName} onChange={(e) => setDatasetName(e.target.value)}>
              <option value="">Select dataset…</option>
              {datasetOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          ) : (
            <input
              className={cn(modalInputClass, "mt-1")}
              placeholder="Dataset name"
              value={manualDataset}
              onChange={(e) => setManualDataset(e.target.value)}
            />
          )}
        </div>
        <div>
          <label className={modalLabelClass}>Business purpose</label>
          <textarea
            required
            className={cn(modalInputClass, "mt-1 min-h-[88px] resize-y")}
            placeholder="Describe why you need access"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div>
          <label className={modalLabelClass}>Access type</label>
          <Select className="mt-1" value={accessType} onChange={(e) => setAccessType(e.target.value)}>
            <option value="read">Read</option>
            <option value="read_export">Read/Export</option>
            <option value="write">Write</option>
          </Select>
        </div>
        <div>
          <label className={modalLabelClass}>Duration</label>
          <Select className="mt-1" value={duration} onChange={(e) => setDuration(e.target.value)}>
            {DURATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </form>
    </AppModal>
  );
}

import { useState } from "react";
import { AppModal, modalInputClass, modalLabelClass } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createNewJob, deleteJob } from "../../../api";
import { enterpriseGovernanceDatasetCreate } from "../enterpriseApi";

/** Create dataset with name + description only. */
export default function CreateDatasetLightModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setName("");
    setDescription("");
    setError("");
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  function formatAxiosDetail(data) {
    const d = data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join("; ") || "Request failed.";
    if (d && typeof d === "object") return d.msg || JSON.stringify(d);
    return "";
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setError("Enter a dataset name.");
      return;
    }
    setBusy(true);
    setError("");
    let jobId = null;
    try {
      const { data } = await createNewJob(n);
      jobId = data?.job_id;
      if (!jobId) throw new Error("Could not create job.");
      try {
        await enterpriseGovernanceDatasetCreate({
          name: n,
          domain: null,
          classification: "manual",
          description: description.trim() || null,
          job_id: Number(jobId),
        });
      } catch {
        /* duplicate name or governance optional */
      }
      onCreated?.();
      handleClose();
    } catch (err) {
      if (jobId) {
        try {
          await deleteJob(jobId);
        } catch {
          /* best-effort */
        }
      }
      setError(formatAxiosDetail(err?.response?.data) || err?.message || "Create failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title="Create dataset"
      description="Enter a name and optional description. Details are stored with creator and timestamps."
      maxWidth="max-w-lg"
      showDefaultFooter={false}
      bodyClassName="overflow-y-auto max-h-[calc(90vh-8rem)]"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className={modalLabelClass}>Dataset name</label>
          <input
            className={modalInputClass}
            placeholder="e.g. CUSTOMER_MASTER"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className={modalLabelClass}>Description</label>
          <textarea
            className={cn(modalInputClass, "min-h-[5rem] resize-y")}
            placeholder="Optional description for this dataset"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <Button type="submit" disabled={busy} className="w-full text-xs font-bold uppercase tracking-wide">
          {busy ? "Creating…" : "Create dataset"}
        </Button>
      </form>
    </AppModal>
  );
}

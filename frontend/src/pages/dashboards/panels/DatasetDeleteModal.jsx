import { useState } from "react";
import { AppModal, ModalAlert } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import { enterpriseGovernanceDatasetDelete } from "../enterpriseApi";

const DEFAULT_RETENTION_DAYS = 7;

export default function DatasetDeleteModal({
  open,
  onClose,
  datasetId,
  datasetName,
  retentionDays = DEFAULT_RETENTION_DAYS,
  onDeleted,
}) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const handleClose = () => {
    if (busy) return;
    setErr("");
    onClose?.();
  };

  const handleDelete = async (mode) => {
    if (datasetId == null) return;
    setBusy(mode);
    setErr("");
    try {
      await enterpriseGovernanceDatasetDelete(datasetId, { mode });
      onDeleted?.({ mode, datasetId, datasetName });
      handleClose();
    } catch (e) {
      const detail = e?.response?.data?.detail;
      setErr(typeof detail === "string" ? detail : e?.message || "Delete failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title="Delete dataset"
      description={
        datasetName
          ? `Choose how to remove “${datasetName}” from your catalog.`
          : "Choose how to remove this dataset from your catalog."
      }
      maxWidth="max-w-lg"
      footer={null}
    >
      <div className="space-y-4">
        {err ? <ModalAlert variant="danger">{err}</ModalAlert> : null}

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-semibold text-foreground">Move to recycle bin</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The dataset is hidden from the catalog but kept for {retentionDays} days. After that it is deleted
            permanently automatically. You can restore it from the recycle bin before then.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full text-xs uppercase tracking-wide"
            disabled={Boolean(busy)}
            onClick={() => handleDelete("recycle")}
          >
            {busy === "recycle" ? "Moving…" : "Confirm — move to recycle bin"}
          </Button>
        </div>

        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">Delete permanently</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Removes the catalog entry and all linked job data immediately. This cannot be undone.
          </p>
          <Button
            type="button"
            variant="destructive"
            className="mt-3 w-full text-xs uppercase tracking-wide"
            disabled={Boolean(busy)}
            onClick={() => handleDelete("permanent")}
          >
            {busy === "permanent" ? "Deleting…" : "Confirm — delete permanently"}
          </Button>
        </div>

        <Button type="button" variant="ghost" className="w-full" disabled={Boolean(busy)} onClick={handleClose}>
          Cancel
        </Button>
      </div>
    </AppModal>
  );
}

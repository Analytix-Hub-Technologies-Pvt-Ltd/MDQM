import { useEffect, useState } from "react";
import { AppModal, ModalAlert, modalInputClass, modalLabelClass } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import {
  enterpriseStewardshipAssignees,
  enterpriseStewardshipCreate,
  enterpriseStewardshipUpdate,
  notifyStewardshipRefresh,
} from "@/pages/dashboards/enterpriseApi";
import {
  TASK_CREATE_STATUS_OPTIONS,
  TASK_SEVERITY_OPTIONS,
  TASK_STATUS_OPTIONS,
} from "./stewardshipConstants";

const emptyCreateForm = {
  dataset_name: "",
  severity: "medium",
  status: "open",
  assigned_to_user_id: "",
};

export default function StewardshipTaskFormModal({ open, mode = "create", task = null, onClose, onSaved }) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState(emptyCreateForm);
  const [assignees, setAssignees] = useState([]);
  const [loadingAssignees, setLoadingAssignees] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (isEdit && task) {
      setForm({
        dataset_name: task.dataset_name || "",
        severity: task.severity || "medium",
        status: task.status || "open",
        assigned_to_user_id: task.assigned_to_user_id != null ? String(task.assigned_to_user_id) : "",
      });
    } else {
      setForm(emptyCreateForm);
    }
  }, [open, isEdit, task]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoadingAssignees(true);
    enterpriseStewardshipAssignees()
      .then((res) => {
        if (active) setAssignees(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (active) setAssignees([]);
      })
      .finally(() => {
        if (active) setLoadingAssignees(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const dataset = form.dataset_name.trim();
    if (!dataset) {
      setError("Dataset name is required.");
      return;
    }
    setBusy(true);
    try {
      const assignee =
        form.assigned_to_user_id === "" ? null : parseInt(form.assigned_to_user_id, 10);
      if (isEdit && task?.id != null) {
        await enterpriseStewardshipUpdate(task.id, {
          status: form.status,
          severity: form.severity,
          assigned_to_user_id: assignee,
        });
      } else {
        await enterpriseStewardshipCreate({
          dataset_name: dataset,
          severity: form.severity,
          status: form.status,
          assigned_to_user_id: assignee,
        });
      }
      notifyStewardshipRefresh();
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Could not save task");
    } finally {
      setBusy(false);
    }
  };

  const statusOptions = isEdit ? TASK_STATUS_OPTIONS : TASK_CREATE_STATUS_OPTIONS;

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={isEdit ? "Update stewardship task" : "New stewardship task"}
      description={
        isEdit
          ? "Change status, severity, or assignee for this remediation task."
          : "Log a new data quality remediation task for the stewardship queue."
      }
      maxWidth="max-w-lg"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="stewardship-task-form" disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create task"}
          </Button>
        </div>
      }
      showDefaultFooter={false}
    >
      <form id="stewardship-task-form" onSubmit={handleSubmit} className="space-y-4">
        {error ? <ModalAlert variant="danger">{error}</ModalAlert> : null}

        <label className="block">
          <span className={modalLabelClass}>Dataset name</span>
          <input
            className={modalInputClass}
            value={form.dataset_name}
            onChange={(e) => setForm((p) => ({ ...p, dataset_name: e.target.value }))}
            placeholder="e.g. CUSTOMER_MASTER"
            required
            disabled={isEdit}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className={modalLabelClass}>Severity</span>
            <select
              className={modalInputClass}
              value={form.severity}
              onChange={(e) => setForm((p) => ({ ...p, severity: e.target.value }))}
            >
              {TASK_SEVERITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={modalLabelClass}>Status</span>
            <select
              className={modalInputClass}
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className={modalLabelClass}>Assign to</span>
          <select
            className={modalInputClass}
            value={form.assigned_to_user_id}
            onChange={(e) => setForm((p) => ({ ...p, assigned_to_user_id: e.target.value }))}
            disabled={loadingAssignees}
          >
            <option value="">Unassigned</option>
            {assignees.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
                {u.role ? ` (${String(u.role).replace(/_/g, " ")})` : ""}
              </option>
            ))}
          </select>
        </label>
      </form>
    </AppModal>
  );
}

import { useEffect, useMemo, useState } from "react";
import { AppModal, ModalAlert, modalInputClass, modalLabelClass } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import {
  deleteSchedule,
  getScheduleByJobId,
  pauseSchedule,
  resumeSchedule,
  scheduleJob,
} from "../../../api";

function formatAxiosDetail(data) {
  if (!data) return "";
  if (typeof data === "string") return data;
  if (data.detail) return typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
  return "";
}

/**
 * Schedule automatic re-import from Postgres for a linked job (action=refresh).
 */
export default function DatasetRefreshScheduleModal({ open, jobId, datasetName, onClose, onSaved }) {
  const [scheduleType, setScheduleType] = useState("daily");
  const [scheduleTime, setScheduleTime] = useState("02:00");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleDay, setScheduleDay] = useState("0");
  const [hourInterval, setHourInterval] = useState(1);
  const [existing, setExisting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const todayLocal = useMemo(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  useEffect(() => {
    if (!open || !jobId) {
      setExisting(null);
      setError("");
      setSuccess("");
      return;
    }
    setSuccess("");
    let cancelled = false;
    (async () => {
      try {
        const res = await getScheduleByJobId(jobId, "refresh");
        if (!cancelled) setExisting(res?.data ?? null);
      } catch {
        if (!cancelled) setExisting(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, jobId]);

  useEffect(() => {
    if (open && scheduleType === "once" && !scheduleDate) {
      setScheduleDate(todayLocal);
    }
  }, [open, scheduleType, scheduleDate, todayLocal]);

  const buildPayload = () => {
    const payload = {
      type: scheduleType,
      action: "refresh",
      time: scheduleTime || "02:00",
      day: scheduleDay || "0",
      interval: Number(hourInterval || 1),
    };
    if (scheduleType === "once") payload.date = scheduleDate;
    if (scheduleType === "monthly") payload.date = scheduleDate || "1";
    return payload;
  };

  const handleSave = async () => {
    if (!jobId) return;
    if (scheduleType === "once" && !scheduleDate) {
      setError("Pick a date for the one-time schedule.");
      setSuccess("");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await scheduleJob(jobId, buildPayload());
      const res = await getScheduleByJobId(jobId, "refresh");
      const saved = res?.data ?? null;
      setExisting(saved);
      if (!saved?.next_run_time && !saved?.paused) {
        setError(
          "Schedule was not activated. For a one-time run, choose a date and time in the future."
        );
        return;
      }
      setSuccess(
        saved?.next_run_time
          ? `Schedule saved. Next run: ${new Date(saved.next_run_time).toLocaleString()}`
          : "Schedule saved."
      );
      onSaved?.();
    } catch (err) {
      setError(formatAxiosDetail(err?.response?.data) || err?.message || "Failed to save schedule.");
    } finally {
      setBusy(false);
    }
  };

  const handlePause = async () => {
    if (!jobId) return;
    setBusy(true);
    try {
      await pauseSchedule(jobId, "refresh");
      const res = await getScheduleByJobId(jobId, "refresh");
      setExisting(res?.data ?? null);
      onSaved?.();
    } catch (err) {
      setError(formatAxiosDetail(err?.response?.data) || err?.message || "Pause failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleResume = async () => {
    if (!jobId) return;
    setBusy(true);
    try {
      await resumeSchedule(jobId, "refresh");
      const res = await getScheduleByJobId(jobId, "refresh");
      setExisting(res?.data ?? null);
      onSaved?.();
    } catch (err) {
      setError(formatAxiosDetail(err?.response?.data) || err?.message || "Resume failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!jobId) return;
    if (!window.confirm("Remove automatic refresh schedule for this dataset?")) return;
    setBusy(true);
    try {
      await deleteSchedule(jobId, "refresh");
      setExisting(null);
      onSaved?.();
    } catch (err) {
      setError(formatAxiosDetail(err?.response?.data) || err?.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Schedule data refresh"
      description={
        datasetName
          ? `Automatic data refresh for “${datasetName}”.`
          : "Automatic data refresh on a timer."
      }
      maxWidth="max-w-md"
      showDefaultFooter={false}
    >
      <div className="space-y-4 text-sm">
        {existing?.next_run_time ? (
          <p className="text-xs text-muted-foreground rounded-lg border border-border bg-muted/30 p-3">
            <span className="font-semibold text-foreground">Active schedule</span>
            <br />
            Next run: {new Date(existing.next_run_time).toLocaleString()}
            <br />
            <span className="font-mono text-[11px]">{existing.trigger}</span>
            {existing.paused ? (
              <span className="block mt-1 text-amber-600">Paused</span>
            ) : null}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">No refresh schedule yet. Choose a cadence below.</p>
        )}

        <div>
          <label className={modalLabelClass}>Frequency</label>
          <select
            className={modalInputClass}
            value={scheduleType}
            onChange={(e) => setScheduleType(e.target.value)}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="hourly">Hourly</option>
            <option value="once">Once</option>
          </select>
        </div>

        {scheduleType === "once" ? (
          <input
            type="date"
            className={modalInputClass}
            value={scheduleDate}
            min={todayLocal}
            onChange={(e) => setScheduleDate(e.target.value)}
          />
        ) : null}

        {scheduleType === "weekly" ? (
          <select className={modalInputClass} value={scheduleDay} onChange={(e) => setScheduleDay(e.target.value)}>
            <option value="0">Monday</option>
            <option value="1">Tuesday</option>
            <option value="2">Wednesday</option>
            <option value="3">Thursday</option>
            <option value="4">Friday</option>
            <option value="5">Saturday</option>
            <option value="6">Sunday</option>
          </select>
        ) : null}

        {scheduleType === "hourly" ? (
          <input
            type="number"
            min={1}
            className={modalInputClass}
            value={hourInterval}
            onChange={(e) => setHourInterval(Number(e.target.value) || 1)}
            placeholder="Every N hours"
          />
        ) : (
          <input
            type="time"
            className={modalInputClass}
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
          />
        )}

        {success ? <ModalAlert variant="success">{success}</ModalAlert> : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <p className="text-[11px] text-muted-foreground">
          Schedules are stored in the database and restored when the API restarts.
        </p>

        <div className="flex flex-wrap gap-2 justify-end pt-1">
          {existing ? (
            <>
              {existing.paused ? (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={handleResume}>
                  Resume
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={handlePause}>
                  Pause
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={handleDelete}>
                Remove
              </Button>
            </>
          ) : null}
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={handleSave}>
            {busy ? "Saving…" : existing ? "Update" : "Save schedule"}
          </Button>
        </div>
      </div>
    </AppModal>
  );
}

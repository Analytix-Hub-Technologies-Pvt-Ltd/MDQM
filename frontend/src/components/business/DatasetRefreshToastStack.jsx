import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

function formatRunningDuration(startTime) {
  if (!startTime) return "0s";
  const start = new Date(startTime);
  const diffSec = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

const statusStyles = {
  running: {
    border: "border-sky-300/80 dark:border-sky-600/50",
    bg: "bg-sky-50/95 dark:bg-sky-950/90",
    icon: RefreshCw,
    iconClass: "text-sky-600 dark:text-sky-400 animate-spin",
  },
  completed: {
    border: "border-emerald-300/80 dark:border-emerald-600/50",
    bg: "bg-emerald-50/95 dark:bg-emerald-950/90",
    icon: CheckCircle2,
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  failed: {
    border: "border-rose-300/80 dark:border-rose-600/50",
    bg: "bg-rose-50/95 dark:bg-rose-950/90",
    icon: AlertTriangle,
    iconClass: "text-rose-600 dark:text-rose-400",
  },
};

/**
 * Fixed toast stack for dataset refresh (scheduled + manual) on the Data Owner desk.
 */
export default function DatasetRefreshToastStack({ toasts, onDismiss, tickMs = 1000 }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!toasts.some((t) => t.status === "running")) return undefined;
    const id = window.setInterval(() => setTick((n) => n + 1), tickMs);
    return () => window.clearInterval(id);
  }, [toasts, tickMs]);

  if (!toasts.length) return null;

  return createPortal(
    <div
      className="fixed top-20 right-4 z-[110] flex w-[min(100vw-2rem,340px)] flex-col gap-2 pointer-events-none sm:right-6"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const style = statusStyles[toast.status] || statusStyles.completed;
        const Icon = style.icon;
        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm",
              "animate-in slide-in-from-right-4 fade-in duration-300",
              style.border,
              style.bg,
            )}
          >
            <div className="flex items-start gap-3">
              <Icon size={18} className={cn("mt-0.5 shrink-0", style.iconClass)} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-foreground truncate">
                  {toast.title}
                </p>
                {toast.subtitle ? (
                  <p className="mt-0.5 text-sm font-medium text-foreground/90 truncate">{toast.subtitle}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground leading-snug">{toast.message}</p>
                {toast.status === "running" && toast.startTime ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Elapsed: {formatRunningDuration(toast.startTime)}
                  </p>
                ) : null}
                {toast.nextRunTime ? (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock3 size={12} />
                    Next: {new Date(toast.nextRunTime).toLocaleString()}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onDismiss?.(toast.id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

export function buildRefreshToast({
  status,
  datasetName,
  jobId,
  source = "schedule",
  message,
  startTime,
  nextRunTime,
}) {
  const label = source === "manual" ? "Manual refresh" : "Scheduled refresh";
  const title =
    status === "running"
      ? `${label} started`
      : status === "completed"
        ? `${label} complete`
        : `${label} failed`;
  const defaultMessage =
    status === "running"
      ? "Pulling the latest data from the database…"
      : status === "completed"
        ? "Dataset snapshot and EDA cache were updated."
        : "Check the backend log or try Refresh now.";
  return {
    id: `refresh-${jobId}-${status}-${Date.now()}`,
    jobId,
    status,
    title,
    subtitle: datasetName || `Job ${jobId}`,
    message: message || defaultMessage,
    startTime: startTime || (status === "running" ? new Date().toISOString() : null),
    nextRunTime: nextRunTime || null,
  };
}

/** Human-readable relative time from ISO string or Date. */
export function formatRelativeTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 0) return formatUpcomingRelative(iso);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 14) return `${Math.floor(sec / 86400)}d ago`;
  return d.toISOString().slice(0, 10);
}

/** Locale date+time (e.g. next refresh, registered at). */
export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Relative label for a future ISO time. */
export function formatUpcomingRelative(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  const sec = Math.floor((d.getTime() - Date.now()) / 1000);
  if (sec < 0) return "overdue";
  if (sec < 60) return "in less than a minute";
  if (sec < 3600) return `in ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `in ${Math.floor(sec / 3600)}h`;
  if (sec < 86400 * 14) return `in ${Math.floor(sec / 86400)}d`;
  return formatDateTime(iso);
}

export function formatAccessType(v) {
  const s = String(v || "read").toLowerCase();
  if (s === "write") return "Write";
  if (s === "read_export" || s === "read/export") return "Read/Export";
  return "Read";
}

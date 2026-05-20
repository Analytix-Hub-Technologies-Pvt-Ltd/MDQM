/** Human-readable relative time from ISO string or Date. */
export function formatRelativeTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 14) return `${Math.floor(sec / 86400)}d ago`;
  return d.toISOString().slice(0, 10);
}

export function formatAccessType(v) {
  const s = String(v || "read").toLowerCase();
  if (s === "write") return "Write";
  if (s === "read_export" || s === "read/export") return "Read/Export";
  return "Read";
}

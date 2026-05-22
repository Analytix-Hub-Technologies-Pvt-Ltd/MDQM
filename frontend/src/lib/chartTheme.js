/** Recharts / Chart.js theme helpers tied to CSS variables */

export function getChartColors() {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const read = (name, fallback) => {
    if (!root) return fallback;
    const v = getComputedStyle(root).getPropertyValue(name).trim();
    return v || fallback;
  };

  return {
    primary: read("--primary", "#6366f1"),
    secondary: read("--secondary", "#22d3ee"),
    accent: read("--accent", "#a78bfa"),
    muted: read("--muted-foreground", "#94a3b8"),
    border: read("--border", "#334155"),
    card: read("--card", "#111827"),
    foreground: read("--foreground", "#f8fafc"),
    success: read("--success", "#10b981"),
    warning: read("--warning", "#f59e0b"),
    destructive: read("--destructive", "#ef4444"),
  };
}

export function scoreTone(value) {
  const n = Number(value) || 0;
  if (n >= 90) return "success";
  if (n >= 70) return "warning";
  return "destructive";
}

export function scoreColor(value) {
  const tone = scoreTone(value);
  const c = getChartColors();
  if (tone === "success") return c.success;
  if (tone === "warning") return c.warning;
  return c.destructive;
}

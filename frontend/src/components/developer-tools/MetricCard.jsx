import { cn } from "@/lib/utils";

export default function MetricCard({ label, value, sub, icon: Icon, tone = "default", className }) {
  const toneCls =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "danger"
          ? "text-red-600 dark:text-red-400"
          : tone === "info"
            ? "text-primary"
            : "text-foreground";

  return (
    <div className={cn("enterprise-card flex items-start gap-3 p-4", className)}>
      {Icon ? <Icon className={cn("mt-0.5 h-8 w-8 shrink-0", toneCls)} strokeWidth={1.25} /> : null}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-semibold tabular-nums", toneCls)}>{value}</p>
        {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  );
}

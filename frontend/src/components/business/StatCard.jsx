export default function StatCard({ label, value, sub, icon: Icon, tone = "default" }) {
  const toneCls =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "danger"
          ? "text-red-600 dark:text-red-400"
          : "text-foreground";
  return (
    <div className="enterprise-card flex items-start gap-3 p-4">
      {Icon ? <Icon className={`mt-0.5 h-8 w-8 shrink-0 ${toneCls}`} strokeWidth={1.25} /> : null}
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold ${toneCls}`}>{value}</p>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  );
}

export default function StatCard({ label, value, sub, icon: Icon, tone = "default" }) {
  const toneCls =
    tone === "success" ? "text-emerald-400" : tone === "warning" ? "text-amber-400" : tone === "danger" ? "text-red-400" : "text-[#d7e3f7]";
  return (
    <div className="enterprise-card flex items-start gap-3 p-4">
      {Icon ? <Icon className={`mt-0.5 h-8 w-8 shrink-0 ${toneCls}`} strokeWidth={1.25} /> : null}
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#7f95b6]">{label}</p>
        <p className={`text-2xl font-semibold ${toneCls}`}>{value}</p>
        {sub ? <p className="text-xs text-[#5c6d8a]">{sub}</p> : null}
      </div>
    </div>
  );
}

import { getChartColors } from "@/lib/chartTheme";

export default function RechartsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const colors = getChartColors();

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{
        background: colors.card,
        borderColor: colors.border,
        color: colors.foreground,
      }}
    >
      {label ? <p className="mb-1 font-medium text-muted-foreground">{label}</p> : null}
      {payload.map((entry) => (
        <p key={entry.dataKey} className="font-semibold" style={{ color: entry.color || colors.primary }}>
          {entry.name}: {typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value}
          {entry.unit || (typeof entry.value === "number" && entry.value <= 100 ? "%" : "")}
        </p>
      ))}
    </div>
  );
}

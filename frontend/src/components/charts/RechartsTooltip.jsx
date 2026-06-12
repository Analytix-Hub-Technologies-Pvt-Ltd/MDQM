import { getChartColors } from "@/lib/chartTheme";

function formatTooltipValue(value, { integerKeys, valueUnit, dataKey }) {
  if (typeof value !== "number" || Number.isNaN(value)) return value ?? "—";
  const asInteger = integerKeys?.has(dataKey) || Number.isInteger(value);
  const formatted = asInteger ? String(Math.round(value)) : value.toFixed(2);
  return valueUnit ? `${formatted}${valueUnit}` : formatted;
}

export default function RechartsTooltip({
  active,
  payload,
  label,
  valueUnit = "",
  integerKeys,
}) {
  if (!active || !payload?.length) return null;
  const colors = getChartColors();
  const intKeySet = integerKeys instanceof Set ? integerKeys : integerKeys ? new Set(integerKeys) : null;

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
          {entry.name}:{" "}
          {formatTooltipValue(entry.value, {
            integerKeys: intKeySet,
            valueUnit: entry.unit ?? valueUnit,
            dataKey: entry.dataKey,
          })}
        </p>
      ))}
    </div>
  );
}

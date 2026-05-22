import KpiMetricCard from "@/components/dashboard/KpiMetricCard";

export default function KPIWidget({ title, value, subtitle, tone = "default" }) {
  const toneMap = {
    success: "success",
    warning: "warning",
    danger: "danger",
    default: "default",
  };

  return (
    <KpiMetricCard
      title={title}
      value={value}
      subtitle={subtitle}
      tone={toneMap[tone] || "default"}
    />
  );
}

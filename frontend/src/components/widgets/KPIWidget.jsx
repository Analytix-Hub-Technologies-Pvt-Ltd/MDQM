export default function KPIWidget({ title, value, subtitle, tone = "default" }) {
  const toneClass =
    tone === "success"
      ? "border-green-500/35 bg-[#0f1b31]"
      : tone === "warning"
        ? "border-amber-500/35 bg-[#0f1b31]"
        : tone === "danger"
          ? "border-red-500/35 bg-[#0f1b31]"
          : "border-[#22324f] bg-[#0f1b31]";

  const valueClass =
    tone === "success"
      ? "text-green-300"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "danger"
          ? "text-red-300"
          : "text-[#d7e3f7]";

  return (
    <article className={`border p-4 rounded-md shadow-[0_10px_24px_rgba(2,8,20,0.28)] ${toneClass}`}>
      <p className="text-xs tracking-widest uppercase text-[#9ab0d1]">{title}</p>
      <p className={`text-3xl mt-2 font-semibold ${valueClass}`}>{value}</p>
      {subtitle ? <p className="text-xs mt-1 text-[#7f95b6]">{subtitle}</p> : null}
    </article>
  );
}

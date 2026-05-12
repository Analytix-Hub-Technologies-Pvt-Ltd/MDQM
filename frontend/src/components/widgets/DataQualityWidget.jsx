export default function DataQualityWidget({ metrics = {} }) {
  const items = [
    ["Completeness", metrics.completeness],
    ["Accuracy", metrics.accuracy],
    ["Consistency", metrics.consistency],
    ["Uniqueness", metrics.uniqueness],
    ["Validity", metrics.validity],
    ["Timeliness", metrics.timeliness],
  ];
  return (
    <article className="enterprise-card p-4">
      <h3 className="enterprise-title mb-3">Data Quality Dimensions</h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map(([name, value]) => (
          <div key={name} className="border border-[#22324f] p-2 rounded-sm bg-[#0f1b31]">
            <p className="text-[11px] uppercase tracking-wider text-[#7f95b6]">{name}</p>
            <p className="text-lg font-medium text-[#d7e3f7]">{Number(value || 0).toFixed(1)}%</p>
          </div>
        ))}
      </div>
    </article>
  );
}

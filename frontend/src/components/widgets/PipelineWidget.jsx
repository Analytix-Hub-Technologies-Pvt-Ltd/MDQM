export default function PipelineWidget({ pipelines = [] }) {
  const rows = pipelines.length
    ? pipelines
    : [
        { name: "Validation", status: "running" },
        { name: "Stewardship", status: "idle" },
      ];

  return (
    <article className="enterprise-card p-4">
      <h3 className="enterprise-title mb-3">Pipeline Status</h3>
      <div className="space-y-2">
        {rows.map((item, idx) => (
          <div key={`${item.name}-${idx}`} className="flex justify-between text-sm">
            <span className="text-[#d7e3f7]">{item.name}</span>
            <span className="uppercase text-xs tracking-wider text-[#7f95b6]">{item.status}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

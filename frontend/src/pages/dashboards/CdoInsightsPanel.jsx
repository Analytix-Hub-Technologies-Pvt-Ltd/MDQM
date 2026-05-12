const DOMAIN_HEALTH = [
  { domain: "Customer", score: 94, trend: "+1.4%" },
  { domain: "Finance", score: 79, trend: "-0.8%" },
  { domain: "Product", score: 88, trend: "+0.6%" },
  { domain: "Supplier", score: 72, trend: "-1.2%" },
];

export default function CdoInsightsPanel() {
  return (
    <section className="enterprise-card p-4">
      <h3 className="enterprise-title mb-3">Domain Health Portfolio</h3>
      <div className="space-y-3">
        {DOMAIN_HEALTH.map((item) => (
          <div key={item.domain} className="border border-[#233252] rounded-md p-3 bg-[#0f1b31]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-[#d7e3f7]">{item.domain}</span>
              <span className={`text-xs ${item.trend.startsWith("+") ? "text-green-400" : "text-amber-400"}`}>{item.trend}</span>
            </div>
            <div className="h-2 rounded bg-[#1d2b46]">
              <div className="h-2 rounded bg-[#4f8cff]" style={{ width: `${item.score}%` }} />
            </div>
            <div className="text-xs text-[#7f95b6] mt-1">Score: {item.score}%</div>
          </div>
        ))}
      </div>
    </section>
  );
}

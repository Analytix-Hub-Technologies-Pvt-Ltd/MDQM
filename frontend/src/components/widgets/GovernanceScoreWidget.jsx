export default function GovernanceScoreWidget({ score = 0 }) {
  const safe = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <article className="enterprise-card p-4">
      <h3 className="enterprise-title mb-3">Governance Score</h3>
      <p className="text-3xl font-semibold text-[#d7e3f7]">{safe.toFixed(1)}%</p>
      <div className="h-2 bg-[#1d2b46] mt-3 rounded">
        <div className="h-2 bg-[#8b5cf6] rounded" style={{ width: `${safe}%` }} />
      </div>
    </article>
  );
}

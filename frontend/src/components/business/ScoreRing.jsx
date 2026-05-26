export function scoreColor(score) {
  const s = Number(score) || 0;
  if (s >= 95) return "#4ade80";
  if (s >= 85) return "#2dd4bf";
  if (s >= 70) return "#f59e0b";
  return "#f87171";
}

export default function ScoreRing({ score, size = 40 }) {
  const s = Math.min(100, Math.max(0, Number(score) || 0));
  const c = scoreColor(s);
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (s / 100) * circ;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={c}
        strokeWidth={4}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill={c} fontSize={size < 40 ? 9 : 11} fontWeight={700}>
        {Math.round(s)}
      </text>
    </svg>
  );
}

import { scoreColor } from "./ScoreRing";

export default function PassBar({ value, threshold = 90 }) {
  const v = Number(value) || 0;
  const c = v >= threshold ? "#4ade80" : v >= threshold - 10 ? "#f59e0b" : scoreColor(v);
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="h-1.5 flex-1 rounded-full bg-[#1e2d47] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, v)}%`, background: c }} />
      </div>
      <span className="text-[10px] font-mono text-[#9ab0d1] w-8 text-right">{v}%</span>
    </div>
  );
}

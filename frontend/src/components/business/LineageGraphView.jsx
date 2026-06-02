import { useMemo } from "react";

const TYPE_COLORS = {
  source: "#2dd4bf",
  dataset: "#a78bfa",
  master: "#a78bfa",
  derived: "#f59e0b",
  consumer: "#3b82f6",
};

/**
 * Layered lineage graph with type colors and optional focus highlight.
 */
export default function LineageGraphView({ nodes = [], edges = [] }) {
  const layout = useMemo(() => {
    const positions = new Map();
    const byType = { source: [], dataset: [], master: [], derived: [], consumer: [] };
    nodes.forEach((n) => {
      const t = n.type || "dataset";
      (byType[t] || byType.dataset).push(n);
    });
    const lanes = [
      { types: ["source"], x: 40 },
      { types: ["dataset", "master"], x: 200 },
      { types: ["derived"], x: 380 },
      { types: ["consumer"], x: 540 },
    ];
    lanes.forEach((lane) => {
      const list = lane.types.flatMap((t) => byType[t] || []);
      list.forEach((n, i) => {
        const id = n.id ?? n.key;
        positions.set(id, { x: lane.x, y: 48 + i * 76 });
      });
    });
    let i = 0;
    nodes.forEach((n) => {
      const id = n.id ?? n.key;
      if (!positions.has(id)) {
        const col = i % 4;
        const row = Math.floor(i / 4);
        positions.set(id, { x: 40 + col * 140, y: 40 + row * 72 });
        i += 1;
      }
    });
    const lines = edges
      .map((e) => {
        const fk = e.from ?? e.from_node_id;
        const tk = e.to ?? e.to_node_id;
        const p1 = positions.get(fk);
        const p2 = positions.get(tk);
        if (!p1 || !p2) return null;
        return { x1: p1.x + 110, y1: p1.y + 22, x2: p2.x, y2: p2.y + 22 };
      })
      .filter(Boolean);
    const maxY = Math.max(200, ...[...positions.values()].map((p) => p.y + 60));
    const width = 680;
    return { positions, lines, width, height: maxY + 40 };
  }, [nodes, edges]);

  if (!nodes.length) {
    return <p className="text-sm text-[#7f95b6]">No lineage nodes for this view. Ask an admin to seed lineage from Governance.</p>;
  }

  return (
    <div className="overflow-auto rounded border border-[#22324f] bg-[#0a1220] p-2">
      <svg width={layout.width} height={layout.height} className="min-w-full">
        {layout.lines.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#3b82f6" strokeWidth={1.2} opacity={0.45} markerEnd="url(#arrow)" />
        ))}
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#3b82f6" opacity={0.5} />
          </marker>
        </defs>
        {nodes.map((n, ni) => {
          const id = n.id ?? n.key ?? `node-${ni}`;
          const p = layout.positions.get(id) || { x: 0, y: 0 };
          const c = TYPE_COLORS[n.type] || TYPE_COLORS.dataset;
          const hi = n.highlight;
          return (
            <g key={`${String(id)}-${ni}`} transform={`translate(${p.x},${p.y})`}>
              <rect
                width={110}
                height={44}
                rx={6}
                fill={hi ? `${c}44` : `${c}22`}
                stroke={c}
                strokeWidth={hi ? 2 : 1}
              />
              <text x={8} y={18} fill={c} fontSize={10} fontWeight={hi ? 700 : 600}>
                {(n.label || n.key || "node").slice(0, 16)}
              </text>
              <text x={8} y={32} fill="#5c6d8a" fontSize={9}>
                {n.type || "—"}
              </text>
            </g>
          );
        })}
        {Object.entries(TYPE_COLORS).map(([type, c], i) => (
          <g key={type} transform={`translate(${16 + i * 120}, ${layout.height - 22})`}>
            <rect width={10} height={10} rx={2} fill={`${c}33`} stroke={c} strokeWidth={0.8} />
            <text x={14} y={9} fontSize={9} fill="#7f95b6">
              {type}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

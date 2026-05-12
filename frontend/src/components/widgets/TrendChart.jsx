import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function TrendChart({ title, data = [] }) {
  const rows = Array.isArray(data) && data.length ? data : [{ label: "N/A", value: 0 }];
  return (
    <article className="enterprise-card p-4">
      <h3 className="enterprise-title mb-3">{title}</h3>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <XAxis dataKey="label" hide />
            <YAxis hide domain={[0, 100]} />
            <Tooltip contentStyle={{ background: "#0f1b31", border: "1px solid #2a3f63", borderRadius: "8px", color: "#d7e3f7" }} />
            <Line type="monotone" dataKey="value" stroke="#4f8cff" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function TrendChart({ title, data = [] }) {
  const rows = Array.isArray(data) && data.length ? data : [{ label: "N/A", value: 0 }];
  const [chartType, setChartType] = useState("line");

  const tooltipStyle = useMemo(
    () => ({
      background: "#0f1b31",
      border: "1px solid #2a3f63",
      borderRadius: "8px",
      color: "#d7e3f7",
    }),
    [],
  );

  const commonChart = useMemo(
    () => (
      <>
        <CartesianGrid stroke="#22324f" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#7f95b6", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fill: "#7f95b6", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
      </>
    ),
    [tooltipStyle],
  );
  return (
    <article className="enterprise-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="enterprise-title">{title}</h3>
        <div className="inline-flex rounded-md border border-[#2a3f63] bg-[#0f1b31] p-0.5">
          {["line", "area", "bar"].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setChartType(type)}
              className={`px-2.5 py-1 text-[10px] uppercase tracking-wider rounded ${
                chartType === type ? "bg-[#4f8cff] text-white" : "text-[#9ab0d1] hover:bg-[#14253f]"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "bar" ? (
            <BarChart data={rows}>
              {commonChart}
              <Bar dataKey="value" fill="#4f8cff" radius={[6, 6, 0, 0]} />
            </BarChart>
          ) : chartType === "area" ? (
            <AreaChart data={rows}>
              {commonChart}
              <Area type="monotone" dataKey="value" stroke="#4f8cff" fill="#4f8cff33" strokeWidth={2} />
            </AreaChart>
          ) : (
            <LineChart data={rows}>
              {commonChart}
              <Line type="monotone" dataKey="value" stroke="#4f8cff" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </article>
  );
}

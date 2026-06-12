import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import RechartsTooltip from "@/components/charts/RechartsTooltip";
import { getChartColors } from "@/lib/chartTheme";
import { cn } from "@/lib/utils";

export default function TrendChart({ title, data = [] }) {
  const rows = Array.isArray(data) && data.length ? data : [{ label: "N/A", value: 0 }];
  const [chartType, setChartType] = useState("line");
  const colors = useMemo(() => getChartColors(), []);

  const gridStroke = colors.border + "80";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </CardTitle>
        <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
          {["line", "area", "bar"].map((type) => (
            <Button
              key={type}
              type="button"
              variant={chartType === type ? "default" : "ghost"}
              size="sm"
              className={cn("h-7 px-2 text-[10px] uppercase", chartType !== type && "text-muted-foreground")}
              onClick={() => setChartType(type)}
            >
              {type}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "bar" ? (
              <BarChart data={rows}>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: colors.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: colors.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<RechartsTooltip valueUnit="%" />} />
                <Bar dataKey="value" name="Score" fill={colors.primary} radius={[6, 6, 0, 0]} />
              </BarChart>
            ) : chartType === "area" ? (
              <AreaChart data={rows}>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: colors.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: colors.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<RechartsTooltip valueUnit="%" />} />
                <Area type="monotone" dataKey="value" name="Score" stroke={colors.primary} fill={colors.primary + "33"} strokeWidth={2} />
              </AreaChart>
            ) : (
              <LineChart data={rows}>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: colors.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: colors.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<RechartsTooltip valueUnit="%" />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Score"
                  stroke={colors.primary}
                  strokeWidth={2.5}
                  dot={{ r: 2, fill: colors.primary }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

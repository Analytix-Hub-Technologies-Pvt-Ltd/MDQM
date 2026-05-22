import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function PipelineWidget({ pipelines = [] }) {
  const rows = pipelines.length
    ? pipelines
    : [
        { name: "Validation", status: "running" },
        { name: "Stewardship", status: "idle" },
      ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Pipeline status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {rows.map((item, idx) => (
          <div key={`${item.name}-${idx}`} className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">{item.name}</span>
            <Badge variant="outline" className="uppercase text-[10px]">
              {item.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

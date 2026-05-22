import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DataQualityWidget({ metrics = {} }) {
  const items = [
    ["Completeness", metrics.completeness],
    ["Accuracy", metrics.accuracy],
    ["Consistency", metrics.consistency],
    ["Uniqueness", metrics.uniqueness],
    ["Validity", metrics.validity],
    ["Timeliness", metrics.timeliness],
  ];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Data quality dimensions
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-2">
          {items.map(([name, value]) => (
            <div key={name} className="rounded-lg border border-border bg-muted/40 p-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{name}</p>
              <p className="text-lg font-semibold text-foreground">{Number(value || 0).toFixed(1)}%</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

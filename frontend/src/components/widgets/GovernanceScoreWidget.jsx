import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function GovernanceScoreWidget({ score = 0 }) {
  const safe = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Governance score
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-3xl font-semibold text-foreground">{safe.toFixed(1)}%</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${safe}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

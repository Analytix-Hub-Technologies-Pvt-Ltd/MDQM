import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuditWidget({ entries = [] }) {
  const rows = entries.slice(0, 5);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Recent audit activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {rows.length ? (
          rows.map((entry, idx) => (
            <div key={`${entry.action || "action"}-${idx}`} className="border-b border-border pb-2 last:border-0">
              <div className="text-sm font-medium text-foreground">{entry.action || "Action"}</div>
              <div className="text-xs text-muted-foreground">{entry.created_at || "Unknown time"}</div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No audit events available.</p>
        )}
      </CardContent>
    </Card>
  );
}

import { Activity, ClipboardList, FlaskConical, Gauge, Server } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const FUTURE_CAPABILITIES = [
  {
    id: "audit-logs",
    title: "Audit Logs",
    description: "Deep-linked audit trail explorer with filters and export.",
    icon: ClipboardList,
  },
  {
    id: "request-monitoring",
    title: "Request Monitoring",
    description: "Live API request stream, latency percentiles, and error rates.",
    icon: Activity,
  },
  {
    id: "api-testing",
    title: "API Testing",
    description: "In-browser request builder with auth headers and saved collections.",
    icon: FlaskConical,
  },
  {
    id: "job-monitoring",
    title: "Background Job Monitoring",
    description: "Scheduler runs, queue depth, and failure replay controls.",
    icon: Server,
  },
  {
    id: "performance",
    title: "Performance Metrics",
    description: "Throughput, p95 latency, and resource utilization dashboards.",
    icon: Gauge,
  },
];

export default function FutureCapabilitiesGrid() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Future capabilities</CardTitle>
        <CardDescription>
          Architecture is ready to plug in additional developer and operations tooling.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FUTURE_CAPABILITIES.map((cap) => (
            <div
              key={cap.id}
              className="rounded-xl border border-dashed border-border bg-muted/20 p-4 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-2">
                <cap.icon className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.5} />
                <Badge variant="outline" className="text-[10px]">
                  Planned
                </Badge>
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">{cap.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{cap.description}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

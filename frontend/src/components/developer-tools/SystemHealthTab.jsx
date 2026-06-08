import { Activity, CheckCircle2, RefreshCw, Server, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

function StatusRow({ label, value, ok, detail }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/20 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
        <Badge variant={ok ? "success" : "destructive"}>{value}</Badge>
      </div>
    </div>
  );
}

export default function SystemHealthTab({ health, loading, error, onRefresh }) {
  if (loading && !health) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  const backendOk = health?.backend?.reachable && health?.backend?.status === "ok";
  const openapiOk = health?.openapiReachable;
  const monitoring = health?.monitoring;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Last checked: {health?.checkedAt ? new Date(health.checkedAt).toLocaleString() : "—"}
        </p>
        {onRefresh ? (
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4 text-primary" />
              Platform status
            </CardTitle>
            <CardDescription>Core backend and API availability probes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <StatusRow
              label="Backend status"
              value={backendOk ? "Healthy" : "Unavailable"}
              ok={backendOk}
              detail={health?.backend?.status ? `Response: ${health.backend.status}` : "Could not reach /health"}
            />
            <StatusRow
              label="API availability"
              value={openapiOk ? "OpenAPI reachable" : "OpenAPI unreachable"}
              ok={openapiOk}
              detail="GET /openapi.json"
            />
            <StatusRow
              label="Environment"
              value={health?.environment || "unknown"}
              ok
              detail="Runtime mode from Vite"
            />
            <StatusRow
              label="Application version"
              value={health?.version || "—"}
              ok
              detail="Frontend build version"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Job monitoring
            </CardTitle>
            <CardDescription>Enterprise monitoring health (authenticated).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {monitoring ? (
              <>
                <StatusRow
                  label="Monitoring status"
                  value={monitoring.status || "ok"}
                  ok={monitoring.status !== "degraded" && monitoring.status !== "down"}
                />
                <StatusRow
                  label="Total jobs"
                  value={String(monitoring.jobs_total ?? "—")}
                  ok
                />
                <StatusRow
                  label="Failed jobs"
                  value={String(monitoring.jobs_failed ?? "—")}
                  ok={!monitoring.jobs_failed}
                />
                {monitoring.timestamp ? (
                  <p className="text-xs text-muted-foreground">
                    Server timestamp: {new Date(monitoring.timestamp).toLocaleString()}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                Monitoring endpoint unavailable. Showing basic health probes only.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

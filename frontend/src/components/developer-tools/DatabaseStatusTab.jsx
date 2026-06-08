import { Database, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function DatabaseStatusTab({ status, loading, error, onRefresh }) {
  if (loading && !status) {
    return <Skeleton className="h-40 rounded-xl" />;
  }

  const connected = status?.connected;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Last health check:{" "}
          {status?.lastHealthCheck ? new Date(status.lastHealthCheck).toLocaleString() : "—"}
        </p>
        {onRefresh ? (
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
            Re-check
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-primary" />
            Database monitoring
          </CardTitle>
          <CardDescription>Connection pool and metadata store health.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Connection status</p>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant={connected ? "success" : "destructive"}>
                  {connected ? "Connected" : "Disconnected"}
                </Badge>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Database type</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{status?.databaseType || "—"}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Data source</p>
              <p className="mt-2 text-lg font-semibold capitalize text-foreground">{status?.source || "—"}</p>
            </div>
          </div>

          {status?.connectionCount != null ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Registered connections: <span className="font-medium text-foreground">{status.connectionCount}</span>
            </p>
          ) : null}

          {status?.message ? (
            <p className="mt-3 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              {status.message}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

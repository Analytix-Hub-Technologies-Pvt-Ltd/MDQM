import { Globe, Lock, Plus, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { API_MODULES } from "@/utils/moduleMapper";
import MetricCard from "./MetricCard";
import SwaggerLinks from "./SwaggerLinks";
import FutureCapabilitiesGrid from "./FutureCapabilitiesGrid";

export default function DeveloperToolsOverviewTab({ info, metrics, loading, error, onExplore }) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-destructive">{error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Ensure the backend is running and OpenAPI is reachable at /openapi.json.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {info.title} · v{info.version}
          </p>
          {info.description ? (
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground line-clamp-2">{info.description}</p>
          ) : null}
        </div>
        <SwaggerLinks className="flex flex-wrap gap-2" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total APIs" value={metrics.total} icon={Globe} tone="info" />
        <MetricCard label="GET endpoints" value={metrics.getCount} icon={Search} />
        <MetricCard label="POST endpoints" value={metrics.postCount} icon={Plus} />
        <MetricCard label="Secured endpoints" value={metrics.securedCount} icon={Lock} tone="warning" />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Endpoints by module</CardTitle>
            <CardDescription>Auto-discovered from OpenAPI and grouped by platform domain.</CardDescription>
          </div>
          {onExplore ? (
            <button
              type="button"
              onClick={onExplore}
              className="text-xs font-medium text-primary hover:underline"
            >
              Open API Explorer →
            </button>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {API_MODULES.map((module) => (
              <div
                key={module}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2"
              >
                <span className="text-sm text-foreground">{module}</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-primary">
                  {metrics.byModule[module] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <FutureCapabilitiesGrid />
    </div>
  );
}

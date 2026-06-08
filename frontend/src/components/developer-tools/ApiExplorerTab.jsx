import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { API_MODULES } from "@/utils/moduleMapper";
import { useApiExplorer } from "@/hooks/useApiExplorer";
import ApiEndpointRow from "./ApiEndpointRow";
import SwaggerLinks from "./SwaggerLinks";

const METHOD_OPTIONS = ["all", "GET", "POST", "PUT", "DELETE"];

export default function ApiExplorerTab({ endpoints, loading, error, onRefresh }) {
  const {
    search,
    setSearch,
    moduleFilter,
    setModuleFilter,
    methodFilter,
    setMethodFilter,
    expandedId,
    toggleExpanded,
    filtered,
  } = useApiExplorer(endpoints);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {endpoints.length} endpoints
        </p>
        <div className="flex flex-wrap gap-2">
          <SwaggerLinks />
          {onRefresh ? (
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
              Refresh schema
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by path, summary, tag, or operation…"
            className="pl-9"
          />
        </div>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
        >
          <option value="all">All modules</option>
          {API_MODULES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
        >
          {METHOD_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m === "all" ? "All methods" : m}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No endpoints match your filters.
          </div>
        ) : (
          filtered.map((endpoint) => (
            <ApiEndpointRow
              key={endpoint.id}
              endpoint={endpoint}
              expanded={expandedId === endpoint.id}
              onToggle={() => toggleExpanded(endpoint.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

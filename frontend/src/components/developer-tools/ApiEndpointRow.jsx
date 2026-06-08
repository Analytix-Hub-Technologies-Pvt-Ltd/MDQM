import { ChevronDown, Lock, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import MethodBadge from "./MethodBadge";

export default function ApiEndpointRow({ endpoint, expanded, onToggle }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <MethodBadge method={endpoint.method} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="truncate font-mono text-sm text-foreground">{endpoint.path}</code>
            {endpoint.secured ? (
              <Badge variant="outline" className="gap-1">
                <Lock className="h-3 w-3" />
                Secured
              </Badge>
            ) : null}
            {endpoint.deprecated ? <Badge variant="warning">Deprecated</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
            {endpoint.summary || endpoint.name || "No summary"}
          </p>
          {endpoint.tags?.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {endpoint.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded ? (
        <div className="border-t border-border bg-muted/20 px-4 py-4 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Operation</dt>
              <dd className="mt-0.5 font-medium text-foreground">{endpoint.name}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Module</dt>
              <dd className="mt-0.5 font-medium text-foreground">{endpoint.module}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Summary</dt>
              <dd className="mt-0.5 text-foreground">{endpoint.summary || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{endpoint.description || "—"}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}

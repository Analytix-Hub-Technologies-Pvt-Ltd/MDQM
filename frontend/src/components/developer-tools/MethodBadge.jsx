import { cn } from "@/lib/utils";

const METHOD_STYLES = {
  GET: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-600/40 dark:bg-emerald-950/50 dark:text-emerald-200",
  POST: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-600/40 dark:bg-blue-950/50 dark:text-blue-200",
  PUT: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-600/40 dark:bg-amber-950/50 dark:text-amber-200",
  PATCH: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-600/40 dark:bg-violet-950/50 dark:text-violet-200",
  DELETE: "border-red-300 bg-red-50 text-red-800 dark:border-red-600/40 dark:bg-red-950/50 dark:text-red-200",
};

export default function MethodBadge({ method, className }) {
  const style = METHOD_STYLES[method] || "border-border bg-muted text-foreground";
  return (
    <span
      className={cn(
        "inline-flex min-w-[3.5rem] items-center justify-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider",
        style,
        className,
      )}
    >
      {method}
    </span>
  );
}

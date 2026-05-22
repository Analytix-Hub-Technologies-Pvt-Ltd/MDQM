import { cn } from "@/lib/utils";

export default function EnterpriseTabBar({ tabs, activeId, onChange }) {
  return (
    <div
      className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1"
      role="tablist"
    >
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-medium transition-all",
              active
                ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

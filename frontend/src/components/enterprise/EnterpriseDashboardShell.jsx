import { useMemo } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import EnterpriseTabBar from "./EnterpriseTabBar";
import { cn } from "@/lib/utils";

const accentClassMap = {
  blue: "from-primary to-accent",
  violet: "from-accent to-primary",
  teal: "from-secondary to-primary",
};

export default function EnterpriseDashboardShell({
  title,
  subtitle,
  accent = "blue",
  tabs,
  overviewLabel,
  overview,
  renderTab,
  footer = null,
  footerOnOverviewOnly = false,
  hideTabBar = false,
  showOverview = true,
  defaultTab = null,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabDefs = useMemo(
    () => (showOverview ? [{ id: "overview", label: overviewLabel || "Overview" }, ...tabs] : tabs),
    [tabs, overviewLabel, showOverview],
  );
  const validIds = useMemo(() => new Set(tabDefs.map((t) => t.id)), [tabDefs]);
  const fallbackTab = showOverview ? "overview" : defaultTab || tabs[0]?.id || "overview";

  const rawTab = searchParams.get("tab");
  const activeId = rawTab && validIds.has(rawTab) ? rawTab : fallbackTab;

  const gradient = accentClassMap[accent] || accentClassMap.blue;

  const setTab = (id) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    setSearchParams(next, { replace: true });
  };

  const content =
    activeId === "overview"
      ? overview
      : renderTab
        ? renderTab(activeId)
        : (
            <p className="text-sm text-muted-foreground">Unknown tab.</p>
          );

  return (
    <section className="space-y-6">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "overflow-hidden rounded-2xl border-0 bg-gradient-to-r p-6 shadow-lg",
          gradient,
        )}
      >
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-1 text-sm text-white/80">{subtitle}</p>
      </motion.header>

      {!hideTabBar ? <EnterpriseTabBar tabs={tabDefs} activeId={activeId} onChange={setTab} /> : null}

      <motion.div
        key={activeId}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="min-h-[200px]"
      >
        {content}
      </motion.div>
      {footer && (!footerOnOverviewOnly || activeId === "overview") ? footer : null}
    </section>
  );
}

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import EnterpriseTabBar from "./EnterpriseTabBar";

const accentClassMap = {
  blue: "from-[#4f8cff] to-[#8b5cf6]",
  violet: "from-[#8b5cf6] to-[#4f8cff]",
  teal: "from-[#2dd4bf] to-[#4f8cff]",
};

/**
 * Enterprise tab shell: gradient header + URL-synced tabs (?tab=overview).
 * @param {string} [overviewLabel] - Label for the first (overview) tab, e.g. "Executive Overview"
 * @param {React.ReactNode} [footer] - Optional block below tab content (e.g. classic KPI)
 */
export default function EnterpriseDashboardShell({
  title,
  subtitle,
  accent = "blue",
  tabs,
  overviewLabel,
  overview,
  renderTab,
  footer = null,
  /** When true, horizontal tabs are hidden (e.g. business user uses left sidebar links). */
  hideTabBar = false,
  /** When false, no Overview tab — first tab in `tabs` is the default. */
  showOverview = true,
  /** Used when showOverview is false and URL has no valid ?tab= */
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

  const content = activeId === "overview" ? overview : renderTab ? renderTab(activeId) : <div className="text-sm text-[#9ab0d1]">Unknown tab.</div>;

  return (
    <section className="p-4 md:p-6 space-y-4">
      <header className={`enterprise-card p-5 border-none bg-gradient-to-r ${gradient}`}>
        <h1 className="text-2xl text-white">{title}</h1>
        <p className="text-sm text-blue-100 mt-1">{subtitle}</p>
      </header>

      {!hideTabBar ? <EnterpriseTabBar tabs={tabDefs} activeId={activeId} onChange={setTab} /> : null}

      <div className="min-h-[200px]">{content}</div>
      {footer}
    </section>
  );
}

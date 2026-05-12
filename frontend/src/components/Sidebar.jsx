import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NavLink } from "react-router-dom";
import { SIDEBAR_CONFIG } from "../config/sidebarConfig";
import { usePermissions } from "../auth/usePermissions";

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { role, hasPermission } = usePermissions();
  const groups = useMemo(() => {
    const roleGroups = SIDEBAR_CONFIG[role] || [];
    return roleGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => hasPermission(item.permission)),
      }))
      .filter((group) => group.items.length);
  }, [role, hasPermission]);

  return (
    <aside
      className={`${
        isCollapsed ? "w-16" : "w-72"
      } relative flex h-screen flex-col border-r border-[var(--mdqm-border)] bg-[var(--mdqm-panel)] text-[var(--mdqm-text)] transition-[width] duration-300 ease-out`}
    >
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-8 z-50 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--mdqm-border)] bg-[var(--mdqm-panel-soft)] text-[var(--mdqm-text)] shadow-md transition-colors hover:bg-[var(--mdqm-accent)] hover:text-white"
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      <div className="flex h-24 items-center overflow-hidden border-b border-[var(--mdqm-border)] px-4">
        <h1
          className={`text-center text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--mdqm-muted)] transition-opacity ${
            isCollapsed ? "opacity-0" : "opacity-100"
          }`}
        >
          Master Data Quality Management System
        </h1>
      </div>

      <nav className="flex h-full flex-1 flex-col overflow-y-auto">
        <div className="flex-none py-1">
          {groups.map((group) => (
            <div key={group.group} className="border-b border-[var(--mdqm-border)]/80 pb-2 last:border-b-0">
              {!isCollapsed ? (
                <div className="px-4 pb-2 pt-4 text-[10px] uppercase tracking-[0.2em] text-[var(--mdqm-muted)]">{group.group}</div>
              ) : null}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `mx-2 mb-1 flex w-[calc(100%-1rem)] items-center rounded-md border border-transparent px-3 py-3 text-sm transition-colors ${
                        isActive
                          ? "border-[#2a4a7a] bg-[#13223c] text-white"
                          : "text-[var(--mdqm-text)] hover:border-[var(--mdqm-border)] hover:bg-[#0f1b31]"
                      }`
                    }
                  >
                    <span className="shrink-0">
                      <Icon size={18} strokeWidth={1.5} />
                    </span>
                    {!isCollapsed && <span className="ml-4 truncate text-[12px] uppercase tracking-wider">{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;

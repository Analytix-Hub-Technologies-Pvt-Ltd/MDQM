import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { SIDEBAR_CONFIG } from "../config/sidebarConfig";
import { usePermissions } from "../auth/usePermissions";
import { ROLES } from "../auth/rolePermissions";
import { enterpriseNotificationMarkRead, enterpriseNotifications } from "../pages/dashboards/enterpriseApi";

function isAlertsNavItem(item) {
  return String(item?.path || "").includes("tab=alerts") || String(item?.label || "").toLowerCase() === "alerts";
}

/** Match sidebar item to current location (supports /dashboard?tab=… for business user). */
function isSidebarItemActive(location, to, role) {
  let pathname;
  let search = "";
  try {
    const u = new URL(to, "http://local");
    pathname = u.pathname;
    search = u.search || "";
  } catch {
    return false;
  }
  if (pathname === "/admin" && !search) {
    return location.pathname === "/admin" || location.pathname.startsWith("/admin/");
  }
  if (location.pathname !== pathname) return false;
  if (!search) {
    if (pathname === "/dashboard") {
      if (role === ROLES.BUSINESS_USER) {
        const t = new URLSearchParams(location.search).get("tab");
        return !t || t === "overview";
      }
      return true;
    }
    return !location.search;
  }
  const want = new URLSearchParams(search.slice(1));
  const have = new URLSearchParams(location.search);
  return want.get("tab") === have.get("tab");
}

const Sidebar = () => {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { role, hasPermission } = usePermissions();
  const [alertPreview, setAlertPreview] = useState({ items: [], unreadTotal: 0 });

  const loadAlertPreview = useCallback(async () => {
    if (role !== ROLES.BUSINESS_USER) return;
    try {
      const res = await enterpriseNotifications({ page: 1, page_size: 5, unread_only: true });
      const d = res?.data ?? {};
      setAlertPreview({
        items: Array.isArray(d.items) ? d.items : [],
        unreadTotal: Number(d.total) || 0,
      });
    } catch {
      setAlertPreview({ items: [], unreadTotal: 0 });
    }
  }, [role]);

  useEffect(() => {
    loadAlertPreview();
  }, [loadAlertPreview, location.pathname, location.search]);

  useEffect(() => {
    if (role !== ROLES.BUSINESS_USER) return undefined;
    const onRefresh = () => loadAlertPreview();
    window.addEventListener("mdqm-notifications-refresh", onRefresh);
    const t = window.setInterval(loadAlertPreview, 45000);
    return () => {
      window.removeEventListener("mdqm-notifications-refresh", onRefresh);
      window.clearInterval(t);
    };
  }, [role, loadAlertPreview]);

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
                const active = isSidebarItemActive(location, item.path, role);
                const isAlerts = isAlertsNavItem(item);
                const unread = role === ROLES.BUSINESS_USER && isAlerts ? alertPreview.unreadTotal : 0;
                const showPreview =
                  role === ROLES.BUSINESS_USER && isAlerts && !isCollapsed && (alertPreview.items.length > 0 || unread > 0);

                const markOneRead = async (e, id) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    await enterpriseNotificationMarkRead(id);
                    await loadAlertPreview();
                    window.dispatchEvent(new CustomEvent("mdqm-notifications-refresh"));
                  } catch {
                    /* ignore */
                  }
                };

                return (
                  <Fragment key={`${group.group}-${item.label}`}>
                    {showPreview ? (
                      <div className="mx-2 mb-1 rounded-md border border-[#2a3f63] bg-[#0a1220] px-2.5 py-2 shadow-inner">
                        <div className="mb-1.5 flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-[var(--mdqm-muted)]">
                          <span>Unread</span>
                          <span className="rounded-full bg-rose-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        </div>
                        <ul className="max-h-[140px] space-y-1 overflow-y-auto">
                          {alertPreview.items.length === 0 ? (
                            <li className="text-[11px] text-[#7f95b6]">No unread items in this slice.</li>
                          ) : (
                            alertPreview.items.map((n) => (
                              <li key={n.id} className="flex items-start gap-1.5 border-b border-[#1e2d47]/80 pb-1.5 last:border-b-0 last:pb-0">
                                <span className="min-w-0 flex-1 text-[11px] leading-snug text-[#d7e3f7]">{n.subject || "—"}</span>
                                <button
                                  type="button"
                                  className="shrink-0 text-[10px] uppercase tracking-wide text-sky-400 hover:text-sky-300"
                                  onClick={(e) => markOneRead(e, n.id)}
                                >
                                  Read
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    ) : null}
                    <NavLink
                      to={item.path}
                      className={() =>
                        `mx-2 mb-1 flex w-[calc(100%-1rem)] items-center rounded-md border border-transparent px-3 py-3 text-sm transition-colors ${
                          active
                            ? "border-[#2a4a7a] bg-[#13223c] text-white"
                            : "text-[var(--mdqm-text)] hover:border-[var(--mdqm-border)] hover:bg-[#0f1b31]"
                        }`
                      }
                    >
                      <span className="relative inline-flex shrink-0">
                        <Icon size={18} strokeWidth={1.5} />
                        {unread > 0 ? (
                          <span
                            className="absolute -right-1.5 -top-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-rose-600 px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-[var(--mdqm-panel)]"
                            aria-label={`${unread} unread notifications`}
                          >
                            {unread > 9 ? "9+" : unread}
                          </span>
                        ) : null}
                      </span>
                      {!isCollapsed && <span className="ml-4 truncate text-[12px] uppercase tracking-wider">{item.label}</span>}
                    </NavLink>
                  </Fragment>
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

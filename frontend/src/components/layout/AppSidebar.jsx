import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Database } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { SIDEBAR_CONFIG } from "@/config/sidebarConfig";
import { usePermissions } from "@/auth/usePermissions";
import { cn } from "@/lib/utils";

function isSidebarItemActive(location, to) {
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
      const t = new URLSearchParams(location.search).get("tab");
      return !t || t === "overview";
    }
    return !location.search;
  }
  const want = new URLSearchParams(search.slice(1));
  const have = new URLSearchParams(location.search);
  return want.get("tab") === have.get("tab");
}

export default function AppSidebar({ mobileOpen, onMobileClose, collapsed, onCollapsedChange }) {
  const location = useLocation();
  const [internalCollapsed, setInternalCollapsed] = useState(true);
  const isCollapsed = collapsed ?? internalCollapsed;
  const setCollapsed = onCollapsedChange ?? setInternalCollapsed;

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

  const sidebarContent = (
    <aside
      className={cn(
        "relative flex h-full flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] shadow-sm transition-[width] duration-300 ease-out",
        isCollapsed ? "w-[4.5rem]" : "w-64 lg:w-72",
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed(!isCollapsed)}
        className={cn(
          "absolute -right-3 top-8 z-50 hidden lg:inline-flex h-6 w-6 items-center justify-center rounded-full border shadow-md transition-colors",
          "border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)]",
          "hover:bg-[var(--sidebar-active-bg)] hover:text-[var(--sidebar-active-fg)]",
        )}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      <div className="flex h-16 items-center gap-3 border-b border-[var(--sidebar-border)] px-4">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary-foreground"
          style={{ background: "var(--sidebar-accent)" }}
        >
          <Database className="h-5 w-5" />
        </div>
        {!isCollapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-[var(--sidebar-foreground)]">MDQM</p>
            <p className="truncate text-[10px] font-medium uppercase tracking-wider text-[var(--sidebar-muted)]">
              Data Quality Platform
            </p>
          </div>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto py-2 mdqm-scroll-x">
        {groups.map((group) => (
          <div key={group.group} className="px-2 py-1">
            {!isCollapsed ? (
              <div className="px-3 pb-2 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--sidebar-muted)]">
                {group.group}
              </div>
            ) : null}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isSidebarItemActive(location, item.path);

              return (
                <NavLink
                  key={`${group.group}-${item.label}`}
                  to={item.path}
                  onClick={onMobileClose}
                  className={() =>
                    cn(
                      "group mb-1 flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                      active
                        ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-fg)] shadow-sm ring-1 ring-primary/20"
                        : "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-hover)]",
                    )
                  }
                >
                  <Icon
                    size={18}
                    strokeWidth={1.75}
                    className={cn("shrink-0", active ? "text-[var(--sidebar-accent)]" : "opacity-80")}
                  />
                  {!isCollapsed ? <span className="ml-3 truncate">{item.label}</span> : null}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );

  return (
    <>
      <div className="hidden h-screen shrink-0 lg:block">{sidebarContent}</div>

      <AnimatePresence>
        {mobileOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 lg:hidden"
              onClick={onMobileClose}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="fixed inset-y-0 left-0 z-50 w-72 shadow-2xl lg:hidden"
            >
              {sidebarContent}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  enterpriseNotificationMarkRead,
  enterpriseNotifications,
} from "../pages/dashboards/enterpriseApi";

const PRESETS = {
  business: {
    panelLabel: "Alerts",
    viewAllTab: "alerts",
    viewAllLabel: "View all alerts",
    refreshEvents: ["mdqm-notifications-refresh"],
    navigateOnSelect: false,
  },
  owner: {
    panelLabel: "Notifications",
    viewAllTab: "access-requests",
    viewAllLabel: "Review access requests",
    refreshEvents: ["mdqm-notifications-refresh", "mdqm-owner-access-refresh"],
    navigateOnSelect: true,
  },
};

/**
 * Header notification bell (business user alerts + data owner access-request notices).
 */
export default function AlertsBell({ preset = "business" }) {
  const cfg = PRESETS[preset] ?? PRESETS.business;
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await enterpriseNotifications({ page: 1, page_size: 8, unread_only: true });
      const d = res?.data ?? {};
      setItems(Array.isArray(d.items) ? d.items : []);
      setUnreadTotal(Number(d.total) || 0);
    } catch {
      setItems([]);
      setUnreadTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    for (const ev of cfg.refreshEvents) {
      window.addEventListener(ev, onRefresh);
    }
    const t = window.setInterval(load, 45000);
    return () => {
      for (const ev of cfg.refreshEvents) {
        window.removeEventListener(ev, onRefresh);
      }
      window.clearInterval(t);
    };
  }, [load, cfg.refreshEvents]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const markRead = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await enterpriseNotificationMarkRead(id);
      await load();
      window.dispatchEvent(new CustomEvent("mdqm-notifications-refresh"));
    } catch {
      /* ignore */
    }
  };

  const goViewAll = () => {
    setOpen(false);
    navigate(`/dashboard?tab=${cfg.viewAllTab}`);
  };

  const openNotification = async (n) => {
    if (!cfg.navigateOnSelect) return;
    setOpen(false);
    try {
      await enterpriseNotificationMarkRead(n.id);
      window.dispatchEvent(new CustomEvent("mdqm-notifications-refresh"));
    } catch {
      /* ignore */
    }
    navigate(`/dashboard?tab=${cfg.viewAllTab}`);
    await load();
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label={unreadTotal ? `${unreadTotal} unread ${cfg.panelLabel.toLowerCase()}` : cfg.panelLabel}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell size={18} strokeWidth={1.5} />
        {unreadTotal > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white ring-2 ring-card">
            {unreadTotal > 99 ? "99+" : unreadTotal > 9 ? "9+" : unreadTotal}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-[200] mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover py-2 text-popover-foreground shadow-xl"
          role="menu"
        >
          <div className="flex items-center justify-between border-b border-border px-3 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{cfg.panelLabel}</span>
            {unreadTotal > 0 ? (
              <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-semibold text-white">
                {unreadTotal} unread
              </span>
            ) : null}
          </div>

          <ul className="max-h-[280px] overflow-y-auto px-2 py-1">
            {loading && !items.length ? (
              <li className="px-2 py-3 text-xs text-muted-foreground">Loading…</li>
            ) : items.length === 0 ? (
              <li className="px-2 py-3 text-xs text-muted-foreground">No unread notifications.</li>
            ) : (
              items.map((n) => (
                <li
                  key={n.id}
                  className="flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-muted"
                >
                  {cfg.navigateOnSelect ? (
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => openNotification(n)}
                    >
                      <p className="text-xs font-medium text-foreground line-clamp-2">{n.subject || "—"}</p>
                      {n.body ? (
                        <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{n.body}</p>
                      ) : null}
                    </button>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground line-clamp-2">{n.subject || "—"}</p>
                      {n.body ? (
                        <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{n.body}</p>
                      ) : null}
                    </div>
                  )}
                  <button
                    type="button"
                    className="shrink-0 text-[10px] uppercase tracking-wide text-primary hover:opacity-80"
                    onClick={(e) => markRead(e, n.id)}
                  >
                    Read
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="border-t border-border px-2 pt-2">
            <button
              type="button"
              className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground hover:opacity-90"
              onClick={goViewAll}
            >
              {cfg.viewAllLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

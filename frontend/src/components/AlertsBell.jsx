import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  enterpriseNotificationMarkRead,
  enterpriseNotifications,
} from "../pages/dashboards/enterpriseApi";

/**
 * Header notification bell for business users (replaces sidebar Alerts link).
 */
export default function AlertsBell() {
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
    window.addEventListener("mdqm-notifications-refresh", onRefresh);
    const t = window.setInterval(load, 45000);
    return () => {
      window.removeEventListener("mdqm-notifications-refresh", onRefresh);
      window.clearInterval(t);
    };
  }, [load]);

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

  const goAlerts = () => {
    setOpen(false);
    navigate("/dashboard?tab=alerts");
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
        aria-label={unreadTotal ? `${unreadTotal} unread alerts` : "Alerts"}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell size={18} strokeWidth={1.5} />
        {unreadTotal > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadTotal > 99 ? "99+" : unreadTotal > 9 ? "9+" : unreadTotal}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-[200] mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-[#2a3f63] bg-[#0f1b31] py-2 shadow-xl"
          role="menu"
        >
          <div className="flex items-center justify-between border-b border-[#2a3f63] px-3 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7f95b6]">Alerts</span>
            {unreadTotal > 0 ? (
              <span className="rounded-full bg-rose-600/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                {unreadTotal} unread
              </span>
            ) : null}
          </div>

          <ul className="max-h-[280px] overflow-y-auto px-2 py-1">
            {loading && !items.length ? (
              <li className="px-2 py-3 text-xs text-[#7f95b6]">Loading…</li>
            ) : items.length === 0 ? (
              <li className="px-2 py-3 text-xs text-[#7f95b6]">No unread notifications.</li>
            ) : (
              items.map((n) => (
                <li
                  key={n.id}
                  className="flex items-start gap-2 rounded px-2 py-2 hover:bg-[#1a2844]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[#d7e3f7] line-clamp-2">{n.subject || "—"}</p>
                    {n.body ? (
                      <p className="mt-0.5 text-[10px] text-[#7f95b6] line-clamp-2">{n.body}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-[10px] uppercase tracking-wide text-sky-400 hover:text-sky-300"
                    onClick={(e) => markRead(e, n.id)}
                  >
                    Read
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="border-t border-[#2a3f63] px-2 pt-2">
            <button
              type="button"
              className="w-full rounded bg-[#2b7fff] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-[#1e66db]"
              onClick={goAlerts}
            >
              View all alerts
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import {
  enterpriseBusinessAlertSubscriptionCreate,
  enterpriseBusinessAlertSubscriptionDelete,
  enterpriseBusinessAlertSubscriptionUpdate,
  enterpriseBusinessAlertSubscriptions,
  enterpriseBusinessCatalog,
  enterpriseNotifications,
  enterpriseNotificationMarkRead,
} from "../../enterpriseApi";
import EnterpriseDataPanel, { StatusBadge } from "../../../../components/enterprise/EnterpriseDataPanel";
import StatCard from "../../../../components/business/StatCard";
import { defaultAlertThresholdForTier } from "../../../../utils/defaultAlertThreshold";
import { Bell, CircleAlert, CircleCheck, CircleDot } from "lucide-react";

const notifCols = [
  { key: "created_at", label: "When" },
  { key: "severity", label: "Severity", render: (v) => <StatusBadge status={v} /> },
  { key: "subject", label: "Subject" },
  {
    key: "read_at",
    label: "Read",
    render: (v, row) =>
      v ? (
        <span className="text-xs text-emerald-400">Yes</span>
      ) : (
        <button
          type="button"
          className="text-xs text-sky-400 underline"
          onClick={async () => {
            try {
              await enterpriseNotificationMarkRead(row.id);
              window.dispatchEvent(new CustomEvent("mdqm-notifications-refresh"));
            } catch {
              /* ignore */
            }
          }}
        >
          Mark read
        </button>
      ),
  },
];

export default function AlertsPanel() {
  const [subs, setSubs] = useState({ items: [], summary: {} });
  const [datasets, setDatasets] = useState([]);
  const [pick, setPick] = useState("");
  const [notifVer, setNotifVer] = useState(0);
  const [err, setErr] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editThreshold, setEditThreshold] = useState(85);

  const loadSubs = useCallback(async () => {
    try {
      const res = await enterpriseBusinessAlertSubscriptions();
      setSubs({ items: res.data?.items || [], summary: res.data?.summary || {} });
    } catch (e) {
      setErr(e?.response?.data?.detail || "Could not load subscriptions");
    }
  }, []);

  useEffect(() => {
    loadSubs();
    enterpriseBusinessCatalog({ page: 1, page_size: 200 })
      .then((r) => {
        const items = r.data?.items || [];
        setDatasets(items.map((d) => ({ name: d.name, tier: d.tier })).filter((d) => d.name));
      })
      .catch(() => setDatasets([]));
  }, [loadSubs]);

  useEffect(() => {
    const h = () => setNotifVer((v) => v + 1);
    window.addEventListener("mdqm-notifications-refresh", h);
    return () => window.removeEventListener("mdqm-notifications-refresh", h);
  }, []);

  const addWatch = async () => {
    setSuccessMsg("");
    if (!pick) {
      setErr("Select a dataset from the list first, then click + Watch dataset.");
      return;
    }
    if (!datasets.length) {
      setErr("No datasets in the catalog yet. Ask a data owner to register datasets under Governance.");
      return;
    }
    const meta = datasets.find((d) => d.name === pick);
    const threshold = defaultAlertThresholdForTier(meta?.tier);
    setAdding(true);
    setErr("");
    try {
      await enterpriseBusinessAlertSubscriptionCreate({ dataset_name: pick, threshold });
      setPick("");
      setSuccessMsg(`Now watching "${pick}" (alert if score drops below ${threshold}).`);
      await loadSubs();
      window.dispatchEvent(new CustomEvent("mdqm-notifications-refresh"));
    } catch (e) {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((x) => x.msg).join(", ") : "Could not add watch";
      if (e?.response?.status === 500 && String(msg).toLowerCase().includes("does not exist")) {
        setErr("Database table missing — run: python scripts/apply_bu_migration.py in the backend folder.");
      } else {
        setErr(msg);
      }
    } finally {
      setAdding(false);
    }
  };

  const saveThreshold = async (id) => {
    try {
      await enterpriseBusinessAlertSubscriptionUpdate(id, { threshold: Number(editThreshold) });
      setEditingId(null);
      loadSubs();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Could not update threshold");
    }
  };

  const removeWatch = async (id) => {
    try {
      await enterpriseBusinessAlertSubscriptionDelete(id);
      loadSubs();
    } catch {
      /* ignore */
    }
  };

  const sum = subs.summary;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active watches" value={sum.active ?? 0} sub="Datasets you monitor" icon={Bell} />
        <StatCard label="Triggered" value={sum.triggered ?? 0} sub="Below 70" icon={CircleAlert} tone="danger" />
        <StatCard label="Warnings" value={sum.warnings ?? 0} sub="Below threshold" icon={CircleDot} tone="warning" />
        <StatCard label="OK" value={sum.ok ?? 0} sub="Above threshold" icon={CircleCheck} tone="success" />
      </div>

      <div className="enterprise-card p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="enterprise-title">Quality alert subscriptions</h3>
            <p className="text-xs text-slate-500 dark:text-[#7f95b6]">Default threshold: Gold 85 · Silver/Bronze 75 (editable per watch)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded border border-slate-200 dark:border-[#2a3f63] bg-white dark:bg-[#0a1220] px-3 py-2 text-xs text-slate-900 dark:text-[#d7e3f7] min-w-[180px]"
              value={pick}
              onChange={(e) => {
                setPick(e.target.value);
                setErr("");
              }}
              disabled={!datasets.length}
            >
              <option value="">{datasets.length ? "Select dataset…" : "No datasets in catalog"}</option>
              {datasets.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-sky-500 transition-colors"
              onClick={addWatch}
              disabled={adding || !datasets.length}
            >
              {adding ? "Adding…" : "+ Watch dataset"}
            </button>
          </div>
        </div>
        {err ? <p className="text-xs text-amber-400">{err}</p> : null}
        {successMsg ? <p className="text-xs text-emerald-400">{successMsg}</p> : null}
        <ul className="divide-y divide-slate-100 dark:divide-[#22324f]/60">
          {(subs.items || []).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="text-lg">{s.state === "Triggered" ? "🔴" : s.state === "Warning" ? "🟡" : "🟢"}</span>
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-semibold text-slate-900 dark:text-[#d7e3f7]">{s.dataset_name}</p>
                <p className="text-xs text-slate-500 dark:text-[#5c6d8a]">
                  Alert when score drops below {s.threshold} · Currently: {s.current_score} · {s.domain}
                </p>
              </div>
              <StatusBadge status={s.state} />
              {editingId === s.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={50}
                    max={100}
                    className="w-16 rounded border border-slate-200 dark:border-[#2a3f63] bg-white dark:bg-[#0a1220] px-2 py-1 text-xs text-slate-900 dark:text-[#d7e3f7]"
                    value={editThreshold}
                    onChange={(e) => setEditThreshold(e.target.value)}
                  />
                  <button type="button" className="text-xs text-sky-400 underline" onClick={() => saveThreshold(s.id)}>
                    Save
                  </button>
                  <button type="button" className="text-xs text-slate-500 dark:text-[#7f95b6]" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-xs text-sky-400 underline"
                  onClick={() => {
                    setEditingId(s.id);
                    setEditThreshold(s.threshold);
                  }}
                >
                  Edit
                </button>
              )}
              <button type="button" className="text-xs text-red-400 underline" onClick={() => removeWatch(s.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        {!subs.items?.length ? <p className="text-xs text-slate-500 dark:text-[#7f95b6]">No watches yet. Add a dataset above.</p> : null}
      </div>

      <EnterpriseDataPanel
        key={`bu-notif-${notifVer}`}
        title="Notification inbox"
        columns={notifCols}
        emptyMessage="No notifications yet. You will see alerts here when exports complete or requests are approved."
        fetchPage={async ({ page, pageSize }) => enterpriseNotifications({ page, page_size: pageSize })}
      />
    </div>
  );
}

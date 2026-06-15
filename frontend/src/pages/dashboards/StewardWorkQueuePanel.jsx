import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  enterpriseStewardshipIssues,
  STEWARDSHIP_REFRESH_EVENT,
} from "./enterpriseApi";
import { SEVERITY_SORT_ORDER } from "@/components/stewardship/stewardshipConstants";

function priorityLabel(severity) {
  const s = String(severity || "").toLowerCase();
  if (s === "high") return "P1";
  if (s === "medium") return "P2";
  return "P3";
}

function priorityClass(severity) {
  const s = String(severity || "").toLowerCase();
  if (s === "high") {
    return "text-red-300 border-red-400/40 bg-red-950/40 dark:text-red-300";
  }
  if (s === "medium") {
    return "text-amber-300 border-amber-400/40 bg-amber-950/40 dark:text-amber-300";
  }
  return "text-slate-300 border-slate-400/40 bg-slate-900/40";
}

export default function StewardWorkQueuePanel() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await enterpriseStewardshipIssues({
        page: 1,
        page_size: 20,
        open_only: true,
      });
      const items = Array.isArray(res?.data?.items) ? res.data.items : [];
      const sorted = [...items].sort((a, b) => {
        const sa = SEVERITY_SORT_ORDER[String(a.severity || "").toLowerCase()] ?? 9;
        const sb = SEVERITY_SORT_ORDER[String(b.severity || "").toLowerCase()] ?? 9;
        if (sa !== sb) return sa - sb;
        return (b.id || 0) - (a.id || 0);
      });
      setTasks(sorted.slice(0, 5));
    } catch (e) {
      setTasks([]);
      setError(e?.response?.data?.detail || e?.message || "Could not load work queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener(STEWARDSHIP_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(STEWARDSHIP_REFRESH_EVENT, onRefresh);
  }, [load]);

  return (
    <section className="enterprise-card p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="enterprise-title">Stewardship Work Queue</h3>
        <Link to="/stewardship" className="text-xs font-medium text-primary hover:underline">
          View all →
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading open tasks…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !tasks.length ? (
        <p className="text-sm text-muted-foreground">
          No open tasks.{" "}
          <Link to="/stewardship" className="text-primary hover:underline">
            Create one in Stewardship
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-md border border-border bg-muted/30 p-3 dark:bg-[#0f1b31] dark:border-[#233252]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{task.dataset_name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ST-{task.id} · {task.assigned_to_name || "Unassigned"} · {task.status?.replace(/_/g, " ")}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[10px] px-2 py-1 rounded border uppercase tracking-wide ${priorityClass(task.severity)}`}
                >
                  {priorityLabel(task.severity)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

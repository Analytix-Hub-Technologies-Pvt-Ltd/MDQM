import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EnterpriseDataPanel, { StatusBadge } from "../../../components/enterprise/EnterpriseDataPanel";
import { getAllJobs } from "../../../api";
import {
  enterpriseMonitoringHealth,
  enterpriseMonitoringLogs,
  enterpriseMonitoringMetrics,
  enterpriseNotifications,
  enterpriseSchedulerCreate,
  enterpriseSchedulerHistory,
  enterpriseSchedulerPause,
  enterpriseSchedulerResume,
  enterpriseSchedulerSchedules,
  enterpriseValidationResults,
} from "../enterpriseApi";

const cols = {
  sched: [
    { key: "id", label: "Run ID" },
    { key: "job_id", label: "Job" },
    { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
    { key: "message", label: "Message", render: (v) => <span className="line-clamp-2 max-w-[200px]">{v || "—"}</span> },
    { key: "created_at", label: "Created" },
  ],
  schedDefs: [
    { key: "id", label: "ID" },
    { key: "name", label: "Name" },
    { key: "job_name", label: "Job" },
    { key: "schedule_type", label: "Type", render: (v) => <StatusBadge status={v} /> },
    { key: "is_active", label: "Active", render: (v) => <StatusBadge status={v ? "running" : "paused"} /> },
    { key: "created_at", label: "Created" },
  ],
  logs: [
    { key: "method", label: "Method" },
    { key: "path", label: "Path" },
    { key: "status_code", label: "HTTP" },
    { key: "duration_ms", label: "ms" },
    { key: "created_at", label: "Time" },
  ],
  val: [
    { key: "id", label: "ID" },
    { key: "job_id", label: "Job" },
    { key: "passed", label: "Passed", render: (v) => <StatusBadge status={v ? "success" : "failed"} /> },
    { key: "summary", label: "Summary" },
    { key: "created_at", label: "When" },
  ],
  notif: [
    { key: "subject", label: "Subject" },
    { key: "severity", label: "Severity", render: (v) => <StatusBadge status={v} /> },
    { key: "created_at", label: "Created" },
  ],
};

function MonitoringTab() {
  const [h, setH] = useState(null);
  const [m, setM] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const [hr, mr] = await Promise.all([enterpriseMonitoringHealth(), enterpriseMonitoringMetrics()]);
        if (on) {
          setH(hr.data);
          setM(mr.data);
        }
      } catch (e) {
        if (on) setErr(e?.response?.data?.detail || "Load failed");
      }
    })();
    return () => {
      on = false;
    };
  }, []);
  return (
    <div className="space-y-4">
      {err ? <p className="text-sm text-red-400">{err}</p> : null}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="enterprise-card p-4">
          <h3 className="enterprise-title mb-2">Cluster health</h3>
          <pre className="text-xs text-[#9ab0d1] whitespace-pre-wrap">{h ? JSON.stringify(h, null, 2) : "…"}</pre>
        </div>
        <div className="enterprise-card p-4">
          <h3 className="enterprise-title mb-2">Counters</h3>
          <pre className="text-xs text-[#9ab0d1] whitespace-pre-wrap">{m ? JSON.stringify(m, null, 2) : "…"}</pre>
        </div>
      </div>
      <EnterpriseDataPanel
        title="Recent API requests (enterprise)"
        columns={cols.logs}
        fetchPage={({ page, pageSize, query }) =>
          enterpriseMonitoringLogs({
            page,
            page_size: pageSize,
            ...(query ? { path: query } : {}),
          })
        }
      />
    </div>
  );
}

function SchedulerTab() {
  const [jobs, setJobs] = useState([]);
  const [loadJobsErr, setLoadJobsErr] = useState("");
  const [jobId, setJobId] = useState("");
  const [name, setName] = useState("");
  const [scheduleType, setScheduleType] = useState("interval");
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [cronExpression, setCronExpression] = useState("0 2 * * *");
  const [scheduleActionId, setScheduleActionId] = useState("");
  const [formMsg, setFormMsg] = useState("");
  const [panelKey, setPanelKey] = useState(0);

  useEffect(() => {
    getAllJobs()
      .then((r) => {
        const rows = Array.isArray(r.data) ? r.data : r.data?.items || [];
        setJobs(rows);
      })
      .catch((e) => setLoadJobsErr(e?.response?.data?.detail || "Could not load jobs"));
  }, []);

  const bump = () => setPanelKey((k) => k + 1);

  const onCreate = async (e) => {
    e.preventDefault();
    setFormMsg("");
    const jid = parseInt(jobId, 10);
    if (!jid || !name.trim()) {
      setFormMsg("Job and name are required.");
      return;
    }
    try {
      await enterpriseSchedulerCreate({
        job_id: jid,
        name: name.trim(),
        schedule_type: scheduleType,
        interval_minutes: scheduleType === "interval" ? parseInt(String(intervalMinutes), 10) || 60 : null,
        cron_expression: scheduleType === "cron" ? cronExpression.trim() || null : null,
      });
      setFormMsg("Schedule saved.");
      setName("");
      bump();
    } catch (err) {
      setFormMsg(err?.response?.data?.detail || err?.message || "Create failed");
    }
  };

  const onPause = async () => {
    setFormMsg("");
    const sid = parseInt(scheduleActionId, 10);
    if (!sid) {
      setFormMsg("Enter a schedule ID.");
      return;
    }
    try {
      await enterpriseSchedulerPause({ schedule_id: sid });
      setFormMsg(`Schedule ${sid} paused.`);
      bump();
    } catch (err) {
      setFormMsg(err?.response?.data?.detail || "Pause failed");
    }
  };

  const onResume = async () => {
    setFormMsg("");
    const sid = parseInt(scheduleActionId, 10);
    if (!sid) {
      setFormMsg("Enter a schedule ID.");
      return;
    }
    try {
      await enterpriseSchedulerResume({ schedule_id: sid });
      setFormMsg(`Schedule ${sid} resumed.`);
      bump();
    } catch (err) {
      setFormMsg(err?.response?.data?.detail || "Resume failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="enterprise-card p-4 space-y-3 text-sm">
        <h3 className="enterprise-title">Create schedule</h3>
        {loadJobsErr ? <p className="text-red-400 text-xs">{loadJobsErr}</p> : null}
        <form onSubmit={onCreate} className="grid sm:grid-cols-2 gap-3 text-[#d7e3f7]">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[#7f95b6]">Job</span>
            <select
              className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              required
            >
              <option value="">Select job…</option>
              {jobs.map((j) => (
                <option key={j.job_id} value={j.job_id}>
                  {j.job_id} — {j.job_name || "unnamed"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[#7f95b6]">Schedule name</span>
            <input
              className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nightly DQ"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[#7f95b6]">Type</span>
            <select
              className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value)}
            >
              <option value="interval">Interval</option>
              <option value="cron">Cron</option>
              <option value="once">Once (metadata only)</option>
            </select>
          </label>
          {scheduleType === "interval" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[#7f95b6]">Interval (minutes)</span>
              <input
                type="number"
                min={1}
                className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(e.target.value)}
              />
            </label>
          ) : null}
          {scheduleType === "cron" ? (
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-[#7f95b6]">Cron expression</span>
              <input
                className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2 font-mono text-xs"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
              />
            </label>
          ) : null}
          <div className="sm:col-span-2 flex flex-wrap gap-2 items-center">
            <button type="submit" className="bg-[#2a4a7a] hover:bg-[#355a8f] text-white text-xs px-4 py-2 rounded uppercase tracking-wide">
              Save schedule
            </button>
            {formMsg ? <span className="text-xs text-[#9ab0d1]">{formMsg}</span> : null}
          </div>
        </form>
        <div className="border-t border-[#22324f] pt-3 flex flex-wrap gap-2 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[#7f95b6]">Schedule ID (pause / resume)</span>
            <input
              className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2 w-32"
              value={scheduleActionId}
              onChange={(e) => setScheduleActionId(e.target.value)}
              placeholder="id"
            />
          </label>
          <button type="button" onClick={onPause} className="text-xs border border-[#2a3f63] px-3 py-2 rounded text-[#d7e3f7]">
            Pause
          </button>
          <button type="button" onClick={onResume} className="text-xs border border-[#2a3f63] px-3 py-2 rounded text-[#d7e3f7]">
            Resume
          </button>
        </div>
      </div>

      <EnterpriseDataPanel
        key={`sched-defs-${panelKey}`}
        title="Saved schedules"
        columns={cols.schedDefs}
        fetchPage={({ page, pageSize }) => enterpriseSchedulerSchedules({ page, page_size: pageSize })}
      />
      <EnterpriseDataPanel
        key={`sched-hist-${panelKey}`}
        title="Schedule run history"
        columns={cols.sched}
        searchPlaceholder="Filter message…"
        fetchPage={({ page, pageSize, query }) =>
          enterpriseSchedulerHistory({
            page,
            page_size: pageSize,
            ...(query ? { q: query } : {}),
          })
        }
      />
    </div>
  );
}

export function renderDeveloperTab(tabId) {
  switch (tabId) {
    case "apis":
      return (
        <div className="enterprise-card p-5 space-y-3 text-sm text-[#d7e3f7]">
          <h3 className="enterprise-title mb-2">Platform APIs</h3>
          <p className="text-[#7f95b6]">Core REST surface used by this workspace (authenticated).</p>
          <ul className="list-disc pl-5 space-y-1 text-[#9ab0d1]">
            <li>
              <code className="text-[#9ec5ff]">/jobs</code>, <code className="text-[#9ec5ff]">/jobs/&#123;id&#125;/run</code> — job lifecycle
            </li>
            <li>
              <code className="text-[#9ec5ff]">/api/enterprise/monitoring/*</code> — health &amp; request logs
            </li>
            <li>
              <code className="text-[#9ec5ff]">/api/enterprise/scheduler/*</code> — durable schedules
            </li>
          </ul>
          <Link to="/jobs" className="inline-block text-[#4f8cff] text-sm hover:underline">
            Open Jobs workspace →
          </Link>
        </div>
      );
    case "pipelines":
      return (
        <div className="enterprise-card p-5 text-sm text-[#9ab0d1]">
          <h3 className="enterprise-title mb-2">Pipelines</h3>
          <p>Pipeline execution is driven by the validation engine and job runner. Use Jobs to configure tables and rules, then run or schedule from the Scheduler tab.</p>
        </div>
      );
    case "scheduler":
      return <SchedulerTab />;
    case "monitoring":
      return <MonitoringTab />;
    case "job-history":
      return (
        <EnterpriseDataPanel
          title="Recorded validation runs"
          columns={cols.val}
          searchPlaceholder="Search summary…"
          fetchPage={({ page, pageSize, query }) =>
            enterpriseValidationResults({
              page,
              page_size: pageSize,
              ...(query ? { q: query } : {}),
            })
          }
        />
      );
    case "logs":
      return (
        <EnterpriseDataPanel
          title="API logs"
          columns={cols.logs}
          searchPlaceholder="Path contains…"
          fetchPage={({ page, pageSize, query }) =>
            enterpriseMonitoringLogs({
              page,
              page_size: pageSize,
              ...(query ? { path: query } : {}),
            })
          }
        />
      );
    case "notifications":
      return (
        <EnterpriseDataPanel
          title="In-app notifications"
          columns={cols.notif}
          fetchPage={({ page, pageSize }) => enterpriseNotifications({ page, page_size: pageSize })}
        />
      );
    case "settings":
      return (
        <div className="enterprise-card p-5 text-sm text-[#9ab0d1] space-y-2">
          <h3 className="enterprise-title">Workspace settings</h3>
          <p>Configure Redis broker, Celery workers, and PostgreSQL via backend `.env` (see `.env.example`).</p>
          <p className="text-[#7f95b6]">JWT and RBAC are enforced on all enterprise dashboard APIs.</p>
        </div>
      );
    default:
      return null;
  }
}

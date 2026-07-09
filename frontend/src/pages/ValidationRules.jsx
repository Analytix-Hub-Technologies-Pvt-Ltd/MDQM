import { useState, useEffect } from "react";
import {
  getAllJobs,
  getTablesByJob,
  getTableDetails,
  toggleRule,
  deleteRule,
  bulkSaveTableRules,
  runJobEngine,
} from "../api";
import MultiRuleConfigForm from "../components/rules/MultiRuleConfigForm";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Loader2,
  Edit2,
} from "lucide-react";

// --- CUSTOM SQUARE TOGGLE COMPONENT (Your Design) ---
const CustomToggle = ({ isActive, onToggle }) => (
  <div
    onClick={onToggle}
    className={`
      w-12 h-6 cursor-pointer flex items-center rounded-xl p-1 transition-all duration-300 border
      ${isActive ? "bg-[#23243B] border-[#23243B]" : "bg-transparent border-gray-300"}
      group hover:border-[#4B4D7D]
    `}
  >
    <div
      className={`
        w-4 h-4 shadow-sm transition-all rounded-lg duration-300 transform
        ${isActive ? "translate-x-6 bg-white" : "translate-x-0 bg-gray-400 group-hover:bg-[#4B4D7D]"}
      `}
    />
  </div>
);

const DqRunBadge = ({ status }) => {
  const isYes = String(status || "N").toUpperCase() === "Y";
  return (
    <span
      className={`inline-flex min-w-[2rem] justify-center rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
        isYes ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
      }`}
    >
      {isYes ? "Y" : "N"}
    </span>
  );
};

export default function ValidationRules() {
  const [jobs, setJobs] = useState([]);
  const [tables, setTables] = useState({});
  const [columns, setColumns] = useState([]);
  const [rules, setRules] = useState([]);
  const [dqRunStatus, setDqRunStatus] = useState("N");
  const [runningDq, setRunningDq] = useState(false);

  const [activeJob, setActiveJob] = useState(null);
  const [activeTable, setActiveTable] = useState(null);
  const [loading, setLoading] = useState(false);

  const [showMultiConfig, setShowMultiConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [multiConfigTitle, setMultiConfigTitle] = useState("Rule configuration");

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const res = await getAllJobs();
      setJobs(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleJob = async (jobId) => {
    if (activeJob === jobId) {
      setActiveJob(null);
      return;
    }
    setActiveJob(jobId);
    if (!tables[jobId]) {
      try {
        const res = await getTablesByJob(jobId);
        setTables((prev) => ({ ...prev, [jobId]: res.data }));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const refreshTableDetails = async (jobId, tableId) => {
    const res = await getTableDetails(jobId, tableId);
    setColumns(res.data.columns);
    setRules(res.data.rules);
    setDqRunStatus(res.data.dq_run_status || "N");
    return res.data;
  };

  const toggleTable = async (tableId, jobId) => {
    if (activeTable === tableId) {
      setActiveTable(null);
      setShowMultiConfig(false);
      return;
    }
    setActiveTable(tableId);
    setActiveJob(jobId);
    setShowMultiConfig(false);
    setLoading(true);
    try {
      await refreshTableDetails(jobId, tableId);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openMultiConfig = (title = "Rule configuration") => {
    setMultiConfigTitle(title);
    setShowMultiConfig(true);
  };

  const handleBulkSave = async (payload) => {
    if (!activeJob || !activeTable) return;
    setSavingConfig(true);
    try {
      const res = await bulkSaveTableRules(activeJob, activeTable, payload);
      setDqRunStatus(res.data?.dq_run_status || "N");
      await refreshTableDetails(activeJob, activeTable);
      setShowMultiConfig(false);
    } catch (err) {
      alert(err?.response?.data?.detail || err?.message || "Failed to save configuration");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRunDq = async (e, jobId) => {
    e.stopPropagation();
    if (!jobId || runningDq) return;
    if (!rules.length) {
      alert("Save at least one rule before running DQ.");
      return;
    }
    setRunningDq(true);
    try {
      const res = await runJobEngine(jobId);
      setDqRunStatus(res.data?.dq_run_status || "Y");
      if (activeJob === jobId && activeTable) {
        await refreshTableDetails(activeJob, activeTable);
      }
    } catch (err) {
      setDqRunStatus("N");
      alert(err?.response?.data?.detail || err?.message || "DQ run failed");
    } finally {
      setRunningDq(false);
    }
  };

  const handleDelete = async (ruleId) => {
    if (!window.confirm("Delete rule?")) return;
    try {
      const res = await deleteRule(ruleId);
      setDqRunStatus(res.data?.dq_run_status || "N");
      setRules(rules.filter((r) => r.rule_id !== ruleId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggle = async (ruleId, currentStatus) => {
    try {
      const res = await toggleRule(ruleId, !currentStatus);
      setDqRunStatus(res.data?.dq_run_status || "N");
      setRules(
        rules.map((r) =>
          r.rule_id === ruleId ? { ...r, is_active: !currentStatus } : r,
        ),
      );
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 bg-[#FBFBFB] text-[#23243B] h-screen overflow-y-auto">
      <div className="p-4 h-24 border-b border-[#A1A3AF] border-opacity-20">
        <h1 className="text-4xl pl-4 pt-2 font-thin tracking-tighter uppercase">
          Validation Rules
        </h1>
      </div>
      <div className="p-8">
        <div className="flex flex-col gap-1">
          {jobs.map((job) => (
            <div
              key={job.job_id}
              className="border border-[#A1A3AF] border-opacity-10 bg-white"
            >
              {/* JOB HEADER */}
              <div
                onClick={() => toggleJob(job.job_id)}
                className={`p-4 flex items-center justify-between cursor-pointer transition-colors hover:bg-[#e5e9fd] hover:text-[#23243B] hover:bg-opacity-10
                  ${activeJob === job.job_id ? "bg-[#23243B] text-white" : "text-[#23243B]"}`}
              >
                <div className="flex items-center gap-4">
                  {activeJob === job.job_id ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                  <div className="flex flex-col">
                    <span className="text-xl font-normal tracking-wide uppercase">
                      {job.job_name}
                    </span>
                    <span className="text-[12px] opacity-60">
                      JOB ID: {job.job_id}
                    </span>
                  </div>
                </div>
                <div className="flex gap-8 text-xs tracking-wider uppercase opacity-80 font-medium">
                  <div className="flex flex-col items-end">
                    <span>Tables</span>
                    <span className="font-bold">{job.total_tables}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span>Col Coverage</span>
                    <span className="font-bold">
                      {job.columns_covered}/{job.total_columns}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span>Total Rules</span>
                    <span className="font-bold">{job.total_rules}</span>
                  </div>
                </div>
              </div>

              {/* TABLE LIST */}
              {activeJob === job.job_id && (
                <div className="bg-[#F8F8F8] p-4 flex flex-col gap-2 border-t border-[#A1A3AF] border-opacity-20">
                  {tables[job.job_id]?.map((table) => (
                    <div
                      key={table.table_id}
                      className="border border-[#A1A3AF] border-opacity-20 bg-white shadow-sm"
                    >
                      {/* TABLE HEADER */}
                      <div
                        onClick={() => toggleTable(table.table_id, job.job_id)}
                        className="p-3 pl-8 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-4">
                          {activeTable === table.table_id ? (
                            <ChevronDown size={14} className="text-[#23243B]" />
                          ) : (
                            <ChevronRight
                              size={14}
                              className="text-[#A1A3AF]"
                            />
                          )}
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold uppercase">
                              {table.table_name}
                            </span>
                            <span className="text-[12px] text-gray-400">
                              ID: {table.table_id}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-6 text-xs uppercase font-medium text-gray-500 tracking-wider items-center">
                          <span>
                            Rows:{" "}
                            <b className="text-[#23243B]">{table.row_count}</b>
                          </span>
                          <span>
                            Cols:{" "}
                            <b className="text-[#23243B]">
                              {table.column_count}
                            </b>
                          </span>
                          <span>
                            Rules:{" "}
                            <b className="text-[#23243B]">{table.rule_count}</b>
                          </span>
                          {activeTable === table.table_id ? (
                            <button
                              type="button"
                              onClick={(e) => handleRunDq(e, job.job_id)}
                              disabled={runningDq}
                              className="ml-2 inline-flex items-center gap-2 rounded-md border border-[#23243B] bg-[#23243B] px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-black disabled:opacity-60"
                            >
                              {runningDq ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : null}
                              {runningDq ? "Running DQ…" : "Run DQ"}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {/* RULE EDITOR */}
                      {activeTable === table.table_id && (
                        <div className="p-6 bg-white border-t border-[#A1A3AF] border-opacity-10">
                          {loading ? (
                            <div className="flex justify-center">
                              <Loader2 className="animate-spin" />
                            </div>
                          ) : (
                            <>
                              {/* Header */}
                              <div className="grid grid-cols-12 gap-4 text-sm font-normal uppercase tracking-widest text-[#A1A3AF] mb-4 pb-2 border-b border-gray-100">
                                <div className="col-span-1">S.no.</div>
                                <div className="col-span-2">Column</div>
                                <div className="col-span-2">Data Type</div>
                                <div className="col-span-3">Validation Logic</div>
                                <div className="col-span-1 text-center">Active</div>
                                <div className="col-span-1 text-center">DQ Run</div>
                                <div className="col-span-2 text-right">Actions</div>
                              </div>

                              {/* Rules List */}
                              {rules.map((rule, idx) => (
                                <div
                                  key={rule.rule_id}
                                  className="grid grid-cols-12 gap-4 text-md py-4 border-b border-gray-50 items-center hover:bg-[#FBFBFB]"
                                >
                                  <div className="col-span-1 text-gray-400">
                                    {String(idx + 1).padStart(2, "0")}
                                  </div>
                                  <div className="col-span-2 font-medium text-[#23243B]">
                                    {rule.column_name}
                                  </div>
                                  <div className="col-span-2">
                                    <span className="text-[12px] uppercase tracking-wider text-[#23243B] rounded-sm">
                                      {rule.data_type}
                                    </span>
                                  </div>
                                  <div className="col-span-3 text-[#23243B] font-light">
                                    {rule.rule_type.replace(/_/g, " ")}
                                    {rule.rule_type !== "fuzzy_match" &&
                                      rule.rule_value && (
                                        <span className="ml-2 text-sm bg-yellow-100 px-1 text-yellow-800">
                                          Val: {rule.rule_value}
                                        </span>
                                      )}
                                  </div>

                                  <div className="col-span-1 flex justify-center">
                                    <CustomToggle
                                      isActive={rule.is_active}
                                      onToggle={() =>
                                        handleToggle(
                                          rule.rule_id,
                                          rule.is_active,
                                        )
                                      }
                                    />
                                  </div>

                                  <div className="col-span-1 flex justify-center">
                                    <DqRunBadge status={dqRunStatus} />
                                  </div>

                                  <div className="col-span-2 flex justify-end gap-9 text-gray-400">
                                    <Edit2
                                      size={16}
                                      className="hover:text-[#23243B] cursor-pointer transition-colors"
                                      onClick={() => openMultiConfig("Edit rule configuration")}
                                      title="Edit all rules"
                                    />
                                    <Trash2
                                      size={16}
                                      className="hover:text-red-600 cursor-pointer transition-colors"
                                      onClick={() => handleDelete(rule.rule_id)}
                                    />
                                  </div>
                                </div>
                              ))}

                              {!showMultiConfig ? (
                                <div className="mt-6 flex flex-wrap gap-3">
                                  <button
                                    type="button"
                                    onClick={() => openMultiConfig(rules.length ? "Edit rule configuration" : "Configure rules")}
                                    className="flex-1 min-w-[200px] py-3 border border-dashed border-[#A1A3AF] text-xs uppercase tracking-widest text-gray-500 hover:border-[#23243B] hover:text-[#23243B] transition-colors flex items-center justify-center gap-2"
                                  >
                                    <Plus size={16} />
                                    {rules.length ? "Edit configuration" : "Configure rules"}
                                  </button>
                                </div>
                              ) : null}

                              {showMultiConfig ? (
                                <MultiRuleConfigForm
                                  columns={columns}
                                  initialRules={rules}
                                  title={multiConfigTitle}
                                  saving={savingConfig}
                                  onCancel={() => setShowMultiConfig(false)}
                                  onSave={handleBulkSave}
                                />
                              ) : null}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

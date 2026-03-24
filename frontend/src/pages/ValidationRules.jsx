import { useState, useEffect } from "react";
import {
  getAllJobs,
  getTablesByJob,
  getTableDetails,
  addRule,
  updateRule,
  toggleRule,
  deleteRule,
  getMasterData,
} from "../api";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Save,
  Database,
  X,
  Loader2,
  Edit2,
  HelpCircle,
  ToggleLeft, // Kept for fallback if needed, but we use CustomToggle mainly
} from "lucide-react";

// --- CONFIG ---
const RULE_TYPES = {
  Integer: [
    "is_positive",
    "is_negative",
    "range",
    "equals",
    "not_equals",
    "greater_than",
    "less_than",
  ],
  String: [
    "is_email",
    "is_url",
    "is_alpha",
    "is_alphanumeric",
    "length_match",
    "fuzzy_match",
    "regex_pattern",
    "contains",
    "starts_with",
    "ends_with",
  ],
  Float: [
    "is_positive",
    "is_negative",
    "range",
    "decimal_precision",
    "greater_than",
    "less_than",
  ],
  Date: [
    "is_future",
    "is_past",
    "is_weekend",
    "date_format_check",
    "before_date",
    "after_date",
  ],
  Boolean: ["is_true", "is_false"],
};

// Rules that need a text box (Critical Logic you need)
const RULES_REQUIRING_INPUT = [
  "range",
  "equals",
  "not_equals",
  "greater_than",
  "less_than",
  "length_match",
  "regex_pattern",
  "contains",
  "starts_with",
  "ends_with",
  "decimal_precision",
  "date_format_check",
  "before_date",
  "after_date",
];

const getPlaceholder = (type) => {
  switch (type) {
    case "starts_with":
      return "e.g. 'EMP-'";
    case "ends_with":
      return "e.g. '.com'";
    case "contains":
      return "e.g. 'urgent'";
    case "regex_pattern":
      return "e.g. ^[A-Z]{3}-[0-9]{4}$";
    case "length_match":
      return "e.g. 10";
    case "greater_than":
      return "e.g. 18";
    case "less_than":
      return "e.g. 100";
    case "decimal_precision":
      return "e.g. 2";
    case "date_format_check":
      return "e.g. %Y-%m-%d";
    case "before_date":
      return "YYYY-MM-DD";
    case "after_date":
      return "YYYY-MM-DD";
    default:
      return "Enter value...";
  }
};

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

export default function ValidationRules() {
  const [jobs, setJobs] = useState([]);
  const [tables, setTables] = useState({});
  const [columns, setColumns] = useState([]);
  const [rules, setRules] = useState([]);

  const [activeJob, setActiveJob] = useState(null);
  const [activeTable, setActiveTable] = useState(null);
  const [loading, setLoading] = useState(false);

  // --- FORM STATE ---
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [newRuleData, setNewRuleData] = useState({
    column_name: "",
    rule_type: "",
    rule_value: "",
  });

  // ADD THESE TWO LINES
  const [rangeMin, setRangeMin] = useState("");
  const [rangeMax, setRangeMax] = useState("");
  const [detectedType, setDetectedType] = useState("");
  const [masterData, setMasterData] = useState([]);
  const [masterInput, setMasterInput] = useState("");

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

  const toggleTable = async (tableId, jobId) => {
    if (activeTable === tableId) {
      setActiveTable(null);
      return;
    }
    setActiveTable(tableId);
    setLoading(true);
    try {
      // FIX: Pass jobId AND tableId
      const res = await getTableDetails(jobId, tableId);
      setColumns(res.data.columns);
      setRules(res.data.rules);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // --- ACTIONS ---

  const handleEditClick = async (rule) => {
    setEditingRuleId(rule.rule_id);
    setDetectedType(rule.data_type);

    // --- NEW CHANGE: Split Range values so they appear in the boxes ---
    let rMin = "",
      rMax = "";
    if (
      rule.rule_type === "range" &&
      rule.rule_value &&
      rule.rule_value.includes("-")
    ) {
      [rMin, rMax] = rule.rule_value.split("-");
    }
    setRangeMin(rMin);
    setRangeMax(rMax);
    // ---------------------------------------------------------------

    setNewRuleData({
      column_name: rule.column_name,
      rule_type: rule.rule_type,
      rule_value: rule.rule_value || "",
    });

    if (rule.rule_type === "fuzzy_match") {
      try {
        const res = await getMasterData(activeJob, activeTable);
        setMasterData(res.data);
      } catch (err) {
        console.error(err);
      }
    } else {
      setMasterData([]);
    }

    setShowAddForm(true);
  };

  const handleSaveRule = async () => {
    if (!newRuleData.column_name || !newRuleData.rule_type) return;

    // --- NEW CHANGE: Combine Range values before saving ---
    let finalValue = newRuleData.rule_value;

    if (newRuleData.rule_type === "range") {
      if (!rangeMin || !rangeMax) {
        alert("Please enter both Min and Max values.");
        return;
      }
      finalValue = `${rangeMin}-${rangeMax}`;
    }
    // -----------------------------------------------------

    try {
      const payload = {
        job_id: activeJob,
        table_id: activeTable,
        column_name: newRuleData.column_name,
        rule_type: newRuleData.rule_type,
        data_type: detectedType || "String",
        // Use 'finalValue' here to ensure the new range is sent
        rule_value: newRuleData.rule_type === "fuzzy_match" ? "80" : finalValue,
        is_active: true,
        master_data: masterData,
      };

      if (editingRuleId) {
        await updateRule(editingRuleId, payload);
      } else {
        await addRule(payload);
      }

      // Refresh the list
      const res = await getTableDetails(activeJob, activeTable);
      setRules(res.data.rules);
      resetForm();
    } catch (err) {
      alert("Failed: " + err.message);
    }
  };

  const resetForm = () => {
    setShowAddForm(false);
    setEditingRuleId(null);
    setNewRuleData({ column_name: "", rule_type: "", rule_value: "" });
    setRangeMin("");
    setRangeMax("");
    setMasterData([]);
    setMasterInput("");
  };

  const handleDelete = async (ruleId) => {
    if (!window.confirm("Delete rule?")) return;
    try {
      await deleteRule(ruleId);
      setRules(rules.filter((r) => r.rule_id !== ruleId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggle = async (ruleId, currentStatus) => {
    try {
      await toggleRule(ruleId, !currentStatus);
      setRules(
        rules.map((r) =>
          r.rule_id === ruleId ? { ...r, is_active: !currentStatus } : r,
        ),
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleColumnSelect = (e) => {
    const colName = e.target.value;
    const col = columns.find((c) => c.column_name === colName);
    setDetectedType(col ? col.data_type : "");
    setNewRuleData({ ...newRuleData, column_name: colName, rule_type: "" });
  };

  const renderDynamicInput = () => {
    if (!RULES_REQUIRING_INPUT.includes(newRuleData.rule_type)) return null;

    // 1. RANGE INPUT (Split into Min and Max)
    if (newRuleData.rule_type === "range") {
      return (
        <div className="col-span-1 flex flex-col gap-2">
          <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold flex items-center gap-1">
            Value Range <HelpCircle size={10} className="text-gray-400" />
          </label>
          <div className="flex items-center gap-2">
            <input
              className="w-1/2 bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B] text-center"
              placeholder="Min"
              value={rangeMin}
              onChange={(e) => setRangeMin(e.target.value)}
              type="number"
            />
            <span className="text-gray-400">-</span>
            <input
              className="w-1/2 bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B] text-center"
              placeholder="Max"
              value={rangeMax}
              onChange={(e) => setRangeMax(e.target.value)}
              type="number"
            />
          </div>
        </div>
      );
    }

    // 2. DATE INPUTS (Using Date Picker)
    if (["before_date", "after_date"].includes(newRuleData.rule_type)) {
      return (
        <div className="col-span-1 flex flex-col gap-2">
          <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
            Select Date
          </label>
          <input
            className="bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B]"
            type="date"
            value={newRuleData.rule_value}
            onChange={(e) =>
              setNewRuleData({ ...newRuleData, rule_value: e.target.value })
            }
          />
        </div>
      );
    }

    // 3. STANDARD INPUT (With specific placeholder)
    return (
      <div className="col-span-1 flex flex-col gap-2">
        <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
          Value / Threshold
        </label>
        <input
          className="bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B]"
          placeholder={getPlaceholder(newRuleData.rule_type)}
          value={newRuleData.rule_value}
          onChange={(e) =>
            setNewRuleData({ ...newRuleData, rule_value: e.target.value })
          }
        />
      </div>
    );
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
                        <div className="flex gap-6 text-xs uppercase font-medium text-gray-500 tracking-wider">
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
                                <div className="col-span-3">Column</div>
                                <div className="col-span-2">Data Type</div>
                                <div className="col-span-3">
                                  Validation Logic
                                </div>
                                <div className="col-span-1 text-center">
                                  Active
                                </div>
                                <div className="col-span-2 text-right">
                                  Actions
                                </div>
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
                                  <div className="col-span-3 font-medium text-[#23243B]">
                                    {rule.column_name}
                                  </div>
                                  <div className="col-span-2">
                                    <span className="text-[12px] uppercase tracking-wider text-[#23243B] rounded-sm">
                                      {rule.data_type}
                                    </span>
                                  </div>
                                  <div className="col-span-3 text-[#23243B] font-light">
                                    {rule.rule_type.replace(/_/g, " ")}
                                    {rule.rule_value && (
                                      <span className="ml-2 text-sm bg-yellow-100 px-1 text-yellow-800">
                                        Val: {rule.rule_value}
                                      </span>
                                    )}
                                  </div>

                                  {/* CUSTOM TOGGLE BUTTON */}
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

                                  {/* EDIT AND DELETE BUTTONS */}
                                  <div className="col-span-2 flex justify-end gap-9 text-gray-400">
                                    <Edit2
                                      size={16}
                                      className="hover:text-[#23243B] cursor-pointer transition-colors"
                                      onClick={() => handleEditClick(rule)}
                                    />
                                    <Trash2
                                      size={16}
                                      className="hover:text-red-600 cursor-pointer transition-colors"
                                      onClick={() => handleDelete(rule.rule_id)}
                                    />
                                  </div>
                                </div>
                              ))}

                              {!showAddForm && (
                                <button
                                  onClick={() => {
                                    resetForm();
                                    setShowAddForm(true);
                                  }}
                                  className="mt-6 w-full py-3 border border-dashed border-[#A1A3AF] text-xs uppercase tracking-widest text-gray-500 hover:border-[#23243B] hover:text-[#23243B] transition-colors flex items-center justify-center gap-2"
                                >
                                  <Plus size={16} /> Add New Rule
                                </button>
                              )}

                              {showAddForm && (
                                <div className="mt-6 bg-[#F8F8F8] p-6 border border-[#A1A3AF] border-opacity-20 animate-in fade-in slide-in-from-top-2">
                                  <div className="flex justify-between items-center mb-6">
                                    <span className="text-sm font-bold uppercase tracking-widest text-[#23243B]">
                                      {editingRuleId
                                        ? "Edit Rule Configuration"
                                        : "New Rule Definition"}
                                    </span>
                                    <X
                                      size={18}
                                      className="cursor-pointer hover:text-red-500"
                                      onClick={resetForm}
                                    />
                                  </div>

                                  {/* INPUTS GRID (3 or 4 columns depending on input need) */}
                                  {/* DYNAMIC GRID LAYOUT - Replaces your old grid div */}
                                  <div
                                    className={`grid ${RULES_REQUIRING_INPUT.includes(newRuleData.rule_type) ? "grid-cols-4" : "grid-cols-3"} gap-6 mb-6`}
                                  >
                                    {/* 1. COLUMN SELECT (Keep as is) */}
                                    <div className="flex flex-col gap-2">
                                      <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                                        Target Column
                                      </label>
                                      <select
                                        className="bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B]"
                                        onChange={handleColumnSelect}
                                        value={newRuleData.column_name}
                                        disabled={!!editingRuleId}
                                      >
                                        <option value="">
                                          Select Column...
                                        </option>
                                        {columns.map((col) => (
                                          <option
                                            key={col.column_name}
                                            value={col.column_name}
                                          >
                                            {col.column_name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    {/* 2. DATA TYPE (Keep as is) */}
                                    <div className="flex flex-col gap-2">
                                      <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                                        Data Type
                                      </label>
                                      <input
                                        className="bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none text-gray-400 cursor-not-allowed"
                                        value={detectedType || "AUTO-DETECT"}
                                        readOnly
                                      />
                                    </div>

                                    {/* 3. CONDITION SELECT (Keep as is) */}
                                    <div className="flex flex-col gap-2">
                                      <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                                        Condition
                                      </label>
                                      <select
                                        className="bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B]"
                                        onChange={(e) =>
                                          setNewRuleData({
                                            ...newRuleData,
                                            rule_type: e.target.value,
                                          })
                                        }
                                        value={newRuleData.rule_type}
                                        disabled={!detectedType}
                                      >
                                        <option value="">Select Rule...</option>
                                        {detectedType &&
                                          RULE_TYPES[detectedType]?.map((r) => (
                                            <option key={r} value={r}>
                                              {r.replace(/_/g, " ")}
                                            </option>
                                          ))}
                                      </select>
                                    </div>

                                    {/* 4. DYNAMIC INPUT RENDERED HERE */}
                                    {renderDynamicInput()}
                                  </div>

                                  {/* Fuzzy Match Master Editor */}
                                  {newRuleData.rule_type === "fuzzy_match" && (
                                    <div className="bg-white p-4 border border-[#A1A3AF] border-opacity-20 mb-6 shadow-sm">
                                      <span className="text-[10px] uppercase tracking-wider text-[#23243B] block mb-3 font-bold">
                                        Master Data Reference List
                                      </span>
                                      <div className="flex gap-2 mb-3">
                                        <input
                                          className="flex-1 bg-gray-50 border border-gray-200 p-2 text-sm outline-none focus:border-[#23243B]"
                                          placeholder="Enter value..."
                                          value={masterInput}
                                          onChange={(e) =>
                                            setMasterInput(e.target.value)
                                          }
                                        />
                                        <button
                                          onClick={() => {
                                            if (masterInput) {
                                              setMasterData([
                                                ...masterData,
                                                masterInput,
                                              ]);
                                              setMasterInput("");
                                            }
                                          }}
                                          className="bg-[#23243B] text-white px-4 py-2 text-xs uppercase font-bold hover:bg-black"
                                        >
                                          Add Value
                                        </button>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {masterData.map((val, i) => (
                                          <span
                                            key={i}
                                            className="bg-gray-100 text-[11px] px-3 py-1 border border-gray-200 flex items-center gap-2"
                                          >
                                            {val}{" "}
                                            <X
                                              size={10}
                                              className="cursor-pointer hover:text-red-500"
                                              onClick={() =>
                                                setMasterData(
                                                  masterData.filter(
                                                    (m) => m !== val,
                                                  ),
                                                )
                                              }
                                            />
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  <button
                                    onClick={handleSaveRule}
                                    className="w-full py-4 bg-[#23243B] text-white text-sm font-bold uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2"
                                  >
                                    <Save size={16} />{" "}
                                    {editingRuleId
                                      ? "Update Configuration"
                                      : "Save Rule Configuration"}
                                  </button>
                                </div>
                              )}
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

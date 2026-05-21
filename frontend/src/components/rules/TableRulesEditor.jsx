import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Save, Loader2, Edit2, X, HelpCircle } from "lucide-react";
import {
  getTableDetails,
  addRule,
  updateRule,
  toggleRule,
  deleteRule,
  getMasterData,
} from "../../api";
import { RULE_TYPES, RULES_REQUIRING_INPUT, getRulePlaceholder } from "./rulesConfig";
import CustomToggle from "./CustomToggle";

/**
 * Per-table validation rules editor (same behavior as the Rules workspace).
 * @param {{ jobId: number, tableId: number, tableName?: string, variant?: 'classic'|'enterprise' }} props
 */
export default function TableRulesEditor({ jobId, tableId, tableName, variant = "enterprise" }) {
  const ent = variant === "enterprise";
  const [columns, setColumns] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [newRuleData, setNewRuleData] = useState({ column_name: "", rule_type: "", rule_value: "" });
  const [rangeMin, setRangeMin] = useState("");
  const [rangeMax, setRangeMax] = useState("");
  const [detectedType, setDetectedType] = useState("");
  const [masterData, setMasterData] = useState([]);
  const [masterInput, setMasterInput] = useState("");

  const inputCls = ent
    ? "bg-[#0f1b31] border-b border-[#2a3f63] p-2 text-sm outline-none focus:border-[#4f8cff] text-[#d7e3f7] w-full"
    : "bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B] w-full";
  const labelCls = ent
    ? "text-[10px] uppercase tracking-wider text-[#7f95b6] font-bold"
    : "text-[10px] uppercase tracking-wider text-gray-500 font-bold";
  const rowHover = ent ? "hover:bg-[#132542]" : "hover:bg-[#FBFBFB]";

  const load = useCallback(async () => {
    if (!jobId || !tableId) return;
    setLoading(true);
    setErr("");
    try {
      const res = await getTableDetails(jobId, tableId);
      setColumns(res.data.columns || []);
      setRules(res.data.rules || []);
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Failed to load rules");
    } finally {
      setLoading(false);
    }
  }, [jobId, tableId]);

  useEffect(() => {
    load();
    resetForm();
  }, [load]);

  const resetForm = () => {
    setShowAddForm(false);
    setEditingRuleId(null);
    setNewRuleData({ column_name: "", rule_type: "", rule_value: "" });
    setRangeMin("");
    setRangeMax("");
    setMasterData([]);
    setMasterInput("");
  };

  const handleEditClick = async (rule) => {
    setEditingRuleId(rule.rule_id);
    setDetectedType(rule.data_type);
    let rMin = "";
    let rMax = "";
    if (rule.rule_type === "range" && rule.rule_value?.includes("-")) {
      [rMin, rMax] = rule.rule_value.split("-");
    }
    setRangeMin(rMin);
    setRangeMax(rMax);
    setNewRuleData({
      column_name: rule.column_name,
      rule_type: rule.rule_type,
      rule_value: rule.rule_value || "",
    });
    if (rule.rule_type === "fuzzy_match") {
      try {
        const res = await getMasterData(jobId, tableId);
        setMasterData(res.data || []);
      } catch {
        setMasterData([]);
      }
    } else {
      setMasterData([]);
    }
    setShowAddForm(true);
  };

  const handleSaveRule = async () => {
    if (!newRuleData.column_name || !newRuleData.rule_type) return;
    let finalValue = newRuleData.rule_value;
    if (newRuleData.rule_type === "range") {
      if (!rangeMin || !rangeMax) {
        window.alert("Please enter both Min and Max values.");
        return;
      }
      finalValue = `${rangeMin}-${rangeMax}`;
    }
    try {
      const payload = {
        job_id: jobId,
        table_id: tableId,
        column_name: newRuleData.column_name,
        rule_type: newRuleData.rule_type,
        data_type: detectedType || "String",
        rule_value: newRuleData.rule_type === "fuzzy_match" ? "80" : finalValue,
        is_active: true,
        master_data: masterData,
      };
      if (editingRuleId) {
        await updateRule(editingRuleId, payload);
      } else {
        await addRule(payload);
      }
      await load();
      resetForm();
    } catch (e) {
      window.alert(e?.response?.data?.detail || e?.message || "Failed to save rule");
    }
  };

  const handleDelete = async (ruleId) => {
    if (!window.confirm("Delete this rule?")) return;
    try {
      await deleteRule(ruleId);
      setRules((prev) => prev.filter((r) => r.rule_id !== ruleId));
    } catch (e) {
      window.alert(e?.response?.data?.detail || "Delete failed");
    }
  };

  const handleToggle = async (ruleId, currentStatus) => {
    try {
      await toggleRule(ruleId, !currentStatus);
      setRules((prev) =>
        prev.map((r) => (r.rule_id === ruleId ? { ...r, is_active: !currentStatus } : r)),
      );
    } catch (e) {
      window.alert(e?.response?.data?.detail || "Update failed");
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
    if (newRuleData.rule_type === "range") {
      return (
        <div className="col-span-1 flex flex-col gap-2">
          <label className={`${labelCls} flex items-center gap-1`}>
            Value range <HelpCircle size={10} />
          </label>
          <div className="flex items-center gap-2">
            <input className={`${inputCls} text-center`} placeholder="Min" value={rangeMin} onChange={(e) => setRangeMin(e.target.value)} type="number" />
            <span className="text-[#7f95b6]">-</span>
            <input className={`${inputCls} text-center`} placeholder="Max" value={rangeMax} onChange={(e) => setRangeMax(e.target.value)} type="number" />
          </div>
        </div>
      );
    }
    if (["before_date", "after_date"].includes(newRuleData.rule_type)) {
      return (
        <div className="col-span-1 flex flex-col gap-2">
          <label className={labelCls}>Select date</label>
          <input
            className={inputCls}
            type="date"
            value={newRuleData.rule_value}
            onChange={(e) => setNewRuleData({ ...newRuleData, rule_value: e.target.value })}
          />
        </div>
      );
    }
    return (
      <div className="col-span-1 flex flex-col gap-2">
        <label className={labelCls}>Value / threshold</label>
        <input
          className={inputCls}
          placeholder={getRulePlaceholder(newRuleData.rule_type)}
          value={newRuleData.rule_value}
          onChange={(e) => setNewRuleData({ ...newRuleData, rule_value: e.target.value })}
        />
      </div>
    );
  };

  if (!jobId || !tableId) {
    return <p className="text-xs text-amber-400">Select a table to configure rules.</p>;
  }

  return (
    <div className="space-y-3">
      {tableName ? (
        <p className="text-xs text-[#9ab0d1]">
          Table <span className="font-mono text-[#d7e3f7]">{tableName}</span>
        </p>
      ) : null}
      {err ? <p className="text-xs text-red-400">{err}</p> : null}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-[#4f8cff]" size={28} />
        </div>
      ) : (
        <>
          <div className={`grid grid-cols-12 gap-2 text-[10px] uppercase tracking-widest mb-2 pb-2 border-b ${ent ? "text-[#7f95b6] border-[#22324f]" : "text-[#A1A3AF] border-gray-100"}`}>
            <div className="col-span-1">#</div>
            <div className="col-span-3">Column</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-3">Logic</div>
            <div className="col-span-1 text-center">On</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {rules.map((rule, idx) => (
            <div
              key={rule.rule_id}
              className={`grid grid-cols-12 gap-2 text-sm py-3 border-b items-center ${rowHover} ${ent ? "border-[#22324f]/50 text-[#d7e3f7]" : "border-gray-50"}`}
            >
              <div className="col-span-1 text-[#7f95b6]">{String(idx + 1).padStart(2, "0")}</div>
              <div className="col-span-3 font-medium">{rule.column_name}</div>
              <div className="col-span-2 text-[11px] uppercase">{rule.data_type}</div>
              <div className="col-span-3 text-[#9ab0d1]">
                {rule.rule_type.replace(/_/g, " ")}
                {rule.rule_type !== "fuzzy_match" && rule.rule_value ? (
                  <span className="ml-1 text-[10px] text-amber-300/90">({rule.rule_value})</span>
                ) : null}
              </div>
              <div className="col-span-1 flex justify-center">
                <CustomToggle
                  isActive={rule.is_active}
                  onToggle={() => handleToggle(rule.rule_id, rule.is_active)}
                  variant={variant}
                />
              </div>
              <div className="col-span-2 flex justify-end gap-4 text-[#9ab0d1]">
                <Edit2 size={16} className="hover:text-[#4f8cff] cursor-pointer" onClick={() => handleEditClick(rule)} />
                <Trash2 size={16} className="hover:text-red-400 cursor-pointer" onClick={() => handleDelete(rule.rule_id)} />
              </div>
            </div>
          ))}

          {!showAddForm ? (
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowAddForm(true);
              }}
              className={`w-full py-3 border border-dashed text-xs uppercase tracking-widest flex items-center justify-center gap-2 ${
                ent
                  ? "border-[#2a3f63] text-[#9ab0d1] hover:border-[#4f8cff] hover:text-[#d7e3f7]"
                  : "border-[#A1A3AF] text-gray-500 hover:border-[#23243B]"
              }`}
            >
              <Plus size={16} /> Add rule
            </button>
          ) : (
            <div className={`p-4 border rounded-lg space-y-4 ${ent ? "bg-[#0a1424] border-[#2a3f63]" : "bg-[#F8F8F8] border-[#A1A3AF]/20"}`}>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-widest text-[#d7e3f7]">
                  {editingRuleId ? "Edit rule" : "New rule"}
                </span>
                <button type="button" onClick={resetForm} className="text-[#9ab0d1] hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div
                className={`grid gap-4 ${
                  RULES_REQUIRING_INPUT.includes(newRuleData.rule_type) ? "sm:grid-cols-4" : "sm:grid-cols-3"
                }`}
              >
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Column</label>
                  <select className={inputCls} onChange={handleColumnSelect} value={newRuleData.column_name} disabled={!!editingRuleId}>
                    <option value="">Select column…</option>
                    {columns.map((col) => (
                      <option key={col.column_name} value={col.column_name}>
                        {col.column_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Data type</label>
                  <input className={`${inputCls} opacity-70`} value={detectedType || "AUTO"} readOnly />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Condition</label>
                  <select
                    className={inputCls}
                    onChange={(e) => setNewRuleData({ ...newRuleData, rule_type: e.target.value })}
                    value={newRuleData.rule_type}
                    disabled={!detectedType}
                  >
                    <option value="">Select rule…</option>
                    {detectedType &&
                      RULE_TYPES[detectedType]?.map((r) => (
                        <option key={r} value={r}>
                          {r.replace(/_/g, " ")}
                        </option>
                      ))}
                  </select>
                </div>
                {renderDynamicInput()}
              </div>

              {newRuleData.rule_type === "fuzzy_match" ? (
                <div className="rounded border border-[#2a3f63] p-3 bg-[#0f1b31]">
                  <span className={labelCls}>Master data list</span>
                  <div className="flex gap-2 mt-2 mb-2">
                    <input
                      className={inputCls}
                      placeholder="Enter value…"
                      value={masterInput}
                      onChange={(e) => setMasterInput(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (masterInput) {
                          setMasterData([...masterData, masterInput]);
                          setMasterInput("");
                        }
                      }}
                      className="shrink-0 bg-[#2a4a7a] text-white px-3 py-2 text-xs uppercase font-bold rounded"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {masterData.map((val, i) => (
                      <span key={i} className="text-[11px] px-2 py-1 bg-[#132542] border border-[#2a3f63] flex items-center gap-1">
                        {val}
                        <X size={10} className="cursor-pointer hover:text-red-400" onClick={() => setMasterData(masterData.filter((m) => m !== val))} />
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleSaveRule}
                className="w-full py-3 bg-[#2a4a7a] text-white text-xs font-bold uppercase tracking-widest hover:bg-[#3a5a8a] flex items-center justify-center gap-2 rounded"
              >
                <Save size={16} />
                {editingRuleId ? "Update rule" : "Save rule"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Plus, Save, X, Trash2, HelpCircle } from "lucide-react";
import { RULE_TYPES, RULES_REQUIRING_INPUT, getRulePlaceholder } from "./rulesConfig";
import CustomToggle from "./CustomToggle";

function normalizeDataType(dt) {
  if (!dt) return "";
  const s = String(dt).trim();
  if (RULE_TYPES[s]) return s;
  const cap = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if (RULE_TYPES[cap]) return cap;
  if (s.toLowerCase() === "int") return "Integer";
  return cap;
}

function emptyRow() {
  return {
    key: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    column_name: "",
    rule_type: "",
    rule_value: "",
    data_type: "",
    is_active: true,
    rangeMin: "",
    rangeMax: "",
  };
}

function rulesToDraftRows(rules) {
  if (!Array.isArray(rules) || !rules.length) return [emptyRow()];
  return rules.map((rule) => {
    let rangeMin = "";
    let rangeMax = "";
    if (rule.rule_type === "range" && rule.rule_value?.includes("-")) {
      [rangeMin, rangeMax] = rule.rule_value.split("-");
    }
    return {
      key: `rule-${rule.rule_id}`,
      column_name: rule.column_name || "",
      rule_type: rule.rule_type || "",
      rule_value: rule.rule_value || "",
      data_type: normalizeDataType(rule.data_type),
      is_active: rule.is_active !== false,
      rangeMin,
      rangeMax,
    };
  });
}

function draftRowsToPayload(rows) {
  return rows
    .filter((r) => r.column_name && r.rule_type)
    .map((r) => {
      let rule_value = r.rule_value;
      if (r.rule_type === "range") {
        rule_value = `${r.rangeMin}-${r.rangeMax}`;
      }
      if (r.rule_type === "fuzzy_match") {
        rule_value = "80";
      }
      return {
        column_name: r.column_name,
        rule_type: r.rule_type,
        data_type: r.data_type || "String",
        rule_value: rule_value || null,
        is_active: Boolean(r.is_active),
        master_data: [],
      };
    });
}

export default function MultiRuleConfigForm({
  columns,
  initialRules = [],
  onSave,
  onCancel,
  saving = false,
  title = "Rule configuration",
}) {
  const [rows, setRows] = useState(() => rulesToDraftRows(initialRules));

  useEffect(() => {
    setRows(rulesToDraftRows(initialRules));
  }, [initialRules]);

  const updateRow = (key, patch) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const handleColumnChange = (key, columnName) => {
    const col = columns.find((c) => c.column_name === columnName);
    updateRow(key, {
      column_name: columnName,
      data_type: normalizeDataType(col?.data_type),
      rule_type: "",
      rule_value: "",
      rangeMin: "",
      rangeMax: "",
    });
  };

  const removeRow = (key) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length ? next : [emptyRow()];
    });
  };

  const handleSave = () => {
    const payload = draftRowsToPayload(rows);
    if (!payload.length) {
      window.alert("Add at least one column rule before saving.");
      return;
    }
    for (const row of rows.filter((r) => r.column_name && r.rule_type)) {
      if (row.rule_type === "range" && (!row.rangeMin || !row.rangeMax)) {
        window.alert("Please enter both Min and Max for range rules.");
        return;
      }
    }
    onSave(payload);
  };

  const renderValueInput = (row) => {
    if (!RULES_REQUIRING_INPUT.includes(row.rule_type)) return null;
    if (row.rule_type === "range") {
      return (
        <div className="flex items-center gap-2">
          <input
            className="w-full bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B] text-center"
            placeholder="Min"
            value={row.rangeMin}
            onChange={(e) => updateRow(row.key, { rangeMin: e.target.value })}
            type="number"
          />
          <span className="text-gray-400">-</span>
          <input
            className="w-full bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B] text-center"
            placeholder="Max"
            value={row.rangeMax}
            onChange={(e) => updateRow(row.key, { rangeMax: e.target.value })}
            type="number"
          />
        </div>
      );
    }
    if (["before_date", "after_date"].includes(row.rule_type)) {
      return (
        <input
          className="w-full bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B]"
          type="date"
          value={row.rule_value}
          onChange={(e) => updateRow(row.key, { rule_value: e.target.value })}
        />
      );
    }
    return (
      <input
        className="w-full bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B]"
        placeholder={getRulePlaceholder(row.rule_type)}
        value={row.rule_value}
        onChange={(e) => updateRow(row.key, { rule_value: e.target.value })}
      />
    );
  };

  return (
    <div className="mt-6 bg-[#F8F8F8] p-6 border border-[#A1A3AF] border-opacity-20 animate-in fade-in slide-in-from-top-2">
      <div className="flex justify-between items-center mb-6">
        <span className="text-sm font-bold uppercase tracking-widest text-[#23243B]">{title}</span>
        <button type="button" onClick={onCancel} className="text-gray-500 hover:text-red-500">
          <X size={18} />
        </button>
      </div>

      <div className="space-y-4">
        {rows.map((row, idx) => (
          <div
            key={row.key}
            className="grid grid-cols-12 gap-3 items-end border-b border-gray-200 pb-4"
          >
            <div className="col-span-1 text-xs text-gray-400 pt-2">{String(idx + 1).padStart(2, "0")}</div>
            <div className="col-span-3 flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Column</label>
              <select
                className="bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B]"
                value={row.column_name}
                onChange={(e) => handleColumnChange(row.key, e.target.value)}
              >
                <option value="">Select…</option>
                {columns.map((col) => (
                  <option key={col.column_name} value={col.column_name}>
                    {col.column_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Type</label>
              <input
                className="bg-transparent border-b border-[#A1A3AF] p-2 text-sm text-gray-400"
                value={row.data_type || "—"}
                readOnly
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Condition</label>
              <select
                className="bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B]"
                value={row.rule_type}
                disabled={!row.data_type}
                onChange={(e) =>
                  updateRow(row.key, {
                    rule_type: e.target.value,
                    rule_value: "",
                    rangeMin: "",
                    rangeMax: "",
                  })
                }
              >
                <option value="">Select…</option>
                {row.data_type &&
                  RULE_TYPES[row.data_type]?.map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </option>
                  ))}
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold flex items-center gap-1">
                Value <HelpCircle size={10} className="text-gray-400" />
              </label>
              {renderValueInput(row) || (
                <span className="text-xs text-gray-400 p-2">—</span>
              )}
            </div>
            <div className="col-span-1 flex flex-col items-center gap-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">On</label>
              <CustomToggle
                isActive={row.is_active}
                onToggle={() => updateRow(row.key, { is_active: !row.is_active })}
              />
            </div>
            <div className="col-span-1 flex justify-end pb-1">
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                className="text-gray-400 hover:text-red-600"
                title="Remove row"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, emptyRow()])}
        className="mt-4 w-full py-2 border border-dashed border-[#A1A3AF] text-xs uppercase tracking-widest text-gray-500 hover:border-[#23243B] hover:text-[#23243B] flex items-center justify-center gap-2"
      >
        <Plus size={14} /> Add column rule
      </button>

      <button
        type="button"
        disabled={saving}
        onClick={handleSave}
        className="mt-4 w-full py-4 bg-[#23243B] text-white text-sm font-bold uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <Save size={16} />
        {saving ? "Saving…" : "Save configuration"}
      </button>
    </div>
  );
}

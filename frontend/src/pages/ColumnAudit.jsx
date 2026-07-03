import React, { useState, useEffect } from "react";
import { getColumnStats, renameColumn, standardizeDates } from "../api";
// 1. ADD Wand2 to your imports
import { Edit2, Check, X, Wand2 } from "lucide-react";

const ColumnAudit = ({ tableId, readOnly = false }) => {
  const [columns, setColumns] = useState([]);
  const [editingCol, setEditingCol] = useState(null);
  const [newName, setNewName] = useState("");

  const fetchStats = async () => {
    try {
      const res = await getColumnStats(tableId);
      setColumns(res.data);
    } catch (err) {
      console.error("Stats fetch failed", err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [tableId]);

  // 2. ADD this placeholder function for the format logic
  const handleAutoFormat = async (columnName) => {
    if (
      window.confirm(
        `Standardize all date separators in '${columnName}' to match your rule?`,
      )
    ) {
      try {
        // Show a little loading state if you want, but this is usually fast
        await standardizeDates(tableId, columnName);

        alert("Dates standardized! Re-running stats...");

        // Refresh the UI to show the updated "Good" rows count
        fetchStats();
      } catch (err) {
        alert(
          "Format failed: Make sure you have a Date Format rule active for this column.",
        );
      }
    }
  };

  const handleRename = async (oldName) => {
    if (!newName || oldName === newName) {
      setEditingCol(null);
      return;
    }
    if (
      window.confirm(
        `Rename '${oldName}' to '${newName}'? Rules will migrate automatically.`,
      )
    ) {
      try {
        await renameColumn(tableId, oldName, newName);
        setEditingCol(null);
        fetchStats();
      } catch (err) {
        alert("Rename failed.");
      }
    }
  };

  return (
    <div className="bg-[#F8F8F8] p-4 border-t border-gray-200">
      <div className="flex flex-col gap-2">
        {/* HEADER ROW for Columns */}
        <div className="px-4 py-2 flex items-center justify-between text-sm uppercase tracking-widest text-gray-400 font-medium">
          <div className="w-1/4">Columns</div>
          <div className="flex gap-14 w-2/3 justify-end pr-8 text-xs tracking-normal">
            <span className="w-16 text-center">Total</span>
            <span className="w-16 text-center text-green-600">Good</span>
            <span className="w-16 text-center text-red-600">Errors</span>
            <span className="w-20 text-center text-blue-600">Quality</span>
          </div>
        </div>

        {/* COLUMN ROWS */}
        {columns.map((col) => {
          // 1. Log to console so you can see why it's hiding
          console.log(`Column: ${col.column_name}, Type: ${col.data_type}`);

          return (
            <div
              key={col.column_name}
              className="bg-white border border-gray-200 p-4 flex items-center justify-between hover:border-black transition-colors shadow-sm"
            >
              <div className="flex items-center gap-3 w-1/4">
                {editingCol === col.column_name ? (
                  <div className="flex items-center gap-2">
                    <input
                      className="border-b-2 border-black outline-none text-sm font-bold uppercase tracking-wide bg-transparent w-full"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      autoFocus
                    />
                    <button
                      onClick={() => handleRename(col.column_name)}
                      className="text-green-500 hover:scale-110"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => setEditingCol(null)}
                      className="text-red-400 hover:scale-110"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold uppercase tracking-wider text-[#23243B]">
                      {col.column_name}
                    </span>

                    {!readOnly && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingCol(col.column_name);
                            setNewName(col.column_name);
                          }}
                          className="text-gray-400 cursor-pointer hover:text-black transition-colors p-1"
                          title="Rename Column"
                        >
                          <Edit2 size={14} />
                        </button>

                        {/* 2. BULLETPROOF CHECK: Case-insensitive and handles undefined */}
                        {(col.data_type?.toLowerCase() === "date" ||
                          col.column_name.toLowerCase().includes("date") ||
                          col.column_name.includes("D.O.B")) && (
                          <button
                            onClick={() => handleAutoFormat(col.column_name)}
                            className="text-blue-400 cursor-pointer hover:text-blue-600 transition-colors p-1"
                            title="Auto-Format Dates"
                          >
                            <Wand2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-14 text-sm w-2/3 justify-end pr-8">
                <div className="w-16 text-center">
                  <b className="text-gray-600">{col.total}</b>
                </div>
                <div className="w-16 text-center">
                  <b className="text-green-600">{col.good}</b>
                </div>
                <div className="w-16 text-center">
                  <b className="text-red-600">{col.errors}</b>
                </div>
                <div className="w-20 text-center">
                  <b className="text-black">{col.quality_pct}%</b>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ColumnAudit;

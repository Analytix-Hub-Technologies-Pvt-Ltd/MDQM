import React, { useState, useEffect } from "react";
import {
  getFuzzyDetails,
  addToMasterData,
  replaceFuzzyValue,
  removeMasterValue,
} from "../api";
import { ArrowLeft, Trash2, Plus, Database, ReplaceAll, X } from "lucide-react";

export default function FuzzyErrors({ jobId, tableId, onBack }) {
  const [data, setData] = useState({
    table_name: "",
    threshold: 0,
    total_fuzzy_errors: 0,
    master_list: [],
    all_columns: [],
    data: [],
  });
  const [loading, setLoading] = useState(true);

  // Requirement 14 Dropdown State
  const [filterTier, setFilterTier] = useState("below"); // "below", "threshold-90", "above-90"

  // Master Modal State
  const [showMasterModal, setShowMasterModal] = useState(false);
  const [newMasterInput, setNewMasterInput] = useState("");

  useEffect(() => {
    fetchData();
  }, [jobId, tableId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getFuzzyDetails(jobId, tableId);
      setData(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to load fuzzy data. Ensure a fuzzy rule is configured.");
    }
    setLoading(false);
  };

  const handleAddToMaster = async (value) => {
    try {
      await addToMasterData(jobId, tableId, value);
      setNewMasterInput("");
      fetchData(); // Refresh to recalculate scores live!
    } catch (err) {
      alert("Failed to add to master data");
    }
  };

  const handleDeleteFromMaster = async (valueToRemove) => {
    if (!window.confirm(`Remove "${valueToRemove}" from approved list?`))
      return;
    try {
      // Use the new API function
      await removeMasterValue(jobId, tableId, valueToRemove);

      // Refresh the local data to show the change
      fetchData();
    } catch (err) {
      alert("Failed to delete master value");
    }
  };

  const handleReplaceInCsv = async (rowId, newValue) => {
    try {
      await replaceFuzzyValue(
        jobId,
        tableId,
        rowId,
        data.column_name,
        newValue,
      );
      fetchData(); // Refresh
    } catch (err) {
      alert("Failed to replace in CSV");
    }
  };

  // Filter Logic based on Dropdown
  const filteredData = data.data.filter((row) => {
    if (filterTier === "below") return row.score < data.threshold;
    if (filterTier === "threshold-90")
      return row.score >= data.threshold && row.score <= 90;
    if (filterTier === "above-90") return row.score > 90;
    return true;
  });

  if (loading)
    return (
      <div className="p-10 font-mono text-gray-500 uppercase">
        Analyzing Fuzzy Matches...
      </div>
    );

  return (
    <div className="flex-1 bg-[#FBFBFB] text-[#23243B] h-screen overflow-y-auto">
      {/* HEADER */}
      <div className="p-6 border-b border-[#A1A3AF] border-opacity-20 bg-white sticky top-0 z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-md font-normal tracking-wide text-gray-500 hover:text-black mb-4"
        >
          <ArrowLeft size={16} /> Back to Quarantine List
        </button>

        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-thin tracking-tighter uppercase flex items-center gap-3">
              Fuzzy Match Analysis
            </h1>
            <p className="text-sm text-gray-400 tracking-widest uppercase mt-4">
              TABLE:{" "}
              <span className="text-[#23243B] font-normal">
                {data.table_name}
              </span>{" "}
              • COLUMN:{" "}
              <span className="text-[#23243B] font-normal">
                {data.column_name}
              </span>
            </p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setShowMasterModal(true)}
              className="bg-[#23243B] text-white px-6 py-3 text-md font-semibold uppercase tracking-widest hover:bg-black flex items-center gap-2"
            >
              <Database size={14} /> Master Name Config
            </button>
            <div className="bg-white border border-[#23243B] px-6 py-3">
              <span className="block text-[12px] uppercase tracking-widest text-gray-600 font-normal mb-1">
                Errors (&lt; {data.threshold}%)
              </span>
              <span className="text-2xl font-bold text-[#23243B]">
                {data.total_fuzzy_errors}
              </span>
            </div>
          </div>
        </div>

        {/* REQUIREMENT 14: DROPDOWN FILTER */}
        <div className="mt-6 flex items-center gap-4">
          <label className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Filter View:
          </label>
          <select
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value)}
            className="border border-[#23243B] bg-white p-2 text-sm outline-none font-bold text-purple-700"
          >
            <option value="below">
              Below Threshold (&lt; {data.threshold}%)
            </option>
            <option value="threshold-90">
              Threshold to 90% ({data.threshold}% - 90%)
            </option>
            <option value="above-90">Above 90% (&gt; 90%)</option>
          </select>
        </div>
      </div>

      {/* GRID */}
      <div className="p-6">
        <div className="overflow-x-auto border border-[#A1A3AF] border-opacity-20 shadow-sm bg-white">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#23243B] text-white text-[12px] font-normal uppercase tracking-widest">
                {data.all_columns.map((col) => (
                  <th key={col} className="p-4 border-r border-gray-600">
                    {col}
                  </th>
                ))}
                <th className="p-4 border-r border-gray-600 bg-purple-700">
                  Best Master Match
                </th>
                <th className="p-4 border-r border-gray-600 bg-purple-700">
                  Match %
                </th>
                <th className="p-4 bg-purple-700 text-center">
                  Resolution Actions
                </th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filteredData.map((row) => (
                <tr
                  key={row.row_id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  {/* Dynamic Columns */}
                  {data.all_columns.map((col) => {
                    const isTargetCol = col === data.column_name;
                    return (
                      <td
                        key={col}
                        className={`p-4 border-r border-gray-100 ${isTargetCol && row.is_error ? "bg-red-50 text-red-600 font-bold" : ""}`}
                      >
                        {row.row_data[col]}
                      </td>
                    );
                  })}

                  {/* Metadata Columns */}
                  <td className="p-4 border-r border-gray-100 font-bold text-gray-700">
                    {row.best_match}
                  </td>
                  <td className="p-4 border-r border-gray-100 font-bold text-purple-600">
                    {row.score}%
                  </td>

                  {/* Actions */}
                  <td className="p-4 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => handleAddToMaster(row.original_value)}
                        className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-colors"
                        title="Add this exact string to Master Table"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        onClick={() =>
                          handleReplaceInCsv(row.row_id, row.best_match)
                        }
                        disabled={row.best_match === "None"}
                        className={`p-2 transition-colors ${row.best_match === "None" ? "bg-gray-50 text-gray-300" : "bg-purple-50 text-purple-600 hover:bg-purple-600 hover:text-white"}`}
                        title="Replace CSV value with the Best Match"
                      >
                        <ReplaceAll size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td
                    colSpan={data.all_columns.length + 3}
                    className="p-8 text-center text-gray-400"
                  >
                    No data found in this threshold tier.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MASTER DATA MODAL */}
      {showMasterModal && (
        <div className="fixed inset-0  flex items-center justify-center z-50 p-4">
          <div className="bg-white w-125 border border-[#23243B] shadow-2xl flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-[#FBFBFB]">
              <span className="font-bold uppercase tracking-widest text-purple-700 flex items-center gap-2">
                <Database size={16} /> Master Name
              </span>
              <X
                size={20}
                className="cursor-pointer hover:text-red-500"
                onClick={() => setShowMasterModal(false)}
              />
            </div>
            <div className="p-6">
              <div className="flex gap-2 mb-6">
                <input
                  className="flex-1 bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-purple-600"
                  placeholder="Add new approved string..."
                  value={newMasterInput}
                  onChange={(e) => setNewMasterInput(e.target.value)}
                />
                <button
                  onClick={() => handleAddToMaster(newMasterInput)}
                  className="bg-purple-600 text-white px-4 py-2 text-xs font-bold uppercase hover:bg-purple-800"
                >
                  Add
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto border border-gray-100">
                {data.master_list.length > 0 ? (
                  data.master_list.map((m, i) => (
                    <div
                      key={i}
                      className="p-3 border-b border-gray-100 text-sm hover:bg-gray-50 flex justify-between items-center group"
                    >
                      <span className="font-medium text-gray-700">{m}</span>

                      <button
                        onClick={() => handleDeleteFromMaster(m)}
                        className="flex items-center gap-1 text-red-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete from Master"
                      >
                        <Trash2 size={14} />
                        <span className="text-[10px] font-bold uppercase">
                          Delete
                        </span>
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-gray-400 text-xs italic">
                    No master strings found
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

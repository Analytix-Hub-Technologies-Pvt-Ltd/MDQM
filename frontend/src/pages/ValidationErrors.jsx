import React, { useState, useEffect } from "react";
import {
  getValidationDetails,
  updateQuarantineError,
  deleteQuarantineError,
} from "../api";
import { ArrowLeft, Edit2, Trash2, Save, X, AlertTriangle } from "lucide-react";

export default function ValidationErrors({ jobId, tableId, onBack }) {
  const [data, setData] = useState({
    table_name: "",
    total_errors: 0,
    all_columns: [],
    errors: [],
  });
  const [loading, setLoading] = useState(true);

  // Edit States
  const [editingLogId, setEditingLogId] = useState(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    fetchData();
  }, [jobId, tableId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getValidationDetails(jobId, tableId);
      setData(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleEditClick = (logId, currentValue) => {
    setEditingLogId(logId);
    setEditValue(currentValue);
  };

  const handleSave = async (logId) => {
    try {
      await updateQuarantineError(logId, editValue);
      setEditingLogId(null);
      fetchData(); // Refresh the grid
    } catch (err) {
      // THIS will now pop up an alert with the EXACT reason it failed
      alert("Failed to update: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (logId) => {
    if (!window.confirm("Are you sure you want to delete this error log?"))
      return;
    try {
      await deleteQuarantineError(logId);
      fetchData(); // Refresh the grid
    } catch (err) {
      alert("Failed to delete error");
    }
  };

  if (loading)
    return (
      <div className="p-10 font-mono text-gray-500 uppercase">
        Loading Quarantine Data...
      </div>
    );

  return (
    <div className="flex-1 bg-[#FBFBFB] text-[#23243B] h-screen overflow-y-auto">
      {/* HEADER: Requirement 13.a, 13.b, 13.c */}
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
             Validation Errors
            </h1>
            <p className="text-sm text-gray-400 tracking-widest uppercase mt-4">
              TABLE:{" "}
              <span className="text-[#23243B] font-normmal">
                {data.table_name}
              </span>{" "}
              • ID: <span className="text-[#23243B] font-normal">{tableId}</span>
            </p>
          </div>
          <div className="bg-white border border-[#23243B] px-6 py-3">
            <span className="block text-[12px] uppercase tracking-widest text-gray-600 font-normal mb-1">
              Total Error Rows
            </span>
            <span className="text-2xl font-bold text-[#23243B]">
              {data.total_errors}
            </span>
          </div>
        </div>
      </div>

      {/* ERROR GRID */}
      <div className="p-6">
        <div className="overflow-x-auto border border-[#A1A3AF] border-opacity-20 shadow-sm bg-white">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#23243B] text-white text-[12px] font-normal uppercase tracking-widest">
                {/* Requirement 13.d: All columns */}
                {data.all_columns.map((col) => (
                  <th
                    key={col}
                    className="p-4 border-r border-gray-600 whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
                {/* Requirement 13.e & 13.f: New Columns */}
                <th className="p-4 border-r border-gray-600 bg-orange-700">
                  Data Type
                </th>
                <th className="p-4 border-r border-gray-600 bg-orange-700">
                  Error Description
                </th>
                {/* Requirement 13.g: Actions */}
                <th className="p-4 bg-orange-700 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {data.errors.map((err) => (
                <tr
                  key={err.log_id}
                  className="border-b border-gray-100"
                >
                  {/* Render all the dynamic columns */}
                  {data.all_columns.map((col) => {
                    const isErrorCol = col === err.error_column;
                    const cellValue =
                      err.row_data[col] ||
                      (isErrorCol ? err.error_value : "---");

                    return (
                      <td
                        key={col}
                        className={`p-4 border-r border-gray-100 ${isErrorCol ? "bg-red-50" : ""}`}
                      >
                        {/* Highlight and Edit Logic for the Error Column */}
                        {isErrorCol ? (
                          editingLogId === err.log_id ? (
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full p-2 border border-red-400 outline-none text-red-700 font-bold bg-white"
                              autoFocus
                            />
                          ) : (
                            <span className="text-red-600 font-bold border-b border-red-300 border-dashed pb-1">
                              {err.error_value === "nan"
                                ? "[BLANK]"
                                : err.error_value}
                            </span>
                          )
                        ) : (
                          <span className="text-gray-600">{cellValue}</span>
                        )}
                      </td>
                    );
                  })}

                  {/* The Metadata Columns */}
                  <td className="p-4 border-r border-gray-100 font-bold text-gray-500 bg-gray-50">
                    {err.data_type}
                  </td>
                  <td className="p-4 border-r border-gray-100 text-red-500">
                    {err.description}
                  </td>

                  {/* Action Buttons */}
                  <td className="p-4 text-center">
                    {editingLogId === err.log_id ? (
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => handleSave(err.log_id)}
                          className="p-2 bg-green-100 text-green-700 hover:bg-green-600 hover:text-white transition-colors"
                          title="Save"
                        >
                          <Save size={14} />
                        </button>
                        <button
                          onClick={() => setEditingLogId(null)}
                          className="p-2 bg-gray-100 text-gray-600 hover:bg-gray-300 transition-colors"
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() =>
                            handleEditClick(err.log_id, err.error_value)
                          }
                          className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-colors"
                          title="Edit Value"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(err.log_id)}
                          className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                          title="Delete Error"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {data.errors.length === 0 && (
                <tr>
                  <td
                    colSpan={data.all_columns.length + 3}
                    className="p-8 text-center text-gray-400"
                  >
                    No validation errors remaining!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import {
  getAllJobs,
  getTablesByJob,
  runJobEngine,
  deleteJob,
  deleteTable,
  renameJob,
  renameTable,
  createNewJob,
  uploadCsvToJob,
} from "../api";
import {
  ChevronRight,
  ChevronDown,
  Play,
  MoreVertical,
  Plus,
  FileText,
  Database,
  FolderPlus,
  Download,
  Trash2,
  Edit2,
  X,
  Loader2,
} from "lucide-react";
import ColumnAudit from "./ColumnAudit";

export default function JobList() {
  const [jobs, setJobs] = useState([]);
  const [tables, setTables] = useState({});
  const [expandedJob, setExpandedJob] = useState(null);

  // Modals & Menus
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalTab, setAddModalTab] = useState("create"); // create, import, connect
  const [actionMenu, setActionMenu] = useState({ type: null, id: null }); // type: 'job'|'table'
  const [renameModal, setRenameModal] = useState({
    isOpen: false,
    type: null,
    id: null,
    currentName: "",
    newName: "",
  });

  // Add Form States
  const [newJobName, setNewJobName] = useState("");
  const [selectedJobForUpload, setSelectedJobForUpload] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [dbCreds, setDbCreds] = useState({
    host: "",
    port: "",
    user: "",
    pass: "",
    dbname: "",
  });

  // Add this near your other useState hooks
  const [expandedTables, setExpandedTables] = useState({});

  const toggleTableExpansion = (tableId) => {
    setExpandedTables((prev) => ({
      ...prev,
      [tableId]: !prev[tableId],
    }));
  };

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
    if (expandedJob === jobId) {
      setExpandedJob(null);
      return;
    }
    setExpandedJob(jobId);
    if (!tables[jobId]) {
      try {
        const res = await getTablesByJob(jobId);
        setTables((prev) => ({ ...prev, [jobId]: res.data }));
      } catch (err) {
        console.error(err);
      }
    }
  };

  // --- ACTIONS ---
  const handleRunJob = async (jobId, e) => {
    e.stopPropagation();
    try {
      await runJobEngine(jobId);
      alert("Job completed successfully!");

      // 1. Refresh the main job list stats
      fetchJobs();

      // 2. NEW: If this job's tables are currently open, refresh them too!
      if (expandedJob === jobId) {
        const res = await getTablesByJob(jobId);
        setTables((prev) => ({ ...prev, [jobId]: res.data }));
      }
    } catch (err) {
      alert("Error running job");
    }
  };

  const handleDelete = async (type, id) => {
    if (!window.confirm(`Are you sure you want to delete this ${type}?`))
      return;
    try {
      if (type === "job") {
        await deleteJob(id);
        fetchJobs(); // Refreshes the Job List
      }
      if (type === "table") {
        await deleteTable(id);
        // 1. Refresh the specific tables inside the accordion
        const res = await getTablesByJob(expandedJob);
        setTables((prev) => ({ ...prev, [expandedJob]: res.data }));

        // 2. NEW: Refresh the parent Jobs so the "Tables Attached" count updates!
        fetchJobs();
      }
    } catch (err) {
      alert(`Failed to delete ${type}`);
    }
    setActionMenu({ type: null, id: null });
  };

  const handleRenameSubmit = async () => {
    try {
      if (renameModal.type === "job") {
        await renameJob(renameModal.id, renameModal.newName);
        fetchJobs();
      }
      if (renameModal.type === "table") {
        await renameTable(renameModal.id, renameModal.newName);
        const res = await getTablesByJob(expandedJob);
        setTables((prev) => ({ ...prev, [expandedJob]: res.data }));
      }
      setRenameModal({
        isOpen: false,
        type: null,
        id: null,
        currentName: "",
        newName: "",
      });
    } catch (err) {
      alert(`Failed to rename ${renameModal.type}`);
    }
  };

  const handleCreateJob = async () => {
    if (!newJobName) return;
    try {
      await createNewJob(newJobName);
      fetchJobs();
      setShowAddModal(false);
      setNewJobName("");
    } catch (err) {
      alert("Failed to create job", err);
    }
  };

  const handleUploadCsv = async () => {
    if (!selectedJobForUpload || !uploadFile) return;
    try {
      await uploadCsvToJob(selectedJobForUpload, uploadFile);
      setShowAddModal(false);
      fetchJobs();
    } catch (err) {
      alert("Failed to upload file");
    }
  };

  const calcPercent = (good, total) =>
    total > 0 ? ((good / total) * 100).toFixed(1) : "0.0";

  return (
    <div className="flex-1 bg-[#FBFBFB] text-[#23243B] h-screen overflow-y-auto relative">
      {/* HEADER */}
      <div className="p-4 h-24 border-b border-[#A1A3AF] border-opacity-20 flex justify-between items-center pr-8">
        <h1 className="text-4xl pl-4 font-thin tracking-tighter uppercase">
          Job List
        </h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-[#23243B] text-white px-6 py-3 text-md font-semibold uppercase tracking-widest cursor-pointer hover:bg-black transition-colors flex items-center gap-2"
        >
          <Plus size={20} />
          NEW JOB
        </button>
      </div>

      <div className="p-8 flex flex-col gap-4">
        {jobs.map((job) => (
          <div
            key={job.job_id}
            className="border border-[#A1A3AF] border-opacity-20 bg-white shadow-sm relative"
          >
            {/* JOB CARD */}
            <div
              className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleJob(job.job_id)}
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                  {expandedJob === job.job_id ? (
                    <ChevronDown size={20} className="text-[#23243B]" />
                  ) : (
                    <ChevronRight size={20} className="text-gray-400" />
                  )}
                  <div>
                    <h2 className="text-xl font-medium uppercase tracking-wider text-[#23243B]">
                      {job.job_name}
                    </h2>
                    <span className="text-sm text-gray-400">
                      Job Id - {job.job_id} | Last run -{" "}
                      {job.end_time
                        ? job.end_time.split("T")[0] +
                          " " +
                          job.end_time.split("T")[1].substring(0, 8)
                        : "Never"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={(e) => handleRunJob(job.job_id, e)}
                    className="bg-green-600 cursor-pointer text-white px-6 py-3 text-md uppercase tracking-widest hover:bg-green-700 flex items-center gap-2"
                  >
                    ▷ Run Job
                  </button>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionMenu({ type: "job", id: job.job_id });
                      }}
                      className="p-2 hover:bg-gray-200 rounded-full"
                    >
                      <MoreVertical size={18} className="text-gray-500" />
                    </button>
                    {actionMenu.type === "job" &&
                      actionMenu.id === job.job_id && (
                        <div
                          className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 shadow-lg z-10 py-1"
                          onMouseLeave={() =>
                            setActionMenu({ type: null, id: null })
                          }
                        >
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenameModal({
                                isOpen: true,
                                type: "job",
                                id: job.job_id,
                                currentName: job.job_name,
                                newName: job.job_name,
                              });
                              setActionMenu({ type: null, id: null });
                            }}
                            className="px-4 py-2 text-xs uppercase tracking-wider hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                          >
                            <Edit2 size={12} /> Rename Job
                          </div>
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(
                                `http://localhost:8000/jobs/${job.job_id}/download?t=${Date.now()}`,
                                "_blank",
                              );
                              setActionMenu({ type: null, id: null });
                            }}
                            className="px-4 py-2 text-xs uppercase tracking-wider hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                          >
                            <Download size={12} /> Download Zip
                          </div>
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete("job", job.job_id);
                            }}
                            className="px-4 py-2 text-xs uppercase tracking-wider text-red-600 hover:bg-red-50 cursor-pointer flex items-center gap-2 border-t border-gray-100"
                          >
                            <Trash2 size={12} /> Delete Job
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              </div>

              {/* JOB STATS GRID */}
              <div className="grid grid-cols-6 gap-4 border-t border-gray-100 pt-4 text-sm">
                <div>
                  <span className="block text-gray-400 uppercase text-[12px] mb-1">
                    Time & Duration
                  </span>
                  <span className="font-bold">
                    {job.start_time
                      ? job.start_time.split("T")[1].substring(0, 8)
                      : "--:--"}{" "}
                    -{" "}
                    {job.end_time
                      ? job.end_time.split("T")[1].substring(0, 8)
                      : "--:--"}
                  </span>
                  <span className="block text-gray-400 mt-1">
                    {job.duration || "0s"}
                  </span>
                </div>
                <div>
                  <span className="block text-gray-400 uppercase text-[12px] mb-1">
                    Tables Attached
                  </span>
                  <span className="text-lg font-bold">
                    {job.total_tables || 0}
                  </span>
                </div>
                <div>
                  <span className="block text-gray-400 uppercase text-[12px] mb-1">
                    Total Rows
                  </span>
                  <span className="text-lg font-bold">
                    {job.total_rows || 0}
                  </span>
                </div>
                <div>
                  <span className="block text-gray-400 uppercase text-[12px] mb-1">
                    Good Rows
                  </span>
                  <span className="text-lg font-bold ">
                    {job.good_rows || 0}
                  </span>
                </div>
                <div>
                  <span className="block text-gray-400 uppercase text-[12px] mb-1">
                    Error Rows
                  </span>
                  <span className="text-lg font-bold ">
                    {job.error_rows || 0}
                  </span>
                </div>
                <div>
                  <span className="block text-gray-400 uppercase text-[12px] mb-1">
                    Data Quality (%)
                  </span>
                  <span className="text-xl font-bold ">
                    {calcPercent(job.good_rows, job.total_rows)}%
                  </span>
                </div>
              </div>
            </div>

            {/* EXPANDED TABLES LIST */}
            {expandedJob === job.job_id && (
              <div className="bg-[#F8F8F8] border-t border-[#A1A3AF] border-opacity-20 p-6">
                <h3 className="text-sm font-medium uppercase tracking-widest text-gray-400 mb-4">
                  Tables
                </h3>
                <div className="flex flex-col gap-2">
                  {tables[job.job_id]?.map((table) => (
                    <div
                      key={table.table_id}
                      className="flex flex-col gap-1 mb-2"
                    >
                      {/* THE TABLE ROW */}
                      <div
                        onClick={() => toggleTableExpansion(table.table_id)}
                        className="bg-white border border-gray-200 p-4 flex items-center justify-between hover:border-[#23243B] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 w-1/4">
                          {/* Toggle Icon */}
                          {expandedTables[table.table_id] ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} className="text-gray-400" />
                          )}
                          <div>
                            <span className="text-sm font-medium uppercase block">
                              {table.table_name}
                            </span>
                            <span className="text-[12px] text-gray-400">
                              ID - {table.table_id} | Runtime -{" "}
                              {table.duration || "0s"}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-14 text-sm w-2/3 justify-end pr-8">
                          <div className="text-center">
                            <span className="block text-gray-400 text-[12px] uppercase">
                              Rows
                            </span>
                            <b>{table.row_count}</b>
                          </div>
                          <div className="text-center">
                            <span className="block text-green-600 text-[12px] uppercase">
                              Good
                            </span>
                            <b>{table.good_rows || 0}</b>
                          </div>
                          <div className="text-center">
                            <span className="block text-red-600 text-[12px] uppercase">
                              Errors
                            </span>
                            <b>{table.error_rows || 0}</b>
                          </div>
                          <div className="text-center">
                            <span className="block text-blue-600 text-[12px] uppercase">
                              Quality
                            </span>
                            <b>
                              {calcPercent(table.good_rows, table.row_count)}%
                            </b>
                          </div>
                        </div>

                        {/* Table 3-Dots Menu */}
                        <div
                          className="relative"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() =>
                              setActionMenu({
                                type: "table",
                                id: table.table_id,
                              })
                            }
                            className="p-1 hover:bg-gray-200 rounded-full"
                          >
                            <MoreVertical size={20} className="text-gray-400" />
                          </button>
                          {actionMenu.type === "table" &&
                            actionMenu.id === table.table_id && (
                              <div
                                className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 shadow-lg z-10 py-1"
                                onMouseLeave={() =>
                                  setActionMenu({ type: null, id: null })
                                }
                              >
                                <div
                                  onClick={() => {
                                    setRenameModal({
                                      isOpen: true,
                                      type: "table",
                                      id: table.table_id,
                                      currentName: table.table_name,
                                      newName: table.table_name,
                                    });
                                    setActionMenu({ type: null, id: null });
                                  }}
                                  className="px-4 py-2 text-xs uppercase tracking-wider hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                                >
                                  <Edit2 size={12} /> Rename Table
                                </div>
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(
                                      `http://localhost:8000/tables/${table.table_id}/download?t=${Date.now()}`,
                                      "_blank",
                                    );
                                    setActionMenu({ type: null, id: null });
                                  }}
                                  className="px-4 py-2 text-xs uppercase tracking-wider hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                                >
                                  <Download size={12} /> Download Excel
                                </div>
                                <div
                                  onClick={() =>
                                    handleDelete("table", table.table_id)
                                  }
                                  className="px-4 py-2 text-xs uppercase tracking-wider text-red-600 hover:bg-red-50 cursor-pointer flex items-center gap-2 border-t border-gray-100"
                                >
                                  <Trash2 size={12} /> Remove Table
                                </div>
                              </div>
                            )}
                        </div>
                      </div>

                      {/* THE COLUMN AUDIT (Conditional Rendering) */}
                      {expandedTables[table.table_id] && (
                        <div className="border-x border-b border-gray-200 animate-in fade-in slide-in-from-top-2 duration-200">
                          <ColumnAudit tableId={table.table_id} />
                        </div>
                      )}
                    </div>
                  ))}
                  {(!tables[job.job_id] || tables[job.job_id].length === 0) && (
                    <div className="text-center py-8 text-sm text-gray-400 uppercase tracking-widest border border-dashed border-gray-300">
                      No tables attached to this job.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* --- RENAME MODAL --- */}
      {renameModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 border border-[#23243B] w-96">
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4">
              Rename {renameModal.type}
            </h2>
            <input
              className="w-full bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B] mb-6"
              value={renameModal.newName}
              onChange={(e) =>
                setRenameModal({ ...renameModal, newName: e.target.value })
              }
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenameModal({ isOpen: false })}
                className="px-4 py-2 text-xs font-bold uppercase text-gray-500 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameSubmit}
                className="bg-[#23243B] text-white px-4 py-2 text-xs font-bold uppercase hover:bg-black"
              >
                Save Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ADD DATA MODAL --- */}
      {showAddModal && (
        <div className="fixed inset-0 bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-150 border border-[#23243B] shadow-2xl flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-[#FBFBFB]">
              <span className="font-bold uppercase tracking-widest text-[#23243B]">
                Add New Data Pipeline
              </span>
              <X
                size={20}
                className="cursor-pointer hover:text-red-500"
                onClick={() => setShowAddModal(false)}
              />
            </div>

            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setAddModalTab("create")}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest flex justify-center items-center gap-2 ${addModalTab === "create" ? "border-b-2 border-[#23243B] text-[#23243B]" : "text-gray-400 hover:bg-gray-50"}`}
              >
                <FolderPlus size={16} /> Create Job
              </button>
              <button
                onClick={() => setAddModalTab("import")}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest flex justify-center items-center gap-2 ${addModalTab === "import" ? "border-b-2 border-[#23243B] text-[#23243B]" : "text-gray-400 hover:bg-gray-50"}`}
              >
                <FileText size={16} /> Add Data
              </button>
              <button
                onClick={() => setAddModalTab("connect")}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest flex justify-center items-center gap-2 ${addModalTab === "connect" ? "border-b-2 border-[#23243B] text-[#23243B]" : "text-gray-400 hover:bg-gray-50"}`}
              >
                <Database size={16} /> Connect DB
              </button>
            </div>

            <div className="p-8">
              {/* TAB 1: CREATE JOB */}
              {addModalTab === "create" && (
                <div className="flex flex-col gap-6">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                      New Job Name
                    </label>
                    <input
                      className="w-full bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B]"
                      placeholder="e.g. CUSTOMER_DATA_CLEANUP"
                      value={newJobName}
                      onChange={(e) => setNewJobName(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={handleCreateJob}
                    className="w-full py-4 bg-[#23243B] text-white text-sm font-bold uppercase tracking-widest hover:bg-black"
                  >
                    Initialize Job
                  </button>
                </div>
              )}

              {/* TAB 2: IMPORT CSV */}
              {addModalTab === "import" && (
                <div className="flex flex-col gap-6">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 block">
                      Select Target Job
                    </label>
                    <select
                      className="w-full bg-transparent border-b border-[#A1A3AF] p-2 text-sm outline-none focus:border-[#23243B]"
                      value={selectedJobForUpload}
                      onChange={(e) => setSelectedJobForUpload(e.target.value)}
                    >
                      <option value="">Select a Job...</option>
                      {jobs.map((j) => (
                        <option key={j.job_id} value={j.job_id}>
                          {j.job_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 block">
                      Upload CSV File
                    </label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => setUploadFile(e.target.files[0])}
                      className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:border-0 file:text-xs file:font-bold file:uppercase file:bg-[#23243B] file:text-white hover:file:bg-black cursor-pointer"
                    />
                  </div>
                  <button
                    onClick={handleUploadCsv}
                    className="w-full mt-4 py-4 bg-[#23243B] text-white text-sm font-bold uppercase tracking-widest hover:bg-black"
                  >
                    Upload & Attach to Job
                  </button>
                </div>
              )}

              {/* TAB 3: CONNECT DB */}
              {addModalTab === "connect" && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase text-gray-500 font-bold">
                        Host
                      </label>
                      <input
                        className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none"
                        placeholder="localhost"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-gray-500 font-bold">
                        Port
                      </label>
                      <input
                        className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none"
                        placeholder="5432"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase text-gray-500 font-bold">
                        Username
                      </label>
                      <input
                        className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none"
                        placeholder="postgres"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-gray-500 font-bold">
                        Password
                      </label>
                      <input
                        type="password"
                        className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-gray-500 font-bold">
                      Database Name
                    </label>
                    <input
                      className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none"
                      placeholder="my_database"
                    />
                  </div>
                  <button className="w-full mt-2 py-4 bg-[#23243B] text-white text-sm font-bold uppercase tracking-widest hover:bg-black flex justify-center items-center gap-2">
                    <Database size={16} /> Authenticate & Fetch Schema
                  </button>
                  <span className="text-[10px] text-center text-gray-400 uppercase tracking-widest mt-2">
                    Note: Schema fetch requires backend endpoint configuration.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

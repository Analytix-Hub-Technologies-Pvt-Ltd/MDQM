import { useState, useEffect, useRef } from "react";
import {
  getAllJobs,
  getTablesByJob,
  getTableDetails,
  runJobEngine,
  deleteJob,
  deleteTable,
  renameJob,
  renameTable,
  addRule,
  createNewJob,
  uploadCsvToJob,
  previewCsvFile,
  connectToDb,
  listDatabases,
  listSavedConnections,
  saveDbConnection,
  testDbConnection,
} from "../api";
import {
  ChevronRight,
  ChevronDown,
  Play,
  MoreVertical,
  Plus,
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
  const [uploadFile, setUploadFile] = useState(null);
  const [previewColumns, setPreviewColumns] = useState([]);
  const [previewColumnTypes, setPreviewColumnTypes] = useState({});
  const [previewRows, setPreviewRows] = useState([]);
  const [previewEditable, setPreviewEditable] = useState([]);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const previewPageSize = 8;
  const [createDataMode, setCreateDataMode] = useState("file");
  const [dbCreds, setDbCreds] = useState({
    host: "",
    port: "",
    user: "",
    pass: "",
    dbname: "",
  });
  const [databaseOptions, setDatabaseOptions] = useState([
    "postgres",
    "mdms",
    "analytics_db",
    "customer_db",
  ]);
  const [selectedDatabases, setSelectedDatabases] = useState([]);
  const [savedConnections, setSavedConnections] = useState([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [connectionName, setConnectionName] = useState("");
  const [dbDropdownOpen, setDbDropdownOpen] = useState(false);
  const dbDropdownRef = useRef(null);

  // Add this near your other useState hooks
  const [expandedTables, setExpandedTables] = useState({});
  const [showRuleStep, setShowRuleStep] = useState(false);
  const [createdJobId, setCreatedJobId] = useState(null);
  const [createdTableId, setCreatedTableId] = useState(null);
  const [ruleColumns, setRuleColumns] = useState([]);
  const [ruleDrafts, setRuleDrafts] = useState({});
  const resetCreateFlow = () => {
    setShowAddModal(false);
    setNewJobName("");
    setUploadFile(null);
    setShowFilePreview(false);
    setPreviewColumns([]);
    setPreviewColumnTypes({});
    setPreviewRows([]);
    setPreviewEditable([]);
    setPreviewPage(1);
    setShowRuleStep(false);
    setCreatedJobId(null);
    setCreatedTableId(null);
    setRuleColumns([]);
    setRuleDrafts({});
  };


  const toggleTableExpansion = (tableId) => {
    setExpandedTables((prev) => ({
      ...prev,
      [tableId]: !prev[tableId],
    }));
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    if (showAddModal) {
      fetchSavedConnections();
    }
  }, [showAddModal]);

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

  const handleUploadCsv = async () => {
    if (!newJobName || !uploadFile) {
      alert("Enter a job name and choose a CSV file.");
      return;
    }
    try {
      const createRes = await createNewJob(newJobName);
      const jobId = createRes?.data?.job_id;
      if (!jobId) {
        throw new Error("Unable to create job");
      }
      await uploadCsvToJob(
        jobId,
        uploadFile,
        showFilePreview ? previewEditable : []
      );
      const tablesRes = await getTablesByJob(jobId);
      const createdTables = tablesRes?.data || [];
      const latestTable = [...createdTables].sort((a, b) => b.table_id - a.table_id)[0];
      if (!latestTable?.table_id) {
        throw new Error("Uploaded table not found for rule setup.");
      }
      const tableDetailsRes = await getTableDetails(jobId, latestTable.table_id);
      const cols = tableDetailsRes?.data?.columns || [];
      setCreatedJobId(jobId);
      setCreatedTableId(latestTable.table_id);
      setRuleColumns(cols);
      setRuleDrafts(
        cols.reduce((acc, col) => {
          acc[col.column_name] = { rule_type: "fuzzy_match", rule_value: "80", is_active: true };
          return acc;
        }, {})
      );
      setShowRuleStep(true);
      fetchJobs();
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to create job and upload file");
    }
  };

  const setRuleDraft = (columnName, key, value) => {
    setRuleDrafts((prev) => ({
      ...prev,
      [columnName]: {
        rule_type: "fuzzy_match",
        rule_value: "80",
        is_active: true,
        ...(prev[columnName] || {}),
        [key]: value,
      },
    }));
  };

  const handleAddRuleForColumn = async (column) => {
    if (!createdJobId || !createdTableId) return;
    const draft = ruleDrafts[column.column_name] || {
      rule_type: "fuzzy_match",
      rule_value: "80",
      is_active: true,
    };
    try {
      await addRule({
        job_id: createdJobId,
        table_id: createdTableId,
        column_name: column.column_name,
        rule_type: draft.rule_type,
        data_type: column.data_type || "String",
        rule_value: draft.rule_value || null,
        is_active: draft.is_active !== false,
        master_data: [],
      });
      alert(`Rule added for ${column.column_name}`);
    } catch (err) {
      alert(err?.response?.data?.detail || `Failed to add rule for ${column.column_name}`);
    }
  };

  const handlePreviewCsv = async () => {
    if (!uploadFile) {
      alert("Choose a CSV file first.");
      return;
    }
    try {
      const res = await previewCsvFile(uploadFile);
      const cols = res?.data?.columns || [];
      const types = res?.data?.column_types || {};
      const rows = res?.data?.rows || [];
      setPreviewColumns(cols);
      setPreviewColumnTypes(types);
      setPreviewRows(rows);
      setPreviewEditable(
        cols.map((col) => ({
          originalName: col,
          name: col,
          dataType: types[col] || "string",
          value: rows?.[0]?.[col] ?? "",
        }))
      );
      setPreviewPage(1);
      setShowFilePreview(true);
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to preview file.");
    }
  };

  const handleConnectDbPipeline = async () => {
    if (
      !newJobName ||
      !selectedConnectionId ||
      selectedDatabases.length === 0
    ) {
      alert("Please enter job name, choose a saved connection and select database(s).");
      return;
    }

    try {
      await connectToDb({
        job_name: newJobName,
        connection_id: Number(selectedConnectionId),
        dbnames: selectedDatabases,
      });
      alert("Job created from database successfully.");
      setShowAddModal(false);
      setNewJobName("");
      setDbCreds({ host: "", port: "", user: "", pass: "", dbname: "" });
      setDatabaseOptions([]);
      setSelectedDatabases([]);
      fetchJobs();
    } catch (err) {
      alert(
        err?.response?.data?.detail ||
          "Failed to connect database and create job."
      );
    }
  };

  const handleFetchDatabases = async () => {
    if (!selectedConnectionId) {
      alert("Please choose a saved connection first.");
      return;
    }
    try {
      const res = await listDatabases({
        connection_id: Number(selectedConnectionId),
      });
      const list = res?.data?.databases || [];
      setDatabaseOptions(list);
      if (list.length > 0) setSelectedDatabases([list[0]]);
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to fetch database list.");
    }
  };

  const fetchSavedConnections = async () => {
    try {
      const res = await listSavedConnections();
      const items = res?.data || [];
      setSavedConnections(items);
      if (items.length > 0 && !selectedConnectionId) {
        setSelectedConnectionId(String(items[0].connection_id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTestConnection = async () => {
    if (!dbCreds.host || !dbCreds.port || !dbCreds.user) {
      alert("Please fill host, port and username.");
      return;
    }
    try {
      await testDbConnection({
        host: dbCreds.host,
        port: dbCreds.port,
        user: dbCreds.user,
        pass: dbCreds.pass,
      });
      alert("Connection successful.");
    } catch (err) {
      alert(err?.response?.data?.detail || "Connection test failed.");
    }
  };

  const handleSaveConnection = async () => {
    if (!connectionName || !dbCreds.host || !dbCreds.port || !dbCreds.user) {
      alert("Fill connection name, host, port and username.");
      return;
    }
    try {
      await saveDbConnection({
        connection_name: connectionName,
        host: dbCreds.host,
        port: dbCreds.port,
        user: dbCreds.user,
        pass: dbCreds.pass,
      });
      alert("Connection saved.");
      setConnectionName("");
      await fetchSavedConnections();
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to save connection.");
    }
  };

  const toggleDatabaseSelection = (dbName) => {
    setSelectedDatabases((prev) =>
      prev.includes(dbName) ? prev.filter((d) => d !== dbName) : [...prev, dbName]
    );
  };

  const selectAllDatabases = () => setSelectedDatabases(databaseOptions);
  const clearSelectedDatabases = () => setSelectedDatabases([]);

  const handleEditableChange = (index, field, value) => {
    setPreviewEditable((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleApplyColumnUpdate = (index) => {
    const item = previewEditable[index];
    const oldCol = item.originalName;
    const newCol = item.name.trim() || oldCol;

    const nextRows = previewRows.map((row, rowIdx) => {
      const copy = { ...row };
      if (newCol !== oldCol) {
        copy[newCol] = copy[oldCol];
        delete copy[oldCol];
      }
      if (rowIdx === 0) copy[newCol] = item.value;
      return copy;
    });

    const nextColumns = previewColumns.map((c) => (c === oldCol ? newCol : c));
    const nextTypes = { ...previewColumnTypes };
    if (newCol !== oldCol) delete nextTypes[oldCol];
    nextTypes[newCol] = item.dataType || "string";

    setPreviewRows(nextRows);
    setPreviewColumns(nextColumns);
    setPreviewColumnTypes(nextTypes);
    setPreviewEditable((prev) =>
      prev.map((it, i) =>
        i === index
          ? { ...it, originalName: newCol, name: newCol, dataType: item.dataType, value: item.value }
          : it
      )
    );
  };

  const totalPreviewPages = Math.max(
    1,
    Math.ceil(previewEditable.length / previewPageSize)
  );
  const pagedPreview = previewEditable.slice(
    (previewPage - 1) * previewPageSize,
    previewPage * previewPageSize
  );

  useEffect(() => {
    const onClickOutside = (event) => {
      if (dbDropdownRef.current && !dbDropdownRef.current.contains(event.target)) {
        setDbDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

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
                    <span className={`inline-block mt-1 text-[10px] uppercase tracking-wider px-2 py-0.5 ${ (job.total_tables || 0) > 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                      {(job.total_tables || 0) > 0 ? "Ready" : "No Data"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={(e) => {
                      if ((job.total_tables || 0) === 0) {
                        e.stopPropagation();
                        alert("No tables attached to this job. Upload/import data first.");
                        return;
                      }
                      handleRunJob(job.job_id, e);
                    }}
                    className={`text-white px-6 py-3 text-md uppercase tracking-widest flex items-center gap-2 ${(job.total_tables || 0) === 0 ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 cursor-pointer hover:bg-green-700"}`}
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
                              if ((job.total_tables || 0) === 0) {
                                alert("No tables attached to this job. Upload/import data first.");
                                setActionMenu({ type: null, id: null });
                                return;
                              }
                              window.open(
                                `http://localhost:8000/jobs/${job.job_id}/download?t=${Date.now()}`,
                                "_blank",
                              );
                              setActionMenu({ type: null, id: null });
                            }}
                            className={`px-4 py-2 text-xs uppercase tracking-wider flex items-center gap-2 ${(job.total_tables || 0) === 0 ? "text-gray-400 cursor-not-allowed bg-gray-50" : "hover:bg-gray-100 cursor-pointer"}`}
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
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white w-full max-w-5xl border border-[#DADDE5] rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[96vh]">
            <div className="flex justify-between items-center p-5 border-b border-gray-200 bg-gradient-to-r from-[#FBFBFB] to-[#F3F4F8]">
              <span className="font-bold uppercase tracking-widest text-[#23243B]">
                Add New Job
              </span>
              <X
                size={20}
                className="cursor-pointer hover:text-red-500"
                onClick={() => setShowAddModal(false)}
              />
            </div>

            <div className="grid grid-cols-2 border-b border-gray-200 bg-white">
              <button
                onClick={() => setAddModalTab("create")}
                className={`py-3 text-[11px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest flex justify-center items-center gap-2 transition-colors ${addModalTab === "create" ? "border-b-2 border-[#23243B] text-[#23243B] bg-[#F8FAFC]" : "text-gray-400 hover:bg-gray-50"}`}
              >
                <FolderPlus size={16} /> Create Job
              </button>
              <button
                onClick={() => setAddModalTab("connect")}
                className={`py-3 text-[11px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest flex justify-center items-center gap-2 transition-colors ${addModalTab === "connect" ? "border-b-2 border-[#23243B] text-[#23243B] bg-[#F8FAFC]" : "text-gray-400 hover:bg-gray-50"}`}
              >
                <Database size={16} /> Connect DB
              </button>
            </div>

            <div className="p-4 sm:p-6 md:p-8 bg-[#FCFCFD] overflow-y-auto">
              {/* TAB 1: CREATE JOB */}
              {addModalTab === "create" && (
                <div className="flex flex-col gap-6">
                  {showRuleStep && (
                    <>
                      <div className="rounded-lg border border-[#D6D9E0] p-4 bg-gradient-to-br from-white to-[#F8FAFF]">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-[#23243B]">
                          Step 3: Validation Rules
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          Add rules for uploaded columns before leaving this flow.
                        </p>
                      </div>
                      <div className="border border-[#D6D9E0] rounded-lg overflow-x-auto bg-white">
                        <table className="min-w-[760px] w-full text-xs">
                          <thead className="bg-[#F1F5F9]">
                            <tr>
                              <th className="text-left p-2 border-b border-[#E5E7EB]">Column</th>
                              <th className="text-left p-2 border-b border-[#E5E7EB]">Data Type</th>
                              <th className="text-left p-2 border-b border-[#E5E7EB]">Validation Logic</th>
                              <th className="text-left p-2 border-b border-[#E5E7EB]">Value</th>
                              <th className="text-left p-2 border-b border-[#E5E7EB]">Active</th>
                              <th className="text-left p-2 border-b border-[#E5E7EB]">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ruleColumns.map((col) => {
                              const draft = ruleDrafts[col.column_name] || {
                                rule_type: "fuzzy_match",
                                rule_value: "80",
                                is_active: true,
                              };
                              return (
                                <tr key={col.column_name} className="odd:bg-white even:bg-[#FAFAFA]">
                                  <td className="p-2 border-b border-[#F1F5F9] font-semibold">{col.column_name}</td>
                                  <td className="p-2 border-b border-[#F1F5F9]">{col.data_type || "String"}</td>
                                  <td className="p-2 border-b border-[#F1F5F9]">
                                    <select
                                      value={draft.rule_type}
                                      onChange={(e) => setRuleDraft(col.column_name, "rule_type", e.target.value)}
                                      className="w-full min-w-[170px] border border-[#D1D5DB] rounded-md p-1.5"
                                    >
                                      <option value="fuzzy_match">fuzzy match</option>
                                      <option value="not_equals">not equals</option>
                                      <option value="equals">equals</option>
                                      <option value="contains">contains</option>
                                      <option value="is_positive">is positive</option>
                                    </select>
                                  </td>
                                  <td className="p-2 border-b border-[#F1F5F9]">
                                    <input
                                      value={draft.rule_value ?? ""}
                                      onChange={(e) => setRuleDraft(col.column_name, "rule_value", e.target.value)}
                                      className="w-full min-w-[120px] border border-[#D1D5DB] rounded-md p-1.5"
                                    />
                                  </td>
                                  <td className="p-2 border-b border-[#F1F5F9]">
                                    <input
                                      type="checkbox"
                                      checked={draft.is_active !== false}
                                      onChange={(e) => setRuleDraft(col.column_name, "is_active", e.target.checked)}
                                    />
                                  </td>
                                  <td className="p-2 border-b border-[#F1F5F9]">
                                    <button
                                      type="button"
                                      onClick={() => handleAddRuleForColumn(col)}
                                      className="px-3 py-1.5 text-[10px] uppercase font-bold border border-[#23243B] rounded-md text-[#23243B] hover:bg-[#23243B] hover:text-white"
                                    >
                                      Add New Rule
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                        <button
                          onClick={() => setShowRuleStep(false)}
                          className="w-full py-3 border border-[#23243B] rounded-md text-[#23243B] text-xs font-bold uppercase tracking-widest hover:bg-gray-50 transition-colors"
                        >
                          Back
                        </button>
                        <button
                          onClick={() => {
                            resetCreateFlow();
                            fetchJobs();
                          }}
                          className="w-full py-3 bg-[#23243B] rounded-md text-white text-xs font-bold uppercase tracking-widest hover:bg-black transition-colors"
                        >
                          Finish
                        </button>
                      </div>
                    </>
                  )}

                  {!showRuleStep && (
                    <>
                  {!(createDataMode === "file" && showFilePreview) && (
                    <>
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          onClick={() => setCreateDataMode("file")}
                          className={`py-3 text-xs font-bold uppercase tracking-widest border ${createDataMode === "file" ? "bg-[#23243B] text-white border-[#23243B]" : "bg-white text-[#23243B] border-[#A1A3AF]"}`}
                        >
                          File Input
                        </button>
                        <button
                          onClick={() => setCreateDataMode("db")}
                          className={`py-3 text-xs font-bold uppercase tracking-widest border ${createDataMode === "db" ? "bg-[#23243B] text-white border-[#23243B]" : "bg-white text-[#23243B] border-[#A1A3AF]"}`}
                        >
                          DB Connected
                        </button>
                      </div>
                    </>
                  )}

                  {createDataMode === "file" && !showFilePreview ? (
                    <>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 block">
                          Upload CSV File
                        </label>
                        <input
                          type="file"
                          accept=".csv"
                          onChange={(e) => {
                            setUploadFile(e.target.files[0]);
                            setShowFilePreview(false);
                            setPreviewColumns([]);
                            setPreviewColumnTypes({});
                            setPreviewRows([]);
                            setPreviewEditable([]);
                            setPreviewPage(1);
                          }}
                          className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:border-0 file:text-xs file:font-bold file:uppercase file:rounded-md file:bg-[#23243B] file:text-white hover:file:bg-black cursor-pointer"
                        />
                      </div>
                      <button
                        onClick={handlePreviewCsv}
                        className="w-full mt-2 py-3.5 rounded-md bg-[#23243B] text-white text-sm font-bold uppercase tracking-widest hover:bg-black transition-colors"
                      >
                        Next
                      </button>
                    </>
                  ) : (
                    createDataMode === "db" && (
                    <>
                      <div>
                        <label className="text-[10px] uppercase text-gray-500 font-bold">
                          Saved Connection
                        </label>
                        <div className="flex gap-2">
                          <select
                            className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none bg-transparent"
                            value={selectedConnectionId}
                            onChange={(e) => setSelectedConnectionId(e.target.value)}
                          >
                            <option value="">Select a saved connection...</option>
                            {savedConnections.map((c) => (
                              <option key={c.connection_id} value={c.connection_id}>
                                {c.connection_name} ({c.host}:{c.port})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setAddModalTab("connect")}
                            className="px-3 py-2 text-xs font-bold uppercase border border-[#23243B] text-[#23243B] hover:bg-[#23243B] hover:text-white"
                          >
                            Manage
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-gray-500 font-bold">
                          Choose Database(s)
                        </label>
                        <div className="flex gap-2" ref={dbDropdownRef}>
                          <div className="w-full relative">
                            <button
                              type="button"
                              onClick={() => setDbDropdownOpen((prev) => !prev)}
                              className="w-full cursor-pointer border border-[#A1A3AF] p-2 text-sm bg-white flex items-center justify-between"
                            >
                              <span className="truncate text-left">
                                {selectedDatabases.length > 0
                                  ? `${selectedDatabases.length} database(s) selected`
                                  : "Select database(s)..."}
                              </span>
                              <span className="text-xs text-gray-500">▼</span>
                            </button>
                            {dbDropdownOpen && (
                              <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto border border-[#A1A3AF] bg-white p-2 shadow-lg rounded">
                                <div className="flex justify-between mb-2">
                                  <button
                                    type="button"
                                    className="text-[10px] uppercase font-bold text-[#23243B] hover:underline"
                                    onClick={selectAllDatabases}
                                  >
                                    Select All
                                  </button>
                                  <button
                                    type="button"
                                    className="text-[10px] uppercase font-bold text-[#23243B] hover:underline"
                                    onClick={clearSelectedDatabases}
                                  >
                                    Clear
                                  </button>
                                </div>
                                {databaseOptions.length === 0 ? (
                                  <div className="text-xs text-gray-500">No databases found. Click Fetch to load from selected connection.</div>
                                ) : (
                                  databaseOptions.map((dbName) => (
                                    <label key={dbName} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={selectedDatabases.includes(dbName)}
                                        onChange={() => toggleDatabaseSelection(dbName)}
                                      />
                                      <span>{dbName}</span>
                                    </label>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={handleFetchDatabases}
                            className="px-3 py-2 text-xs font-bold uppercase border border-[#23243B] text-[#23243B] hover:bg-[#23243B] hover:text-white"
                          >
                            Fetch
                          </button>
                        </div>
                        {selectedDatabases.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {selectedDatabases.map((db) => (
                              <span
                                key={db}
                                className="text-[10px] uppercase tracking-wider bg-[#23243B] text-white px-2 py-1"
                              >
                                {db}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleConnectDbPipeline}
                        className="w-full mt-2 py-4 bg-[#23243B] text-white text-sm font-bold uppercase tracking-widest hover:bg-black"
                      >
                        Create Job From Database
                      </button>
                    </>
                    )
                  )}

                  {createDataMode === "file" && showFilePreview && (
                    <>
                      <div className="rounded-lg border border-[#D6D9E0] p-4 bg-gradient-to-br from-white to-[#F8FAFF]">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-[#23243B]">
                          Step 2: File Preview (First 11 Rows)
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          Verify columns, detected types and values before upload.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                          <div className="border border-[#E5E7EB] rounded bg-white p-2">
                            <div className="text-[10px] uppercase text-gray-500">Job Name</div>
                            <div className="text-xs font-semibold truncate">{newJobName || "-"}</div>
                          </div>
                          <div className="border border-[#E5E7EB] rounded bg-white p-2">
                            <div className="text-[10px] uppercase text-gray-500">Columns</div>
                            <div className="text-xs font-semibold">{previewColumns.length}</div>
                          </div>
                          <div className="border border-[#E5E7EB] rounded bg-white p-2">
                            <div className="text-[10px] uppercase text-gray-500">Rows Shown</div>
                            <div className="text-xs font-semibold">{previewRows.length}</div>
                          </div>
                        </div>
                      </div>

                      <div className="border border-[#D6D9E0] rounded-lg overflow-x-auto bg-white">
                        <table className="min-w-[700px] sm:min-w-[820px] w-full text-xs">
                          <thead className="bg-[#F1F5F9]">
                            <tr>
                              <th className="text-left p-2 border-b border-[#E5E7EB] whitespace-nowrap">Column</th>
                              <th className="text-left p-2 border-b border-[#E5E7EB] whitespace-nowrap">Data Type</th>
                              <th className="text-left p-2 border-b border-[#E5E7EB] whitespace-nowrap">Value</th>
                              <th className="text-left p-2 border-b border-[#E5E7EB] whitespace-nowrap">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedPreview.map((item, localIdx) => {
                              const idx = (previewPage - 1) * previewPageSize + localIdx;
                              return (
                              <tr key={`${item.originalName}-${idx}`} className="odd:bg-white even:bg-[#FAFAFA] align-top hover:bg-[#F8FAFC]">
                                <td className="p-2 border-b border-[#F1F5F9] whitespace-nowrap font-semibold">
                                  <input
                                    value={item.name}
                                    onChange={(e) => handleEditableChange(idx, "name", e.target.value)}
                                    className="w-full min-w-[180px] border border-[#D1D5DB] rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-[#23243B]/20"
                                  />
                                </td>
                                <td className="p-2 border-b border-[#F1F5F9] whitespace-nowrap">
                                  <select
                                    value={item.dataType}
                                    onChange={(e) => handleEditableChange(idx, "dataType", e.target.value)}
                                    className="w-full min-w-[120px] border border-[#D1D5DB] rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-[#23243B]/20"
                                  >
                                    <option value="string">String</option>
                                    <option value="int64">Integer</option>
                                    <option value="float64">Float</option>
                                    <option value="datetime64[ns]">Date</option>
                                    <option value="bool">Boolean</option>
                                  </select>
                                </td>
                                <td className="p-2 border-b border-[#F1F5F9] whitespace-nowrap">
                                  <input
                                    value={item.value}
                                    onChange={(e) => handleEditableChange(idx, "value", e.target.value)}
                                    className="w-full min-w-[220px] border border-[#D1D5DB] rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-[#23243B]/20"
                                  />
                                </td>
                                <td className="p-2 border-b border-[#F1F5F9] whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => handleApplyColumnUpdate(idx)}
                                    className="px-3 py-1.5 text-[10px] uppercase font-bold border border-[#23243B] rounded-md text-[#23243B] hover:bg-[#23243B] hover:text-white transition-colors"
                                  >
                                    Update
                                  </button>
                                </td>
                              </tr>
                            )})}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center justify-between mt-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                          disabled={previewPage === 1}
                          className="px-3 py-2 text-xs font-bold uppercase border border-[#23243B] rounded-md disabled:opacity-40 hover:bg-[#23243B] hover:text-white transition-colors"
                        >
                          Previous
                        </button>
                        <span className="text-xs text-gray-600 font-medium">
                          Page {previewPage} of {totalPreviewPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                          disabled={previewPage === totalPreviewPages}
                          className="px-3 py-2 text-xs font-bold uppercase border border-[#23243B] rounded-md disabled:opacity-40 hover:bg-[#23243B] hover:text-white transition-colors"
                        >
                          Next
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
                        <button
                          onClick={resetCreateFlow}
                          className="w-full py-3 border border-red-300 rounded-md text-red-600 text-xs font-bold uppercase tracking-widest hover:bg-red-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            setShowFilePreview(false);
                            setPreviewColumns([]);
                            setPreviewColumnTypes({});
                            setPreviewRows([]);
                            setPreviewEditable([]);
                            setPreviewPage(1);
                          }}
                          className="w-full py-3 border border-[#23243B] rounded-md text-[#23243B] text-xs font-bold uppercase tracking-widest hover:bg-gray-50 transition-colors"
                        >
                          Back
                        </button>
                        <button
                          onClick={handleUploadCsv}
                          className="w-full py-3 bg-[#23243B] rounded-md text-white text-xs font-bold uppercase tracking-widest hover:bg-black transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    </>
                  )}
                    </>
                  )}
                </div>
              )}

              {/* TAB 2: CONNECT DB */}
              {addModalTab === "connect" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-[10px] uppercase text-gray-500 font-bold">
                      Connection Name
                    </label>
                    <input
                      className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none"
                      placeholder="e.g. PROD_POSTGRES"
                      value={connectionName}
                      onChange={(e) => setConnectionName(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase text-gray-500 font-bold">
                        Host
                      </label>
                      <input
                        className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none"
                        placeholder="localhost"
                        value={dbCreds.host}
                        onChange={(e) =>
                          setDbCreds((prev) => ({ ...prev, host: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-gray-500 font-bold">
                        Port
                      </label>
                      <input
                        className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none"
                        placeholder="5432"
                        value={dbCreds.port}
                        onChange={(e) =>
                          setDbCreds((prev) => ({ ...prev, port: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase text-gray-500 font-bold">
                        Username
                      </label>
                      <input
                        className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none"
                        placeholder="postgres"
                        value={dbCreds.user}
                        onChange={(e) =>
                          setDbCreds((prev) => ({ ...prev, user: e.target.value }))
                        }
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
                        value={dbCreds.pass}
                        onChange={(e) =>
                          setDbCreds((prev) => ({ ...prev, pass: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-gray-500 font-bold">
                      Database
                    </label>
                    <input
                      className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none"
                      placeholder="e.g. mdms"
                      value={dbCreds.dbname}
                      onChange={(e) =>
                        setDbCreds((prev) => ({ ...prev, dbname: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-gray-500 font-bold">
                      Saved Connections
                    </label>
                    <div className="border border-[#A1A3AF] p-2 max-h-28 overflow-y-auto text-sm">
                      {savedConnections.length === 0 ? (
                        <span className="text-gray-500">No saved connections yet.</span>
                      ) : (
                        savedConnections.map((c) => (
                          <div key={c.connection_id} className="py-1">
                            {c.connection_name} ({c.host}:{c.port})
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={handleTestConnection}
                      className="w-full mt-2 py-3 bg-white border border-[#23243B] text-[#23243B] text-sm font-bold uppercase tracking-widest hover:bg-gray-50"
                    >
                      Test Connection
                    </button>
                    <button
                      onClick={handleSaveConnection}
                      className="w-full mt-2 py-3 bg-[#23243B] text-white text-sm font-bold uppercase tracking-widest hover:bg-black"
                    >
                      Save Connection
                    </button>
                  </div>
                  <span className="text-[10px] text-center text-gray-400 uppercase tracking-widest mt-2">
                    Save once here, then use DB Connected in Create Job.
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

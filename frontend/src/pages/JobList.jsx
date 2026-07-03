import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  getAllJobs,
  getTablesByJob,
  getTableDetails,
  runJobEngine,
  deleteJob,
  deleteIncompleteJobs,
  deleteTable,
  renameJob,
  renameTable,
  addRule,
  updateRule,
  getMasterData,
  createNewJob,
  uploadCsvToJob,
  uploadCsvPathToJob,
  replaceTableFileFromPath,
  replaceTableFileUpload,
  previewCsvFile,
  previewCsvFileFromPath,
  previewDbTable,
  getDbLookupValues,
  getDbTableColumns,
  connectToDb,
  listSchemasTables,
  listSavedConnections,
  getSavedConnectionCredentials,
  saveDbConnection,
  testDbConnection,
  exportResultsToDb,
  emailTableOutput,
  downloadTableOutputCsv,
  downloadTableOutputExcel,
  downloadJobZip,
  uploadTableOutputToSharePoint,
  scheduleJob,
  getAllSchedules,
  pauseSchedule,
  resumeSchedule,
  deleteSchedule,
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
  FileUp,
  Table2,
  CheckCircle2,
  AlertTriangle,
  Clock3,
} from "lucide-react";
import ColumnAudit from "./ColumnAudit";

const RULE_OPTIONS_BY_TYPE = {
  String: ["fuzzy_match", "contains", "starts_with", "ends_with", "equals", "not_equals", "is_email"],
  Integer: ["equals", "not_equals", "greater_than", "less_than", "is_positive", "is_negative"],
  Float: ["equals", "not_equals", "greater_than", "less_than", "is_positive", "is_negative"],
  Date: ["before_date", "after_date", "date_format_check"],
  Boolean: ["is_true", "is_false", "equals", "not_equals"],
};

const RULE_LABELS = {
  fuzzy_match: "fuzzy match",
  contains: "contains",
  starts_with: "starts with",
  ends_with: "ends with",
  equals: "equals",
  not_equals: "not equals",
  is_email: "is email",
  greater_than: "greater than",
  less_than: "less than",
  is_positive: "is positive",
  is_negative: "is negative",
  before_date: "before date",
  after_date: "after date",
  date_format_check: "date format check",
  is_true: "is true",
  is_false: "is false",
};

const RULES_REQUIRING_VALUE = new Set([
  "contains",
  "starts_with",
  "ends_with",
  "equals",
  "not_equals",
  "greater_than",
  "less_than",
  "before_date",
  "after_date",
  "date_format_check",
]);

const normalizeDataType = (type = "") => {
  const t = String(type).toLowerCase();
  if (t.includes("int")) return "Integer";
  if (t.includes("float") || t.includes("double") || t.includes("decimal")) return "Float";
  if (t.includes("date") || t.includes("time")) return "Date";
  if (t.includes("bool")) return "Boolean";
  return "String";
};

const defaultRuleDraftForType = (type) => {
  const normalized = normalizeDataType(type);
  if (normalized === "String") {
    return { rule_type: "fuzzy_match", rule_value: "", is_active: false, master_data_text: "" };
  }
  if (normalized === "Integer" || normalized === "Float") {
    return { rule_type: "greater_than", rule_value: "0", is_active: false, master_data_text: "" };
  }
  if (normalized === "Date") {
    return { rule_type: "date_format_check", rule_value: "%Y-%m-%d", is_active: false, master_data_text: "" };
  }
  return { rule_type: "equals", rule_value: "true", is_active: false, master_data_text: "" };
};

const parseLookupValuesFromText = (text = "") => {
  return text
    .split(/\r?\n|,/)
    .map((v) => v.trim())
    .filter(Boolean);
};

const OUTPUT_DB_CONFIG_KEY = "mdqm_output_db_config_v1";
const DEFAULT_IF_EXISTS_MODE = "replace";
const INTERNAL_MDQM_DBNAME = "mdms";
const inferSourcePathFromFile = (file) => {
  const raw = String(file?.path || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/\//g, "\\");
  if (normalized.toLowerCase().startsWith("c:\\fakepath\\")) return "";
  return normalized;
};

export default function JobList({ readOnly = false }) {
  const [jobs, setJobs] = useState([]);
  const [tables, setTables] = useState({});
  const [expandedJob, setExpandedJob] = useState(null);

  // Modals & Menus
  const [showAddModal, setShowAddModal] = useState(false);
  const [showIncompleteJobs, setShowIncompleteJobs] = useState(false);
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
  const [uploadFilePath, setUploadFilePath] = useState("");
  const [uploadSourcePath, setUploadSourcePath] = useState("");
  const [previewColumns, setPreviewColumns] = useState([]);
  const [previewColumnTypes, setPreviewColumnTypes] = useState({});
  const [previewRows, setPreviewRows] = useState([]);
  const [previewTotalRows, setPreviewTotalRows] = useState(0);
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
  const [schemaOptions, setSchemaOptions] = useState([]);
  const [selectedSchema, setSelectedSchema] = useState("");
  const [tablesBySchema, setTablesBySchema] = useState({});
  const [tableOptions, setTableOptions] = useState([]);
  const [selectedTables, setSelectedTables] = useState([]);
  const [savedConnections, setSavedConnections] = useState([]);
  /** Step 1 Table Input — separate from output so Run Job / Step 4 keep their connection. */
  const [inputConnectionId, setInputConnectionId] = useState("");
  /** Step 4 Table Output + Run Job auto-export */
  const [outputConnectionId, setOutputConnectionId] = useState("");
  const [connectionName, setConnectionName] = useState("");
  const [dbDropdownOpen, setDbDropdownOpen] = useState(false);
  const dbDropdownRef = useRef(null);
  const schemaSectionRef = useRef(null);
  const [schemasLoadBusy, setSchemasLoadBusy] = useState(false);
  const [schemasLoadHint, setSchemasLoadHint] = useState("");

  // Add this near your other useState hooks
  const [expandedTables, setExpandedTables] = useState({});
  const [showRuleStep, setShowRuleStep] = useState(false);
  const [showOutputStep, setShowOutputStep] = useState(false);
  const [editFlow, setEditFlow] = useState({
    isEdit: false,
    jobId: null,
    tableId: null,
    tableName: "",
    existingRules: [],
    masterValues: [],
  });
  const [runningJobs, setRunningJobs] = useState({});
  const [runStatusByJob, setRunStatusByJob] = useState({});
  const [schedulerToasts, setSchedulerToasts] = useState([]);
  const previousJobStatusRef = useRef({});
  const previousJobEndTimeRef = useRef({});
  const lastToastTsRef = useRef({});
  const [schedulesByJob, setSchedulesByJob] = useState({});
  const [, setToastNowMs] = useState(Date.now());
  const [createdJobId, setCreatedJobId] = useState(null);
  const [createdTableId, setCreatedTableId] = useState(null);
  const [ruleColumns, setRuleColumns] = useState([]);
  const [ruleDrafts, setRuleDrafts] = useState({});
  const [outputSummary, setOutputSummary] = useState(null);
  const [outputTargetMode, setOutputTargetMode] = useState("file");
  /** Only true after Step 4 Done with a fully valid Table Output config. */
  const [exportOnRunEnabled, setExportOnRunEnabled] = useState(false);
  const [outputDbMode, setOutputDbMode] = useState("saved");
  const [outputSaveConnection, setOutputSaveConnection] = useState(false);
  const [outputConnectionName, setOutputConnectionName] = useState("");
  const [outputDbState, setOutputDbState] = useState({
    targetSchema: "",
    targetTable: "",
    ifExists: DEFAULT_IF_EXISTS_MODE,
    loading: false,
    message: "",
  });
  useEffect(() => {
    if (!outputSummary?.tableName) return;
    setOutputDbState((prev) => {
      const prevTarget = String(prev.targetTable || "").trim().toLowerCase();
      const shouldAutofill =
        !prevTarget ||
        prevTarget === "jobs" ||
        prevTarget === "metadata.jobs";
      if (!shouldAutofill) return prev;
      return { ...prev, targetTable: outputSummary.tableName };
    });
  }, [outputSummary]);
  const [outputAction, setOutputAction] = useState("download_csv");
  const [outputEmailState, setOutputEmailState] = useState({
    toEmail: "",
    format: "csv",
  });
  const [outputSharePointState, setOutputSharePointState] = useState({
    format: "csv",
    folderPath: "",
  });
  const [showSchedule, setShowSchedule] = useState(false);
  /** When set, schedule modal saves for this job (job list). When null, uses outputSummary.jobId (wizard step 4). */
  const [scheduleContextJobId, setScheduleContextJobId] = useState(null);
  const [scheduleType, setScheduleType] = useState("once");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleDay, setScheduleDay] = useState("0");
  const [scheduleDate, setScheduleDate] = useState("");
  const [hourInterval, setHourInterval] = useState(1);
  const [cronExpression, setCronExpression] = useState("* * * * *");

  const formatRunningDuration = (startTime) => {
    if (!startTime) return "0s";
    const start = new Date(startTime);
    const diffSec = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const removeToast = (toastId) => {
    setSchedulerToasts((prev) => prev.filter((t) => t.id !== toastId));
  };

  useEffect(() => {
    const id = window.setInterval(() => setToastNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const pushSchedulerToast = (job) => {
    const normalized = String(job?.status || "").toLowerCase();
    if (!["running", "completed", "failed"].includes(normalized)) return;
    const dedupeKey = `${job?.job_id || "unknown"}:${normalized}`;
    const now = Date.now();
    if (lastToastTsRef.current[dedupeKey] && now - lastToastTsRef.current[dedupeKey] < 10000) {
      return;
    }
    lastToastTsRef.current[dedupeKey] = now;
    const statusLabel =
      normalized === "running"
        ? "Running"
        : normalized === "completed"
          ? "Completed"
          : "Failed";
    const durationLabel =
      normalized === "running"
        ? formatRunningDuration(job?.start_time)
        : String(job?.duration || "0ms");
    const toast = {
      id: `${job.job_id}-${normalized}-${Date.now()}`,
      jobId: job.job_id,
      status: normalized,
      title: `Job ${job.job_id} ${statusLabel}`,
      durationLabel,
      startTime: job?.start_time || null,
      nextRunTime: schedulesByJob[job?.job_id]?.next_run_time || null,
    };
    setSchedulerToasts((prev) => [...prev, toast].slice(-3));
    window.setTimeout(() => {
      removeToast(toast.id);
    }, 6000);
  };
  /** Fuzzy lookup: modal to choose file vs table paste */
  const [lookupModal, setLookupModal] = useState({
    open: false,
    columnName: null,
    view: "choice",
  });
  const [tablePasteBuffer, setTablePasteBuffer] = useState("");
  const [lookupDbState, setLookupDbState] = useState({
    schema_name: "",
    table_name: "",
    column_name: "",
    limit: "",
    loading: false,
  });
  const [lookupDbConnMode, setLookupDbConnMode] = useState("saved");
  const [lookupDbLoadMessage, setLookupDbLoadMessage] = useState("");
  const [lookupDbColumns, setLookupDbColumns] = useState([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OUTPUT_DB_CONFIG_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return;

      const savedTarget = saved.outputTargetMode;
      const savedTargetTable = String(saved.outputDbState?.targetTable || "").trim();
      const savedOutConnForMode =
        typeof saved.outputConnectionId === "string"
          ? saved.outputConnectionId
          : typeof saved.selectedConnectionId === "string"
            ? saved.selectedConnectionId
            : "";
      const savedDbname = String(saved.dbCreds?.dbname || "").trim();
      const tableExportReady =
        savedTarget === "table" &&
        savedTargetTable &&
        savedDbname &&
        savedDbname.toLowerCase() !== INTERNAL_MDQM_DBNAME &&
        (saved.outputDbMode === "manual"
          ? Boolean(saved.dbCreds?.host && saved.dbCreds?.user)
          : Boolean(savedOutConnForMode));
      if (savedTarget === "file" || tableExportReady) {
        setOutputTargetMode(savedTarget === "table" ? "table" : "file");
      } else if (savedTarget === "table") {
        setOutputTargetMode("file");
      }
      if (saved.outputDbMode === "saved" || saved.outputDbMode === "manual") {
        setOutputDbMode(saved.outputDbMode);
      }
      if (typeof saved.outputSaveConnection === "boolean") {
        setOutputSaveConnection(saved.outputSaveConnection);
      }
      if (typeof saved.outputConnectionName === "string") {
        setOutputConnectionName(saved.outputConnectionName);
      }
      const savedOutConn =
        typeof saved.outputConnectionId === "string"
          ? saved.outputConnectionId
          : typeof saved.selectedConnectionId === "string"
            ? saved.selectedConnectionId
            : "";
      if (savedOutConn) {
        setOutputConnectionId(savedOutConn);
      }
      if (saved.dbCreds && typeof saved.dbCreds === "object") {
        setDbCreds((prev) => ({ ...prev, ...saved.dbCreds }));
      }
      if (saved.outputDbState && typeof saved.outputDbState === "object") {
        setOutputDbState((prev) => ({
          ...prev,
          targetSchema: saved.outputDbState.targetSchema || "",
          targetTable: saved.outputDbState.targetTable || "",
          ifExists:
            saved.outputDbState.ifExists === "replace"
              ? "replace"
              : DEFAULT_IF_EXISTS_MODE,
        }));
      }
      setExportOnRunEnabled(false);
    } catch {
      // Ignore malformed saved config.
    }
  }, []);

  useEffect(() => {
    if (outputTargetMode === "table" && !isTableExportFullyConfigured()) {
      setExportOnRunEnabled(false);
    }
  }, [
    outputTargetMode,
    outputConnectionId,
    outputDbMode,
    dbCreds.host,
    dbCreds.user,
    dbCreds.dbname,
    outputDbState.targetTable,
    savedConnections.length,
  ]);

  useEffect(() => {
    const targetTable = String(outputDbState.targetTable || "").trim();
    const dbnameOk =
      String(dbCreds.dbname || "").trim().toLowerCase() !== INTERNAL_MDQM_DBNAME;
    const connOk =
      outputDbMode === "saved"
        ? Boolean(String(outputConnectionId || "").trim())
        : Boolean(dbCreds.host && dbCreds.user);
    const tableExportReady =
      outputTargetMode === "table" &&
      targetTable &&
      dbnameOk &&
      connOk &&
      Boolean(String(dbCreds.dbname || "").trim());
    const persistTargetMode = tableExportReady
      ? "table"
      : outputTargetMode === "table"
        ? "file"
        : outputTargetMode;
    const payload = {
      outputTargetMode: persistTargetMode,
      outputDbMode,
      outputSaveConnection,
      outputConnectionName,
      outputConnectionId,
      dbCreds,
      outputDbState: {
        targetSchema: outputDbState.targetSchema,
        targetTable: outputDbState.targetTable,
        ifExists: outputDbState.ifExists,
      },
    };
    window.localStorage.setItem(OUTPUT_DB_CONFIG_KEY, JSON.stringify(payload));
  }, [
    outputTargetMode,
    outputDbMode,
    outputSaveConnection,
    outputConnectionName,
    outputConnectionId,
    dbCreds,
    outputDbState.targetSchema,
    outputDbState.targetTable,
    outputDbState.ifExists,
  ]);

  const resetCreateFlowState = () => {
    setNewJobName("");
    setUploadFile(null);
    setShowFilePreview(false);
    setCreateDataMode("file");
    setPreviewColumns([]);
    setPreviewColumnTypes({});
    setPreviewRows([]);
    setPreviewTotalRows(0);
    setPreviewEditable([]);
    setPreviewPage(1);
    setShowRuleStep(false);
    setShowOutputStep(false);
    setCreatedJobId(null);
    setCreatedTableId(null);
    setRuleColumns([]);
    setRuleDrafts({});
    setOutputSummary(null);
    setExportOnRunEnabled(false);
    // Keep output DB config so Run Job can auto-export when explicitly configured in Step 4
    // even after closing/resetting this modal.
    setOutputDbState((prev) => ({ ...prev, loading: false, message: "" }));
    // Keep selected file action + email target across modal closes,
    // so Run Job uses the user's latest preference.
    setConnectionName("");
    setInputConnectionId("");
    setDbCreds({ host: "", port: "", user: "", pass: "", dbname: "" });
    setSchemaOptions([]);
    setTablesBySchema({});
    setTableOptions([]);
    setSelectedSchema("");
    setSelectedTables([]);
    setSchemasLoadHint("");
    setSchemasLoadBusy(false);
    setUploadFilePath("");
    setUploadSourcePath("");
    setLookupModal({ open: false, columnName: null, view: "choice" });
    setTablePasteBuffer("");
    setLookupDbState({
      schema_name: "",
      table_name: "",
      column_name: "",
      limit: "",
      loading: false,
    });
    setLookupDbConnMode("saved");
    setLookupDbLoadMessage("");
    setLookupDbColumns([]);
    setShowSchedule(false);
    setScheduleContextJobId(null);
    setScheduleType("once");
    setScheduleTime("");
    setScheduleDay("0");
    setScheduleDate("");
    setHourInterval(1);
    setCronExpression("* * * * *");
    setEditFlow({
      isEdit: false,
      jobId: null,
      tableId: null,
      tableName: "",
      existingRules: [],
      masterValues: [],
    });
  };

  const resetCreateFlow = () => {
    resetCreateFlowState();
    setShowAddModal(false);
  };

  const openCreateJobModal = () => {
    resetCreateFlowState();
    setShowAddModal(true);
  };

  const withDbPass = (payload) => {
    if (dbCreds.pass) payload.pass = dbCreds.pass;
    return payload;
  };

  const hasDbConnection = (connectionId) =>
    Boolean(connectionId) || Boolean(dbCreds.host && dbCreds.user);

  const validateFileInputStep1 = () => {
    if (!newJobName.trim()) {
      alert("Enter a job name.");
      return false;
    }
    if (!uploadFile && !uploadFilePath.trim()) {
      alert("Choose a CSV file or paste a local file path.");
      return false;
    }
    return true;
  };

  const validateTableInputStep1 = () => {
    if (!newJobName.trim()) {
      alert("Enter a job name.");
      return false;
    }
    if (!hasDbConnection(inputConnectionId)) {
      alert("Select a saved connection or enter host and username.");
      return false;
    }
    if (!(dbCreds.dbname || "mdms").trim()) {
      alert("Enter database name (e.g. mdms).");
      return false;
    }
    if (!selectedSchema || selectedTables.length === 0) {
      alert("Click Load tables, then choose schema and at least one table.");
      return false;
    }
    return true;
  };

  const prefillOutputConnectionFromInput = () => {
    if (outputConnectionId || !inputConnectionId) return;
    handleOutputConnectionChange(String(inputConnectionId));
  };

  const resolveActiveOutputConnectionId = () => {
    const id = String(outputConnectionId || "").trim();
    if (!id) return "";
    return savedConnections.some((c) => String(c.connection_id) === id) ? id : "";
  };

  const isTableExportFullyConfigured = () => {
    if (outputTargetMode !== "table") return false;
    const targetTable = String(outputDbState.targetTable || "").trim();
    if (!targetTable) return false;
    const dbname = String(dbCreds.dbname || "").trim().toLowerCase();
    if (!dbname || dbname === INTERNAL_MDQM_DBNAME) return false;
    if (outputDbMode === "saved") {
      return Boolean(resolveActiveOutputConnectionId());
    }
    return Boolean(dbCreds.host && dbCreds.user);
  };

  const buildExportDbPayload = (tableId, jobId, targetTable) => {
    const dbname = String(dbCreds.dbname || "").trim();
    const base = {
      dbname,
      host: dbCreds.host,
      port: dbCreds.port || "5432",
      user: dbCreds.user,
      pass: dbCreds.pass || "",
      job_id: jobId,
      table_id: tableId,
      target_schema: outputDbState.targetSchema || undefined,
      target_table: targetTable,
      if_exists: outputDbState.ifExists,
    };
    const connId = resolveActiveOutputConnectionId();
    if (outputDbMode === "saved" && connId) {
      return { ...base, connection_id: Number(connId) };
    }
    return base;
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
    // Poll jobs so scheduler-triggered runs are reflected in UI automatically.
    const id = window.setInterval(() => {
      fetchJobs();
    }, 10000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (showAddModal) {
      fetchSavedConnections();
    }
  }, [showAddModal]);

  useEffect(() => {
    if (!showAddModal) return undefined;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) {
      document.body.style.paddingRight = `${scrollbar}px`;
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [showAddModal]);

  useEffect(() => {
    if (!showSchedule) return undefined;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) {
      document.body.style.paddingRight = `${scrollbar}px`;
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [showSchedule]);

  const fetchJobs = async () => {
    try {
      const [res, schedRes] = await Promise.all([getAllJobs(), getAllSchedules()]);
      const items = res.data || [];
      setJobs(items);
      const scheduleItems = schedRes?.data?.items || [];
      const mapped = {};
      scheduleItems.forEach((s) => {
        if (s?.job_id != null) mapped[s.job_id] = s;
      });
      setSchedulesByJob(mapped);
      items.forEach((job) => {
        const current = String(job?.status || "").toLowerCase();
        const previous = previousJobStatusRef.current[job.job_id];
        const previousEndTime = previousJobEndTimeRef.current[job.job_id];
        const currentEndTime = job?.end_time || null;
        if (previous && previous !== current) {
          pushSchedulerToast(job);
        }
        // Fast scheduler runs can complete between polling intervals, so status
        // may still look "Completed" in consecutive polls. Detect new runs by
        // end_time changes and emit a completion toast.
        if (
          previousEndTime &&
          currentEndTime &&
          previousEndTime !== currentEndTime &&
          current === "completed"
        ) {
          pushSchedulerToast(job);
        }
        previousJobStatusRef.current[job.job_id] = current;
        previousJobEndTimeRef.current[job.job_id] = currentEndTime;
      });
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
    const jobMeta = jobs.find((j) => j.job_id === jobId);
    const shouldRefetch =
      !tables[jobId] ||
      ((tables[jobId]?.length || 0) === 0 && (jobMeta?.total_tables || 0) > 0);
    if (shouldRefetch) {
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
    if (runningJobs[jobId]) return;
    setRunningJobs((prev) => ({ ...prev, [jobId]: true }));
    setRunStatusByJob((prev) => ({ ...prev, [jobId]: "running" }));
    try {
      let tableExportFailed = false;
      let tableExportErrorMsg = "";
      await runJobEngine(jobId);
      const res = await getTablesByJob(jobId);
      const refreshedTables = res?.data || [];
      const totalRowsProcessed = refreshedTables.reduce(
        (sum, t) => sum + Number(t?.row_count || 0),
        0
      );
      const totalErrorRows = refreshedTables.reduce(
        (sum, t) => sum + Number(t?.error_rows || 0),
        0
      );
      if (exportOnRunEnabled && isTableExportFullyConfigured()) {
        try {
          const latestTable = [...(refreshedTables || [])].sort((a, b) => b.table_id - a.table_id)[0];
          if (!latestTable?.table_id) {
            throw new Error("Output table not found.");
          }
          await exportOutputToDbByTableId(latestTable.table_id, jobId);
        } catch (exportErr) {
          const msg =
            exportErr?.response?.data?.detail ||
            exportErr?.message ||
            "Run completed, but export to DB failed.";
          tableExportFailed = true;
          tableExportErrorMsg = msg;
          setOutputDbState((s) => ({ ...s, message: msg }));
        }
      } else if (outputTargetMode === "file" && outputAction === "download_csv") {
        await handleAutoDownloadForJob(jobId, refreshedTables, "csv");
      } else if (outputTargetMode === "file" && outputAction === "download_excel") {
        await handleAutoDownloadForJob(jobId, refreshedTables, "excel");
      } else if (outputTargetMode === "file" && outputAction === "sharepoint") {
        await handleAutoSharePointForJob(refreshedTables);
      } else if (outputTargetMode === "file" && outputAction === "email") {
        await handleAutoEmailForJob(refreshedTables);
      }
      if (tableExportFailed) {
        alert(
          `Job completed, but export to DB failed.\n\nReason: ${tableExportErrorMsg || "Unknown export error"}\n\nProcessed: ${totalRowsProcessed} rows, quarantine: ${totalErrorRows} rows.`
        );
      } else {
        alert(
          totalErrorRows > 0
            ? `Job completed. Processed: ${totalRowsProcessed} rows. Quarantine: ${totalErrorRows} rows.`
            : `Job completed. Processed: ${totalRowsProcessed} rows. No quarantine rows (all checks passed).`
        );
      }
      setRunStatusByJob((prev) => ({ ...prev, [jobId]: "success" }));

      // 1. Refresh the main job list stats
      fetchJobs();

      // 2. NEW: If this job's tables are currently open, refresh them too!
      if (expandedJob === jobId) {
        setTables((prev) => ({ ...prev, [jobId]: refreshedTables }));
      }
    } catch (err) {
      alert("Error running job");
      setRunStatusByJob((prev) => ({ ...prev, [jobId]: "error" }));
    } finally {
      setRunningJobs((prev) => ({ ...prev, [jobId]: false }));
      setTimeout(() => {
        setRunStatusByJob((prev) => ({ ...prev, [jobId]: "idle" }));
      }, 4000);
    }
  };

  const handleDeleteAllIncomplete = async () => {
    const incompleteCount = jobs.filter((j) => (j.total_tables || 0) === 0).length;
    if (incompleteCount === 0) {
      alert("No incomplete jobs to delete.");
      return;
    }
    if (
      !window.confirm(
        `Delete all ${incompleteCount} incomplete job(s) from the database? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      const res = await deleteIncompleteJobs();
      const deleted = res?.data?.count ?? res?.data?.deleted_job_ids?.length ?? incompleteCount;
      alert(`Removed ${deleted} incomplete job(s).`);
      setShowIncompleteJobs(false);
      await fetchJobs();
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to delete incomplete jobs.");
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

  const handleOpenEditFlow = async (job) => {
    try {
      resetCreateFlowState();
      setShowAddModal(true);
      setNewJobName(job.job_name || "");

      const tablesRes = await getTablesByJob(job.job_id);
      const jobTables = tablesRes?.data || [];
      if (jobTables.length === 0) {
        alert("No tables found for this job. Please attach data first.");
        return;
      }
      const targetTable = jobTables[0];
      const detailsRes = await getTableDetails(job.job_id, targetTable.table_id);
      const cols = detailsRes?.data?.columns || [];
      const existingRules = detailsRes?.data?.rules || [];
      const mastersRes = await getMasterData(job.job_id, targetTable.table_id);
      const masterValues = Array.isArray(mastersRes?.data) ? mastersRes.data : [];

      setCreatedJobId(job.job_id);
      setCreatedTableId(targetTable.table_id);
      setShowRuleStep(false);
      setShowOutputStep(false);
      setCreateDataMode("file");
      setUploadFile(null);
      setUploadFilePath(`uploads/${targetTable.table_name}.csv`);
      setUploadSourcePath("");
      setEditFlow({
        isEdit: true,
        jobId: job.job_id,
        tableId: targetTable.table_id,
        tableName: targetTable.table_name || "",
        existingRules,
        masterValues,
      });
    } catch (err) {
      alert(err?.response?.data?.detail || err?.message || "Failed to open edit flow.");
    }
  };

  const handleUploadCsv = async () => {
    if (!newJobName) {
      alert("Enter a job name.");
      return;
    }
    if (createDataMode === "file" && !uploadFile && !uploadFilePath.trim()) {
      alert("Choose a CSV file or provide a file path.");
      return;
    }
    const cols = previewEditable.map((item) => ({
      column_name: item.name || item.originalName,
      data_type: normalizeDataType(item.dataType),
    }));
    if (cols.length === 0) {
      alert("Preview data not found. Please preview the file again.");
      return;
    }
    setRuleColumns(cols);
    setRuleDrafts(
      cols.reduce((acc, col) => {
        if (editFlow.isEdit) {
          const existing = (editFlow.existingRules || []).find(
            (r) => r.column_name === col.column_name
          );
          const fallback = defaultRuleDraftForType(col.data_type);
          if (existing) {
            acc[col.column_name] = {
              rule_type: existing.rule_type || fallback.rule_type,
              rule_value: existing.rule_value ?? "",
              is_active: !!existing.is_active,
              master_data_text:
                existing.rule_type === "fuzzy_match"
                  ? (editFlow.masterValues || []).join(", ")
                  : "",
            };
          } else {
            acc[col.column_name] = fallback;
          }
          return acc;
        }
        acc[col.column_name] = defaultRuleDraftForType(col.data_type);
        return acc;
      }, {})
    );
    setShowRuleStep(true);
  };

  const handlePreviewDb = async () => {
    if (!validateTableInputStep1()) return;
    try {
      const dbname = (dbCreds.dbname || "mdms").trim();
      const payload = inputConnectionId
        ? {
            connection_id: Number(inputConnectionId),
            dbname,
            schema_name: selectedSchema,
            table_name: selectedTables[0],
          }
        : {
            host: dbCreds.host,
            port: dbCreds.port || "5432",
            user: dbCreds.user,
            pass: dbCreds.pass || "",
            dbname,
            schema_name: selectedSchema,
            table_name: selectedTables[0],
          };
      const res = await previewDbTable(withDbPass(payload));
      const cols = res?.data?.columns || [];
      const types = res?.data?.column_types || {};
      const rows = res?.data?.rows || [];
      const totalRows = Number(res?.data?.total_rows || rows.length || 0);
      setPreviewColumns(cols);
      setPreviewColumnTypes(types);
      setPreviewRows(rows);
      setPreviewTotalRows(totalRows);
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
      alert(err?.response?.data?.detail || "Failed to preview selected table.");
    }
  };

  const setRuleDraft = (columnName, key, value) => {
    const base = prev => defaultRuleDraftForType(prev?.data_type);
    setRuleDrafts((prev) => ({
      ...prev,
      [columnName]: {
        ...defaultRuleDraftForType("String"),
        ...(prev[columnName] || {}),
        [key]: value,
      },
    }));
  };

  const handleLookupFileUpload = async (columnName, file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const values = parseLookupValuesFromText(text);
      if (values.length === 0) {
        alert("No lookup values found in the uploaded file.");
        return;
      }
      setRuleDraft(columnName, "master_data_text", values.join(", "));
    } catch (err) {
      alert("Failed to read lookup file.");
    }
  };

  const openLookupModal = (columnName) => {
    const draft = ruleDrafts[columnName] || {};
    const existing = String(draft.master_data_text || "");
    const defaultSchema =
      selectedSchema || Object.keys(tablesBySchema || {})[0] || "";
    setTablePasteBuffer(
      existing
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .join("\n"),
    );
    setLookupModal({ open: true, columnName, view: "choice" });
    setLookupDbConnMode(inputConnectionId ? "saved" : "manual");
    setLookupDbLoadMessage("");
    setLookupDbColumns([]);
    if (!dbCreds.dbname?.trim()) {
      setDbCreds((prev) => ({ ...prev, dbname: "mdms" }));
    }
    setLookupDbState((prev) => ({
      ...prev,
      schema_name: defaultSchema,
      table_name: "",
      column_name: "",
      loading: false,
    }));
  };

  const closeLookupModal = () => {
    setLookupModal({ open: false, columnName: null, view: "choice" });
    setTablePasteBuffer("");
    setLookupDbState({
      schema_name: "",
      table_name: "",
      column_name: "",
      limit: "",
      loading: false,
    });
    setLookupDbConnMode("saved");
    setLookupDbLoadMessage("");
    setLookupDbColumns([]);
  };

  const handleLookupFileFromModal = async (file) => {
    if (!file || !lookupModal.columnName) return;
    await handleLookupFileUpload(lookupModal.columnName, file);
    closeLookupModal();
  };

  const applyTablePaste = () => {
    const col = lookupModal.columnName;
    if (!col) return;
    const lines = tablePasteBuffer
      .split(/\r?\n/)
      .flatMap((line) => line.split(/[\t,]/))
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      alert("No values found. Paste text or table data with one or more values.");
      return;
    }
    setRuleDraft(col, "master_data_text", lines.join(", "));
    closeLookupModal();
  };

  const canUseDbLookup =
    lookupDbConnMode === "saved"
      ? Boolean(inputConnectionId && (dbCreds.dbname || "mdms"))
      : Boolean(dbCreds.host && dbCreds.user && (dbCreds.dbname || "mdms"));

  const dbLookupTables = tablesBySchema[lookupDbState.schema_name] || [];

  const loadDbLookupValues = async () => {
    const col = lookupModal.columnName;
    if (!col) return;
    if (!lookupDbState.schema_name || !lookupDbState.table_name || !lookupDbState.column_name) {
      alert("Select schema, table, and column first.");
      return;
    }
    if (!canUseDbLookup) {
      alert("Please fill DB connection details and database name in Step 1 first.");
      return;
    }
    setLookupDbState((s) => ({ ...s, loading: true }));
    try {
      const dbname = (dbCreds.dbname || "mdms").trim();
      const payload = lookupDbConnMode === "saved"
        ? {
            connection_id: Number(inputConnectionId),
            dbname,
            schema_name: lookupDbState.schema_name,
            table_name: lookupDbState.table_name,
            column_name: lookupDbState.column_name,
            limit: lookupDbState.limit === "" ? undefined : Number(lookupDbState.limit),
          }
        : {
            host: dbCreds.host,
            port: dbCreds.port || "5432",
            user: dbCreds.user,
            pass: dbCreds.pass || "",
            dbname,
            schema_name: lookupDbState.schema_name,
            table_name: lookupDbState.table_name,
            column_name: lookupDbState.column_name,
            limit: lookupDbState.limit === "" ? undefined : Number(lookupDbState.limit),
          };
      const res = await getDbLookupValues(withDbPass(payload));
      const values = (res?.data?.values || []).map((v) => String(v).trim()).filter(Boolean);
      if (values.length === 0) {
        alert("No values found in selected DB column.");
        return;
      }
      setRuleDraft(col, "master_data_text", values.join(", "));
      closeLookupModal();
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to fetch lookup values from DB.");
    } finally {
      setLookupDbState((s) => ({ ...s, loading: false }));
    }
  };

  const loadLookupTableColumns = async (schemaName, tableName) => {
    setLookupDbColumns([]);
    if (!schemaName || !tableName) return;
    try {
      const dbname = (dbCreds.dbname || "mdms").trim();
      const payload = lookupDbConnMode === "saved"
        ? {
            connection_id: Number(inputConnectionId),
            dbname,
            schema_name: schemaName,
            table_name: tableName,
          }
        : {
            host: dbCreds.host,
            port: dbCreds.port || "5432",
            user: dbCreds.user,
            pass: dbCreds.pass || "",
            dbname,
            schema_name: schemaName,
            table_name: tableName,
          };
      const res = await getDbTableColumns(withDbPass(payload));
      const cols = res?.data?.columns || [];
      setLookupDbColumns(cols);
      if (cols.length > 0) {
        setLookupDbState((s) => ({ ...s, column_name: cols[0] }));
      }
    } catch (err) {
      setLookupDbColumns([]);
      setLookupDbState((s) => ({ ...s, column_name: "" }));
      alert(err?.response?.data?.detail || "Failed to load column names.");
    }
  };

  const handleFinishCreateJob = async () => {
    if (!newJobName) {
      alert("Enter a job name.");
      return;
    }

    const activeColumns = ruleColumns.filter((col) => {
      const draft = ruleDrafts[col.column_name] || defaultRuleDraftForType(col.data_type);
      return draft.is_active !== false;
    });

    if (activeColumns.length === 0) {
      alert("Please enable and configure at least one validation rule before finishing.");
      return;
    }

    for (const col of activeColumns) {
      const draft = ruleDrafts[col.column_name] || defaultRuleDraftForType(col.data_type);
      if (RULES_REQUIRING_VALUE.has(draft.rule_type) && !String(draft.rule_value || "").trim()) {
        alert(`Please enter a value for ${col.column_name}`);
        return;
      }
      if (draft.rule_type === "fuzzy_match" && !String(draft.master_data_text || "").trim()) {
        alert(`Please enter lookup values for ${col.column_name} (comma separated).`);
        return;
      }
    }

    let createdJobIdForRollback = null;
    try {
      if (editFlow.isEdit && editFlow.jobId && editFlow.tableId) {
        if (createDataMode === "file") {
          const hasPath = String(uploadFilePath || "").trim().length > 0;
          const effectiveSourcePath =
            String(uploadFilePath || "").trim() || String(uploadSourcePath || "").trim();
          if (hasPath) {
            await replaceTableFileFromPath(
              editFlow.jobId,
              editFlow.tableId,
              String(uploadFilePath).trim()
            );
          } else if (uploadFile) {
            await replaceTableFileUpload(
              editFlow.jobId,
              editFlow.tableId,
              uploadFile,
              effectiveSourcePath
            );
          }
        }

        await renameJob(editFlow.jobId, newJobName);
        const existingRuleByColumn = new Map(
          (editFlow.existingRules || []).map((r) => [r.column_name, r])
        );

        for (const col of ruleColumns) {
          const draft = ruleDrafts[col.column_name] || defaultRuleDraftForType(col.data_type);
          const existing = existingRuleByColumn.get(col.column_name);
          const masterData =
            draft.rule_type === "fuzzy_match"
              ? String(draft.master_data_text || "")
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean)
              : [];
          const payload = {
            job_id: editFlow.jobId,
            table_id: editFlow.tableId,
            column_name: col.column_name,
            rule_type: draft.rule_type,
            data_type: normalizeDataType(col.data_type),
            rule_value: draft.rule_type === "fuzzy_match" ? "80" : draft.rule_value || null,
            is_active: draft.is_active !== false,
            master_data: masterData,
          };
          if (existing) {
            await updateRule(existing.rule_id, {
              rule_type: payload.rule_type,
              rule_value: payload.rule_value,
              is_active: payload.is_active,
              master_data: payload.master_data,
            });
          } else if (payload.is_active) {
            await addRule(payload);
          }
        }

        const tableDetailsRes = await getTableDetails(editFlow.jobId, editFlow.tableId);
        const outputCols = tableDetailsRes?.data?.columns || [];
        setOutputSummary({
          jobId: editFlow.jobId,
          tableId: editFlow.tableId,
          tableName: editFlow.tableName || "Table",
          rowCount: 0,
          columnCount: outputCols.length,
          outputFile: `${editFlow.tableName || "table"}.csv`,
        });
        setShowRuleStep(false);
        setShowOutputStep(true);
        if (createDataMode === "db") {
          prefillOutputConnectionFromInput();
        }
        return;
      }

      let jobId = null;
      let latestTable;
      if (createDataMode === "file") {
        if (!uploadFile && !uploadFilePath.trim()) {
          alert("Choose a CSV file or provide a file path.");
          return;
        }
        const effectiveSourcePath =
          String(uploadFilePath || "").trim() || String(uploadSourcePath || "").trim();
        const createRes = await createNewJob(newJobName);
        jobId = createRes?.data?.job_id;
        if (!jobId) throw new Error("Unable to create job");
        createdJobIdForRollback = jobId;
        if (uploadFilePath.trim()) {
          await uploadCsvPathToJob(jobId, uploadFilePath.trim());
        } else {
          await uploadCsvToJob(
            jobId,
            uploadFile,
            showFilePreview ? previewEditable : [],
            effectiveSourcePath
          );
        }
        const tablesRes = await getTablesByJob(jobId);
        const createdTables = tablesRes?.data || [];
        latestTable = [...createdTables].sort((a, b) => b.table_id - a.table_id)[0];
      } else {
        const payload = {
          job_name: newJobName,
          dbname: (dbCreds.dbname || "mdms").trim(),
          schema_name: selectedSchema,
          table_names: selectedTables,
        };
        if (inputConnectionId) {
          payload.connection_id = Number(inputConnectionId);
        } else {
          payload.host = dbCreds.host;
          payload.port = dbCreds.port || "5432";
          payload.user = dbCreds.user;
          payload.pass = dbCreds.pass || "";
        }
        const dbRes = await connectToDb(withDbPass(payload));
        jobId = dbRes?.data?.created_jobs?.[0]?.job_id;
        if (!jobId) throw new Error("Unable to create DB job");
        createdJobIdForRollback = jobId;
        const tablesRes = await getTablesByJob(jobId);
        const createdTables = tablesRes?.data || [];
        latestTable = [...createdTables].sort((a, b) => b.table_id - a.table_id)[0];
      }
      if (!latestTable?.table_id) throw new Error("Uploaded table not found for rule setup.");

      const addRuleCalls = activeColumns.map((col) => {
        const draft = ruleDrafts[col.column_name] || defaultRuleDraftForType(col.data_type);
        const masterData =
          draft.rule_type === "fuzzy_match"
            ? String(draft.master_data_text || "")
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean)
            : [];
        return addRule({
          job_id: jobId,
          table_id: latestTable.table_id,
          column_name: col.column_name,
          rule_type: draft.rule_type,
          data_type: normalizeDataType(col.data_type),
          rule_value:
            draft.rule_type === "fuzzy_match" ? "80" : draft.rule_value || null,
          is_active: true,
          master_data: masterData,
        });
      });
      await Promise.all(addRuleCalls);

      const tableDetailsRes = await getTableDetails(jobId, latestTable.table_id);
      const outputCols = tableDetailsRes?.data?.columns || [];
      setOutputSummary({
        jobId,
        tableId: latestTable.table_id,
        tableName: latestTable.table_name,
        rowCount: latestTable.row_count,
        columnCount: outputCols.length,
        outputFile: `${latestTable.table_name}.csv`,
      });
      setShowRuleStep(false);
      setShowOutputStep(true);
      if (createDataMode === "db") {
        prefillOutputConnectionFromInput();
      }
    } catch (err) {
      if (createdJobIdForRollback) {
        try {
          await deleteJob(createdJobIdForRollback);
          await fetchJobs();
        } catch {
          // Best-effort cleanup if upload/rules failed after job row was created.
        }
      }
      const detail = err?.response?.data?.detail;
      alert(
        detail ||
          err?.message ||
          "Failed to complete all steps and create job. Any partial job was removed."
      );
    }
  };

  const handlePreviewCsv = async () => {
    if (!validateFileInputStep1()) return;
    try {
      const res = uploadFilePath.trim()
        ? await previewCsvFileFromPath(uploadFilePath.trim())
        : await previewCsvFile(uploadFile);
      const cols = res?.data?.columns || [];
      const types = res?.data?.column_types || {};
      const rows = res?.data?.rows || [];
      const totalRows = Number(res?.data?.total_rows || rows.length || 0);
      setPreviewColumns(cols);
      setPreviewColumnTypes(types);
      setPreviewRows(rows);
      setPreviewTotalRows(totalRows);
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
      !dbCreds.host ||
      !dbCreds.user ||
      !dbCreds.dbname ||
      !selectedSchema ||
      selectedTables.length === 0
    ) {
      alert("Please enter job name, DB credentials, database, schema and select table(s).");
      return;
    }

    try {
      const payload = {
        job_name: newJobName,
        dbname: dbCreds.dbname,
        schema_name: selectedSchema,
        table_names: selectedTables,
      };
      if (inputConnectionId) {
        payload.connection_id = Number(inputConnectionId);
      } else {
        payload.host = dbCreds.host;
        payload.port = dbCreds.port || "5432";
        payload.user = dbCreds.user;
        payload.pass = dbCreds.pass || "";
      }
      await connectToDb(withDbPass(payload));
      alert("Job created from database successfully.");
      setShowAddModal(false);
      setNewJobName("");
      setDbCreds({ host: "", port: "", user: "", pass: "", dbname: "" });
      setSchemaOptions([]);
      setSelectedSchema("");
      setTablesBySchema({});
      setTableOptions([]);
      setSelectedTables([]);
      setInputConnectionId("");
      fetchJobs();
    } catch (err) {
      alert(
        err?.response?.data?.detail ||
          "Failed to connect database and create job."
      );
    }
  };

  const resolveActiveInputConnectionId = () => {
    const id = String(inputConnectionId || "").trim();
    if (!id) return "";
    const exists = savedConnections.some((c) => String(c.connection_id) === id);
    return exists ? id : "";
  };

  const buildListSchemasPayload = (connectionId = resolveActiveInputConnectionId()) => {
    const dbname = (dbCreds.dbname || "mdms").trim();
    const payload = connectionId
      ? {
          connection_id: Number(connectionId),
          dbname,
          host: dbCreds.host,
          port: dbCreds.port || "5432",
          user: dbCreds.user,
          pass: dbCreds.pass || "",
        }
      : {
          host: dbCreds.host,
          port: dbCreds.port || "5432",
          user: dbCreds.user,
          pass: dbCreds.pass || "",
          dbname,
        };
    if (dbCreds.pass) payload.pass = dbCreds.pass;
    return payload;
  };

  const applySchemasResponse = (data) => {
    const schemas = data?.schemas || [];
    const tableMap = data?.tables_by_schema || {};
    setSchemaOptions(schemas);
    setTablesBySchema(tableMap);
    const firstSchema = schemas[0] || "";
    setSelectedSchema(firstSchema);
    const firstTables = tableMap[firstSchema] || [];
    setTableOptions(firstTables);
    setSelectedTables(firstTables.length > 0 ? [firstTables[0]] : []);
    let tableCt = 0;
    Object.values(tableMap || {}).forEach((arr) => {
      tableCt += (arr || []).length;
    });
    return { schemaCount: schemas.length, tableCount: tableCt };
  };

  const handleFetchTables = async (connectionId = resolveActiveInputConnectionId()) => {
    const dbname = (dbCreds.dbname || "mdms").trim();
    if (!dbname) {
      alert("Please enter the Database field (e.g. mdms).");
      return false;
    }
    if (!connectionId && (!dbCreds.host?.trim() || !dbCreds.user?.trim())) {
      alert(
        "Either pick a saved connection from the dropdown, or fill Host and Username manually, then click Load tables."
      );
      return false;
    }
    if (!connectionId && !dbCreds.pass?.trim()) {
      alert("Enter the database Password, then click Load tables.");
      return false;
    }
    if (!dbCreds.dbname?.trim()) {
      setDbCreds((prev) => ({ ...prev, dbname }));
    }
    setSchemasLoadBusy(true);
    setSchemasLoadHint("");
    try {
      const res = await listSchemasTables(buildListSchemasPayload(connectionId));
      const { schemaCount, tableCount } = applySchemasResponse(res?.data);
      if (schemaCount === 0) {
        setSchemasLoadHint(
          "Connected, but no schemas were returned. Check the database name (try mdms)."
        );
      } else {
        setSchemasLoadHint(
          `Loaded ${schemaCount} schema(s) and ${tableCount} table(s). Pick schema and table(s) below.`
        );
        window.setTimeout(() => {
          schemaSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 100);
      }
      return schemaCount > 0;
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : err?.response?.status === 404
            ? "Saved connection not found. Pick another profile or save a new one."
            : "Failed to fetch schema/table list.";
      setSchemasLoadHint("");
      alert(msg);
      return false;
    } finally {
      setSchemasLoadBusy(false);
    }
  };

  const handleOutputDbLoadTargets = async () => {
    setOutputDbState((s) => ({ ...s, message: "" }));
    const connForOutput =
      outputDbMode === "saved" ? outputConnectionId : inputConnectionId;
    const ok = await handleFetchTables(connForOutput);
    if (ok) {
      const firstSchema = (schemaOptions && schemaOptions[0]) || Object.keys(tablesBySchema || {})[0] || "";
      setOutputDbState((s) => ({
        ...s,
        targetSchema: firstSchema,
      }));
    }
  };

  const exportOutputToDbByTableId = async (tableId, jobIdOverride = null) => {
    if (!tableId) {
      throw new Error("Output table not found.");
    }
    if (!isTableExportFullyConfigured()) {
      throw new Error(
        "Table export is not configured. In Step 4 choose Table Output, saved connection, target database (not mdms), and target table, then click Done."
      );
    }
    const resolvedTargetTable = String(outputDbState.targetTable || "").trim();
    const exportJobId = jobIdOverride ?? outputSummary?.jobId;
    if (!exportJobId) {
      throw new Error("Job id not found for export.");
    }
    const usingSaved = outputDbMode === "saved";
    if (!usingSaved && outputSaveConnection && !outputConnectionName.trim()) {
      throw new Error("Please enter a connection name.");
    }

    setOutputDbState((s) => ({ ...s, loading: true, message: "" }));
    try {
      if (!usingSaved && outputSaveConnection) {
        const saveRes = await saveDbConnection({
          connection_name: outputConnectionName.trim(),
          host: dbCreds.host,
          port: dbCreds.port || "5432",
          user: dbCreds.user,
          pass: dbCreds.pass || "",
        });
        await fetchSavedConnections();
        const newId = saveRes?.data?.connection_id;
        if (newId) {
          setOutputConnectionId(String(newId));
          setOutputDbMode("saved");
        }
      }

      const payload = withDbPass(
        buildExportDbPayload(tableId, exportJobId, resolvedTargetTable)
      );
      const res = await exportResultsToDb(payload);
      setOutputDbState((s) => ({
        ...s,
        targetTable: resolvedTargetTable,
        message: `Exported ${res?.data?.rows_exported ?? 0} rows to ${(res?.data?.target_dbname || dbCreds.dbname)}.${res?.data?.target_schema || "public"}.${res?.data?.target_table || resolvedTargetTable}`,
      }));
    } catch (err) {
      const apiDetail = err?.response?.data?.detail || "";
      const isSchemaMismatch =
        typeof apiDetail === "string" &&
        apiDetail.toLowerCase().includes("schema mismatch for append mode");
      setOutputDbState((s) => ({
        ...s,
        message: isSchemaMismatch
          ? `${apiDetail} Tip: choose "Replace" if you want to overwrite that table, or enter a new target table name to create a separate table.`
          : apiDetail || "Failed to export to DB",
      }));
      throw err;
    } finally {
      setOutputDbState((s) => ({ ...s, loading: false }));
    }
  };

  const handleExportOutputToDb = async () => {
    if (!outputSummary?.tableId) {
      alert("Output table not found.");
      return;
    }
    try {
      await exportOutputToDbByTableId(outputSummary.tableId);
    } catch {
      // Message already handled in export helper.
    }
  };

  const saveBlobAsFile = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAutoDownloadForJob = async (jobId, tablesForJob, format) => {
    const latestTable = [...(tablesForJob || [])].sort((a, b) => b.table_id - a.table_id)[0];
    if (!latestTable?.table_id) return;
    try {
      if (format === "csv") {
        const { blob, filename } = await downloadTableOutputCsv(jobId, latestTable.table_id);
        saveBlobAsFile(blob, filename);
      } else {
        const { blob, filename } = await downloadTableOutputExcel(jobId, latestTable.table_id);
        saveBlobAsFile(blob, filename);
      }
    } catch (err) {
      alert(err?.response?.data?.detail || `Failed to auto-download ${format.toUpperCase()}`);
    }
  };

  const handleAutoSharePointForJob = async (tablesForJob) => {
    const latestTable = [...(tablesForJob || [])].sort((a, b) => b.table_id - a.table_id)[0];
    if (!latestTable?.table_id) return;
    try {
      const payload = {
        format: outputSharePointState.format || "csv",
      };
      if ((outputSharePointState.folderPath || "").trim()) {
        payload.folder_path = outputSharePointState.folderPath.trim();
      }
      const res = await uploadTableOutputToSharePoint(latestTable.table_id, payload);
      alert(res?.data?.message || "Uploaded to SharePoint successfully.");
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to upload to SharePoint");
    }
  };

  const handleAutoEmailForJob = async (tablesForJob) => {
    if (!outputEmailState.toEmail.trim()) {
      alert("Please enter recipient email for Email File action.");
      return;
    }
    const latestTable = [...(tablesForJob || [])].sort((a, b) => b.table_id - a.table_id)[0];
    if (!latestTable?.table_id) return;
    try {
      const res = await emailTableOutput(latestTable.table_id, {
        to_email: outputEmailState.toEmail.trim(),
        format: outputEmailState.format,
        subject: `MDQM Results - ${latestTable.table_name || "Output"}`,
      });
      alert(res?.data?.message || "Email sent successfully.");
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to send email.");
    }
  };

  const handleDownloadOutput = async (format) => {
    if (!outputSummary?.tableId || !outputSummary?.jobId) {
      alert("Output table not found.");
      return;
    }
    try {
      if (format === "csv") {
        const { blob, filename } = await downloadTableOutputCsv(outputSummary.jobId, outputSummary.tableId);
        saveBlobAsFile(blob, filename);
      } else {
        const { blob, filename } = await downloadTableOutputExcel(outputSummary.jobId, outputSummary.tableId);
        saveBlobAsFile(blob, filename);
      }
    } catch (err) {
      alert(err?.response?.data?.detail || `Failed to download ${format.toUpperCase()}`);
    }
  };

  const closeScheduleModal = () => {
    setShowSchedule(false);
    setScheduleContextJobId(null);
  };

  const handleSaveSchedule = async () => {
    const jobId = scheduleContextJobId ?? outputSummary?.jobId;
    if (!jobId) {
      alert("Job ID not found.");
      return;
    }
    const payload = {
      type: scheduleType,
      time: scheduleTime || "",
      day: scheduleDay || "",
      date: scheduleDate || "",
      interval: Number(hourInterval || 1),
      cron: cronExpression || "",
    };
    try {
      await scheduleJob(jobId, payload);
      await fetchJobs();
      closeScheduleModal();
      alert("Scheduled successfully");
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to schedule job.");
    }
  };

  const handlePauseSchedule = async (jobId) => {
    try {
      await pauseSchedule(jobId);
      await fetchJobs();
      alert(`Schedule paused for Job ${jobId}`);
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to pause schedule.");
    }
  };

  const handleResumeSchedule = async (jobId) => {
    try {
      await resumeSchedule(jobId);
      await fetchJobs();
      alert(`Schedule resumed for Job ${jobId}`);
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to resume schedule.");
    }
  };

  const handleDeleteSchedule = async (jobId) => {
    try {
      await deleteSchedule(jobId);
      await fetchJobs();
      alert(`Schedule deleted for Job ${jobId}`);
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to delete schedule.");
    }
  };

  const handleLoadLookupSchemasTables = async () => {
    setLookupDbLoadMessage("");
    const ok = await handleFetchTables();
    if (ok) {
      setLookupDbLoadMessage("Successfully loaded schemas and tables.");
    }
  };

  const fetchSavedConnections = async () => {
    try {
      const res = await listSavedConnections();
      const items = res?.data || [];
      setSavedConnections(items);
    } catch (err) {
      console.error(err);
    }
  };

  const applySavedConnectionToCreds = (value) => {
    const selected = savedConnections.find(
      (c) => String(c.connection_id) === String(value)
    );
    if (!selected) return;
    setConnectionName(selected.connection_name || "");
    setDbCreds((prev) => ({
      ...prev,
      host: selected.host || "",
      port: selected.port || "5432",
      user: selected.user || "",
      pass: "",
      dbname: prev.dbname || "mdms",
    }));
    getSavedConnectionCredentials(Number(value))
      .then((res) => {
        const creds = res?.data;
        if (!creds) return;
        setDbCreds((prev) => ({
          ...prev,
          host: creds.host || prev.host,
          port: creds.port || prev.port,
          user: creds.user || prev.user,
          pass: creds.password || "",
        }));
      })
      .catch(() => {});
  };

  const handleInputConnectionChange = (value) => {
    setInputConnectionId(value);
    applySavedConnectionToCreds(value);
  };

  const handleOutputConnectionChange = (value) => {
    setOutputConnectionId(value);
    applySavedConnectionToCreds(value);
  };

  const handleTestConnection = async () => {
    const connId = resolveActiveInputConnectionId();
    const dbname = (dbCreds.dbname || "mdms").trim();
    if (!connId && (!dbCreds.host?.trim() || !dbCreds.user?.trim())) {
      alert("Pick a saved connection or fill Host and Username.");
      return;
    }
    if (!connId && !dbCreds.pass?.trim()) {
      alert("Enter the database Password.");
      return;
    }
    try {
      const payload = connId
        ? {
            connection_id: Number(connId),
            dbname,
            host: dbCreds.host,
            port: dbCreds.port || "5432",
            user: dbCreds.user,
            pass: dbCreds.pass || "",
          }
        : {
            host: dbCreds.host,
            port: dbCreds.port || "5432",
            user: dbCreds.user,
            pass: dbCreds.pass || "",
            dbname,
          };
      await testDbConnection(withDbPass(payload));
      if (!dbCreds.dbname?.trim()) {
        setDbCreds((prev) => ({ ...prev, dbname }));
      }
      alert("Connection successful. Click Load tables to list schemas.");
    } catch (err) {
      alert(err?.response?.data?.detail || "Connection test failed.");
    }
  };

  const handleSaveConnection = async () => {
    if (!connectionName || !dbCreds.host || !dbCreds.port || !dbCreds.user) {
      alert("Fill connection name, host, port and username.");
      return;
    }
    if (!dbCreds.pass?.trim()) {
      alert("Enter the database password before saving (required for encrypted storage).");
      return;
    }
    try {
      const res = await saveDbConnection({
        connection_name: connectionName,
        host: dbCreds.host,
        port: dbCreds.port,
        user: dbCreds.user,
        pass: dbCreds.pass,
        db_type: "postgres",
      });
      const newId = res?.data?.connection_id;
      alert("Connection saved.");
      setConnectionName("");
      await fetchSavedConnections();
      if (newId != null) {
        setInputConnectionId(String(newId));
        if (!dbCreds.dbname?.trim()) {
          setDbCreds((prev) => ({ ...prev, dbname: "mdms" }));
        }
      }
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : "Failed to save connection. Use a unique connection name or update an existing profile on DB Connections.";
      alert(msg);
    }
  };

  const toggleTableSelection = (tableName) => {
    setSelectedTables((prev) =>
      prev.includes(tableName) ? prev.filter((d) => d !== tableName) : [...prev, tableName]
    );
  };

  const selectAllTables = () => setSelectedTables(tableOptions);
  const clearSelectedTables = () => setSelectedTables([]);

  const handleEditableChange = (index, field, value) => {
    setPreviewEditable((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
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
    <div className="joblist-theme-root bg-background text-foreground relative">
      {showSchedule &&
        createPortal(
          <div className="fixed inset-0 z-[105] overflow-y-auto overscroll-contain">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
              aria-hidden
              onClick={closeScheduleModal}
            />
            <div className="relative flex min-h-full justify-center p-4 sm:p-6 pointer-events-none">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="schedule-job-modal-title"
                className="pointer-events-auto my-auto flex w-full max-w-xl max-h-[min(90vh,calc(100dvh-2rem))] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <h4 id="schedule-job-modal-title" className="text-sm font-bold uppercase tracking-widest text-foreground">
                Schedule Job
                {scheduleContextJobId != null ? ` #${scheduleContextJobId}` : ""}
              </h4>
              <button
                type="button"
                onClick={closeScheduleModal}
                className="p-1 text-gray-500 hover:text-black"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2 block">Schedule Type</label>
                <select
                  value={scheduleType}
                  onChange={(e) => setScheduleType(e.target.value)}
                  className="w-full border border-border bg-input text-input-foreground p-2 rounded"
                >
                  <option value="once">once</option>
                  <option value="hourly">hourly</option>
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                  <option value="monthly">monthly</option>
                  <option value="cron">cron</option>
                </select>
              </div>

              {scheduleType === "once" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="border border-[#A1A3AF] p-2 rounded" />
                  <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="border border-[#A1A3AF] p-2 rounded" />
                </div>
              )}
              {scheduleType === "hourly" && (
                <input
                  type="number"
                  min={1}
                  value={hourInterval}
                  onChange={(e) => setHourInterval(Number(e.target.value) || 1)}
                  className="w-full border border-border bg-input text-input-foreground p-2 rounded"
                  placeholder="Every X hours"
                />
              )}
              {scheduleType === "daily" && (
                <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="w-full border border-[#A1A3AF] p-2 rounded" />
              )}
              {scheduleType === "weekly" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select value={scheduleDay} onChange={(e) => setScheduleDay(e.target.value)} className="border border-border bg-input text-input-foreground p-2 rounded">
                    <option value="0">0 (Monday)</option>
                    <option value="1">1 (Tuesday)</option>
                    <option value="2">2 (Wednesday)</option>
                    <option value="3">3 (Thursday)</option>
                    <option value="4">4 (Friday)</option>
                    <option value="5">5 (Saturday)</option>
                    <option value="6">6 (Sunday)</option>
                  </select>
                  <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="border border-[#A1A3AF] p-2 rounded" />
                </div>
              )}
              {scheduleType === "monthly" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="border border-border bg-input text-input-foreground p-2 rounded"
                    placeholder="1-31"
                  />
                  <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="border border-[#A1A3AF] p-2 rounded" />
                </div>
              )}
              {scheduleType === "cron" && (
                <input
                  type="text"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  className="w-full border border-[#A1A3AF] p-2 rounded"
                  placeholder="* * * * *"
                />
              )}
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
                <button
                  type="button"
                  onClick={closeScheduleModal}
                  className="px-4 py-2 border border-border rounded font-bold uppercase text-xs text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSchedule}
                  className="px-4 py-2 bg-primary text-white rounded font-bold uppercase text-xs hover:bg-primary/90"
                >
                  Save Schedule
                </button>
            </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <div className="fixed top-6 right-6 z-[80] space-y-2 w-[300px]">
        {schedulerToasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-md border px-3 py-2 shadow-md bg-card transition-all duration-300 ${
              toast.status === "running"
                ? "border-blue-200"
                : toast.status === "completed"
                  ? "border-emerald-200"
                  : "border-rose-200"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <span className="mt-0.5">
                  {toast.status === "running" ? (
                    <Loader2 size={14} className="animate-spin text-blue-600" />
                  ) : toast.status === "completed" ? (
                    <CheckCircle2 size={14} className="text-emerald-600" />
                  ) : (
                    <AlertTriangle size={14} className="text-rose-600" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider font-bold truncate">
                    {toast.title}
                  </div>
                  <div className="text-[11px] text-gray-600 mt-1">
                    Duration:{" "}
                    {toast.status === "running"
                      ? formatRunningDuration(toast.startTime)
                      : toast.durationLabel}
                  </div>
                  {toast.nextRunTime ? (
                    <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
                      <Clock3 size={11} />
                      Next: {new Date(toast.nextRunTime).toLocaleString()}
                    </div>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Close toast"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {/* HEADER */}
      <div className="p-4 h-24 border-b border-border flex justify-between items-center pr-8 bg-background">
        <h1 className="text-4xl pl-4 font-thin tracking-tighter uppercase">
          {readOnly ? "Job Audit Log" : "Job List"}
        </h1>
        {!readOnly && (
          <button
            onClick={openCreateJobModal}
            className="bg-[#23243B] text-white px-6 py-3 text-md font-semibold uppercase tracking-widest cursor-pointer hover:bg-black transition-colors flex items-center gap-2"
          >
            <Plus size={20} />
            NEW JOB
          </button>
        )}
      </div>

      <div className="p-8 flex flex-col gap-4">
        {!readOnly && (() => {
          const incompleteCount = jobs.filter((j) => (j.total_tables || 0) === 0).length;
          if (incompleteCount === 0 || showIncompleteJobs) return null;
          return (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span>
                {incompleteCount} incomplete job{incompleteCount === 1 ? "" : "s"} hidden (no data
                attached — usually from a failed upload). You can delete them or try NEW JOB again.
              </span>
              <div className="flex flex-wrap gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowIncompleteJobs(true)}
                  className="text-xs font-bold uppercase tracking-wider underline hover:no-underline"
                >
                  Show incomplete
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAllIncomplete}
                  className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 bg-rose-700 text-white rounded hover:bg-rose-800"
                >
                  Delete all incomplete
                </button>
              </div>
            </div>
          );
        })()}
        {!readOnly && showIncompleteJobs &&
          jobs.some((j) => (j.total_tables || 0) === 0) && (
            <div className="flex flex-wrap gap-3 self-start">
              <button
                type="button"
                onClick={() => setShowIncompleteJobs(false)}
                className="text-xs font-bold uppercase tracking-wider text-gray-500 underline hover:no-underline"
              >
                Hide incomplete jobs
              </button>
              <button
                type="button"
                onClick={handleDeleteAllIncomplete}
                className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 bg-rose-700 text-white rounded hover:bg-rose-800"
              >
                Delete all incomplete
              </button>
            </div>
          )}
        {(showIncompleteJobs
          ? jobs
          : jobs.filter((j) => (j.total_tables || 0) > 0)
        ).map((job) => (
          <div
            key={job.job_id}
            className="border border-border bg-card shadow-sm relative"
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
                    <div className="text-[11px] text-gray-500 mt-1">
                      Schedule:{" "}
                      {schedulesByJob[job.job_id]
                        ? schedulesByJob[job.job_id].paused
                          ? "Paused"
                          : `Active | Next run: ${
                              schedulesByJob[job.job_id].next_run_time
                                ? new Date(schedulesByJob[job.job_id].next_run_time).toLocaleString()
                                : "n/a"
                            }`
                        : "Not scheduled"}
                    </div>
                    <span className={`inline-block mt-1 text-[10px] uppercase tracking-wider px-2 py-0.5 ${ (job.total_tables || 0) > 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                      {(job.total_tables || 0) > 0 ? "Ready" : "No Data"}
                    </span>
                    {(job.total_tables || 0) === 0 && (
                      <p className="text-[11px] text-amber-700 mt-1 max-w-md">
                        Setup did not finish (upload or import failed). Use the menu to delete, or
                        create the job again with NEW JOB.
                      </p>
                    )}
                    {runStatusByJob[job.job_id] === "running" && (
                      <span className="inline-block mt-1 ml-2 text-[10px] uppercase tracking-wider px-2 py-0.5 bg-blue-100 text-blue-700">
                        Running
                      </span>
                    )}
                    {runStatusByJob[job.job_id] === "success" && (
                      <span className="inline-block mt-1 ml-2 text-[10px] uppercase tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-700">
                        Completed
                      </span>
                    )}
                    {runStatusByJob[job.job_id] === "error" && (
                      <span className="inline-block mt-1 ml-2 text-[10px] uppercase tracking-wider px-2 py-0.5 bg-red-100 text-red-700">
                        Failed
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if ((job.total_tables || 0) === 0) {
                          alert("No tables attached to this job. Upload/import data first.");
                          return;
                        }
                        handleRunJob(job.job_id, e);
                      }}
                      disabled={(job.total_tables || 0) === 0 || !!runningJobs[job.job_id]}
                      className={`min-w-[150px] justify-center text-white px-6 py-3 text-md uppercase tracking-widest flex items-center gap-2 transition-colors ${
                        (job.total_tables || 0) === 0 || runningJobs[job.job_id]
                          ? "bg-gray-400 cursor-not-allowed"
                          : "bg-green-600 cursor-pointer hover:bg-green-700"
                      }`}
                    >
                      {runningJobs[job.job_id] ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play size={15} />
                          Run Job
                        </>
                      )}
                    </button>
                  )}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionMenu({ type: "job", id: job.job_id });
                      }}
                      className="p-2 hover:bg-muted rounded-full"
                    >
                      <MoreVertical size={18} className="text-gray-500" />
                    </button>
                    {actionMenu.type === "job" &&
                      actionMenu.id === job.job_id && (
                        <div
                          className="absolute right-0 mt-2 w-48 bg-card border border-border shadow-lg z-10 py-1"
                          onMouseLeave={() =>
                            setActionMenu({ type: null, id: null })
                          }
                        >
                          {!readOnly && (
                            <>
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionMenu({ type: null, id: null });
                                  handleOpenEditFlow(job);
                                }}
                                className="px-4 py-2 text-xs uppercase tracking-wider hover:bg-muted cursor-pointer flex items-center gap-2"
                              >
                                <Edit2 size={12} /> Edit Job
                              </div>
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
                                className="px-4 py-2 text-xs uppercase tracking-wider hover:bg-muted cursor-pointer flex items-center gap-2"
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
                                  setActionMenu({ type: null, id: null });
                                  setScheduleContextJobId(job.job_id);
                                  setShowSchedule(true);
                                }}
                                className={`px-4 py-2 text-xs uppercase tracking-wider flex items-center gap-2 ${
                                  (job.total_tables || 0) === 0
                                    ? "text-gray-400 cursor-not-allowed bg-muted"
                                    : "hover:bg-muted cursor-pointer"
                                }`}
                              >
                                <Clock3 size={12} /> Schedule
                              </div>
                            </>
                          )}
                          <div
                            onClick={async (e) => {
                              e.stopPropagation();
                              if ((job.total_tables || 0) === 0) {
                                alert("No tables attached to this job. Upload/import data first.");
                                setActionMenu({ type: null, id: null });
                                return;
                              }
                              try {
                                const { blob, filename } = await downloadJobZip(job.job_id);
                                saveBlobAsFile(blob, filename);
                              } catch (err) {
                                const detail = err?.response?.data?.detail;
                                const msg =
                                  typeof detail === "string"
                                    ? detail
                                    : "Failed to download job ZIP (check login or run the job first).";
                                alert(msg);
                              }
                              setActionMenu({ type: null, id: null });
                            }}
                            className={`px-4 py-2 text-xs uppercase tracking-wider flex items-center gap-2 ${(job.total_tables || 0) === 0 ? "text-gray-400 cursor-not-allowed bg-muted" : "hover:bg-muted cursor-pointer"}`}
                          >
                            <Download size={12} /> Download Zip
                          </div>
                          {!readOnly && schedulesByJob[job.job_id] ? (
                            schedulesByJob[job.job_id].paused ? (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionMenu({ type: null, id: null });
                                  handleResumeSchedule(job.job_id);
                                }}
                                className="px-4 py-2 text-xs uppercase tracking-wider hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                              >
                                <Play size={12} /> Resume Schedule
                              </div>
                            ) : (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionMenu({ type: null, id: null });
                                  handlePauseSchedule(job.job_id);
                                }}
                                className="px-4 py-2 text-xs uppercase tracking-wider hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                              >
                                <Loader2 size={12} /> Pause Schedule
                              </div>
                            )
                          ) : null}
                          {!readOnly && schedulesByJob[job.job_id] ? (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionMenu({ type: null, id: null });
                                handleDeleteSchedule(job.job_id);
                              }}
                              className="px-4 py-2 text-xs uppercase tracking-wider text-amber-700 hover:bg-amber-50 cursor-pointer flex items-center gap-2"
                            >
                              <Trash2 size={12} /> Delete Schedule
                            </div>
                          ) : null}
                          {!readOnly && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete("job", job.job_id);
                              }}
                              className="px-4 py-2 text-xs uppercase tracking-wider text-red-600 hover:bg-red-50 cursor-pointer flex items-center gap-2 border-t border-border"
                            >
                              <Trash2 size={12} /> Delete Job
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              </div>

              {/* JOB STATS GRID */}
              <div className="grid grid-cols-6 gap-4 border-t border-border pt-4 text-sm">
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
              <div className="bg-background border-t border-border p-6">
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
                        className="bg-card border border-border p-4 flex items-center justify-between hover:border-[var(--sidebar-border)] transition-colors cursor-pointer"
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
                            className="p-1 hover:bg-muted rounded-full"
                          >
                            <MoreVertical size={20} className="text-gray-400" />
                          </button>
                          {actionMenu.type === "table" &&
                            actionMenu.id === table.table_id && (
                              <div
                                className="absolute right-0 mt-2 w-48 bg-card border border-border shadow-lg z-10 py-1"
                                onMouseLeave={() =>
                                  setActionMenu({ type: null, id: null })
                                }
                              >
                                {!readOnly && (
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
                                )}
                                <div
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      const { blob, filename } = await downloadTableOutputExcel(
                                        job.job_id,
                                        table.table_id
                                      );
                                      saveBlobAsFile(blob, filename);
                                    } catch (err) {
                                      alert(
                                        err?.response?.data?.detail ||
                                          "Failed to download Excel (check login or run the job first)."
                                      );
                                    }
                                    setActionMenu({ type: null, id: null });
                                  }}
                                  className="px-4 py-2 text-xs uppercase tracking-wider hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                                >
                                  <Download size={12} /> Download Excel
                                </div>
                                {!readOnly && (
                                  <div
                                    onClick={() =>
                                      handleDelete("table", table.table_id)
                                    }
                                    className="px-4 py-2 text-xs uppercase tracking-wider text-red-600 hover:bg-red-50 cursor-pointer flex items-center gap-2 border-t border-border"
                                  >
                                    <Trash2 size={12} /> Remove Table
                                  </div>
                                )}
                              </div>
                            )}
                        </div>
                      </div>

                      {/* THE COLUMN AUDIT (Conditional Rendering) */}
                      {expandedTables[table.table_id] && (
                        <div className="border-x border-b border-border animate-in fade-in slide-in-from-top-2 duration-200">
                          <ColumnAudit tableId={table.table_id} readOnly={readOnly} />
                        </div>
                      )}
                    </div>
                  ))}
                  {(!tables[job.job_id] || tables[job.job_id].length === 0) && (
                    <div className="text-center py-8 text-sm text-muted-foreground uppercase tracking-widest border border-dashed border-border">
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
          <div className="bg-card p-6 border border-border w-96">
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4 text-foreground">
              Rename {renameModal.type}
            </h2>
            <input
              className="w-full bg-input border-b border-border p-2 text-sm text-input-foreground outline-none focus:border-primary mb-6"
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

      {/* --- ADD DATA MODAL (portaled — motion.main transform breaks in-flow fixed) --- */}
      {showAddModal &&
        createPortal(
          <div className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain">
            <div
              className="fixed inset-0 bg-black/30 backdrop-blur-[2px]"
              aria-hidden
              onClick={resetCreateFlow}
            />
            <div className="relative flex min-h-full justify-center p-2 sm:p-4 pointer-events-none">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-job-modal-title"
                className="pointer-events-auto my-auto flex w-full max-w-5xl max-h-[min(90vh,calc(100dvh-2rem))] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
            <div className="flex shrink-0 justify-between items-center p-5 border-b border-border bg-background">
              <span id="add-job-modal-title" className="font-bold uppercase tracking-widest text-foreground">
                {editFlow.isEdit ? "Edit Job Flow" : "Add New Job"}
              </span>
              <X
                size={20}
                className="cursor-pointer hover:text-red-500"
                onClick={resetCreateFlow}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-[#FCFCFD]">
              {/* TAB 1: CREATE JOB */}
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
                            </tr>
                          </thead>
                          <tbody>
                            {ruleColumns.map((col) => {
                              const draft = ruleDrafts[col.column_name] || {
                                ...defaultRuleDraftForType(col.data_type),
                              };
                              const normalizedType = normalizeDataType(col.data_type);
                              const allowedRules = RULE_OPTIONS_BY_TYPE[normalizedType] || RULE_OPTIONS_BY_TYPE.String;
                              return (
                                <tr key={col.column_name} className="odd:bg-white even:bg-[#FAFAFA]">
                                  <td className="p-2 border-b border-[#F1F5F9] font-semibold">{col.column_name}</td>
                                  <td className="p-2 border-b border-[#F1F5F9]">{normalizedType}</td>
                                  <td className="p-2 border-b border-[#F1F5F9]">
                                    <select
                                      value={draft.rule_type}
                                      onChange={(e) => {
                                        const nextRule = e.target.value;
                                        setRuleDraft(col.column_name, "rule_type", nextRule);
                                        if (nextRule === "fuzzy_match") {
                                          setRuleDraft(col.column_name, "rule_value", "");
                                        } else if (!RULES_REQUIRING_VALUE.has(nextRule)) {
                                          setRuleDraft(col.column_name, "rule_value", "");
                                        }
                                      }}
                                      className="w-full min-w-[170px] border border-[#D1D5DB] rounded-md p-1.5"
                                    >
                                      {allowedRules.map((rule) => (
                                        <option key={rule} value={rule}>
                                          {RULE_LABELS[rule] || rule}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="p-2 border-b border-[#F1F5F9]">
                                    {draft.rule_type === "fuzzy_match" ? (
                                      <span className="text-[11px] text-gray-500 block mb-1">
                                        Fuzzy match — use lookup values below only (no threshold field).
                                      </span>
                                    ) : RULES_REQUIRING_VALUE.has(draft.rule_type) ? (
                                      <input
                                        placeholder={
                                          draft.rule_type === "date_format_check"
                                            ? "%Y-%m-%d"
                                            : "Enter value"
                                        }
                                        value={draft.rule_value ?? ""}
                                        onChange={(e) => setRuleDraft(col.column_name, "rule_value", e.target.value)}
                                        className="w-full min-w-[120px] border border-[#D1D5DB] rounded-md p-1.5"
                                      />
                                    ) : (
                                      <span className="text-xs text-gray-400">No value required</span>
                                    )}
                                    {draft.rule_type === "fuzzy_match" && (
                                      <div className="mt-2 space-y-1">
                                        <button
                                          type="button"
                                          onClick={() => openLookupModal(col.column_name)}
                                          className="w-full py-2 px-2 text-xs font-bold uppercase tracking-wider border border-[#23243B] text-[#23243B] hover:bg-[#23243B] hover:text-white transition-colors"
                                        >
                                          {draft.master_data_text?.trim()
                                            ? `Edit lookup (${String(draft.master_data_text).split(",").filter((x) => x.trim()).length} values)`
                                            : "Add lookup values"}
                                        </button>
                                        {draft.master_data_text?.trim() ? (
                                          <p className="text-[10px] text-gray-500 max-w-[240px] leading-4">
                                            {(() => {
                                              const values = String(draft.master_data_text)
                                                .split(",")
                                                .map((x) => x.trim())
                                                .filter(Boolean);
                                              const preview = values.slice(0, 6).join(", ");
                                              const remaining = values.length - 6;
                                              return remaining > 0
                                                ? `${preview} +${remaining} more`
                                                : preview;
                                            })()}
                                          </p>
                                        ) : null}
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-2 border-b border-[#F1F5F9]">
                                    <input
                                      type="checkbox"
                                      checked={draft.is_active !== false}
                                      onChange={(e) => setRuleDraft(col.column_name, "is_active", e.target.checked)}
                                    />
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
                            handleFinishCreateJob();
                          }}
                          className="w-full py-3 bg-[#23243B] rounded-md text-white text-xs font-bold uppercase tracking-widest hover:bg-black transition-colors"
                        >
                          {editFlow.isEdit ? "Save Changes" : "Next"}
                        </button>
                      </div>
                    </>
                  )}

                  {showOutputStep && (
                    <>
                      <div className="rounded-lg border border-[#D6D9E0] p-4 bg-gradient-to-br from-white to-[#F8FAFF] flex flex-col sm:flex-row justify-between items-start sm:items-center">
                        <div className="flex-1">
                          <h3 className="text-sm font-bold uppercase tracking-widest text-[#23243B]">
                            Step 4: Output Summary
                          </h3>
                          <p className="text-xs text-gray-500 mt-1">
                            Output file and table details are generated successfully.
                          </p>
                        </div>
                        <div className="mt-2 sm:mt-0">
                          <button
                            type="button"
                            onClick={() => {
                              setScheduleContextJobId(null);
                              setShowSchedule(true);
                            }}
                            className="inline-flex items-center gap-1 px-4 py-2 border hover:bg-gray-50 border-[#23243B] rounded font-bold uppercase text-xs text-[#23243B] tracking-widest transition-colors"
                          >
                            Schedule <span role="img" aria-label="settings">⚙️</span>
                          </button>
                        </div>
                      </div>

                      <div className="border border-[#D6D9E0] rounded-lg bg-white p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="border border-[#E5E7EB] rounded p-2">
                          <div className="text-[10px] uppercase text-gray-500">Output File</div>
                          <div className="font-semibold break-all">{outputSummary?.outputFile || "-"}</div>
                        </div>
                        <div className="border border-[#E5E7EB] rounded p-2">
                          <div className="text-[10px] uppercase text-gray-500">Table Output</div>
                          <div className="font-semibold break-all">{outputSummary?.tableName || "-"}</div>
                        </div>
                        <div className="border border-[#E5E7EB] rounded p-2">
                          <div className="text-[10px] uppercase text-gray-500">Rows</div>
                          <div className="font-semibold">{outputSummary?.rowCount ?? "-"}</div>
                        </div>
                        <div className="border border-[#E5E7EB] rounded p-2">
                          <div className="text-[10px] uppercase text-gray-500">Columns</div>
                          <div className="font-semibold">{outputSummary?.columnCount ?? "-"}</div>
                        </div>
                      </div>

                      {/* --- Output Mode --- */}
                      <div className="border border-[#D6D9E0] rounded-lg bg-white p-4 text-xs">
                        <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-3">
                          Output Mode
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <button
                            type="button"
                            onClick={() => setOutputTargetMode("file")}
                            className={`py-2 font-bold uppercase border ${outputTargetMode === "file" ? "bg-[#23243B] text-white border-[#23243B]" : "text-[#23243B] border-[#A1A3AF] bg-white"}`}
                          >
                            File Output
                          </button>
                          <button
                            type="button"
                            onClick={() => setOutputTargetMode("table")}
                            className={`py-2 font-bold uppercase border ${outputTargetMode === "table" ? "bg-[#23243B] text-white border-[#23243B]" : "text-[#23243B] border-[#A1A3AF] bg-white"}`}
                          >
                            Table Output
                          </button>
                        </div>
                      </div>

                      {/* --- File Output block --- */}
                      {outputTargetMode === "file" && (
                        <div className="border border-[#D6D9E0] rounded-lg bg-white p-4 text-xs">
                          <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-3">File Actions</div>
                          <div className="grid grid-cols-1 gap-2">
                            <select
                              value={outputAction}
                              onChange={(e) => setOutputAction(e.target.value)}
                              className="border border-[#A1A3AF] p-2"
                            >
                              <option value="download_csv">Download CSV</option>
                              <option value="download_excel">Download Excel</option>
                              <option value="sharepoint">Upload to SharePoint</option>
                              <option value="email">Email File</option>
                            </select>
                          </div>
                          {outputAction === "email" ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                              <input
                                type="email"
                                placeholder="Recipient email"
                                value={outputEmailState.toEmail}
                                onChange={(e) => setOutputEmailState((s) => ({ ...s, toEmail: e.target.value }))}
                                className="border border-[#A1A3AF] p-2 sm:col-span-2"
                              />
                              <select
                                value={outputEmailState.format}
                                onChange={(e) => setOutputEmailState((s) => ({ ...s, format: e.target.value }))}
                                className="border border-[#A1A3AF] p-2"
                              >
                                <option value="csv">CSV</option>
                                <option value="excel">Excel</option>
                              </select>
                            </div>
                          ) : null}
                          {outputAction === "sharepoint" ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                              <select
                                value={outputSharePointState.format}
                                onChange={(e) =>
                                  setOutputSharePointState((s) => ({ ...s, format: e.target.value }))
                                }
                                className="border border-[#A1A3AF] p-2"
                              >
                                <option value="csv">CSV</option>
                                <option value="excel">Excel</option>
                              </select>
                              <input
                                type="text"
                                placeholder="Folder path (optional)"
                                value={outputSharePointState.folderPath}
                                onChange={(e) =>
                                  setOutputSharePointState((s) => ({ ...s, folderPath: e.target.value }))
                                }
                                className="border border-[#A1A3AF] p-2 sm:col-span-2"
                              />
                            </div>
                          ) : null}
                          <p className="mt-2 text-[11px] text-gray-500">
                            Selected file action runs automatically after you click <b>Run Job</b> and processing completes.
                          </p>
                        </div>
                      )}

                      {/* --- Table Output block --- */}
                      {outputTargetMode === "table" && (
                        <div className="border border-[#D6D9E0] rounded-lg bg-white p-4 text-xs">
                          <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-3">Insert Results to Database Table</div>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <button
                              type="button"
                              onClick={() => {
                                setOutputDbMode("saved");
                                if (!outputConnectionId && inputConnectionId) {
                                  handleOutputConnectionChange(String(inputConnectionId));
                                }
                              }}
                              className={`py-2 font-bold uppercase border ${outputDbMode === "saved" ? "bg-[#23243B] text-white border-[#23243B]" : "text-[#23243B] border-[#A1A3AF] bg-white"}`}
                            >
                              Saved Connection
                            </button>
                            <button
                              type="button"
                              onClick={() => setOutputDbMode("manual")}
                              className={`py-2 font-bold uppercase border ${outputDbMode === "manual" ? "bg-[#23243B] text-white border-[#23243B]" : "text-[#23243B] border-[#A1A3AF] bg-white"}`}
                            >
                              Manual
                            </button>
                          </div>

                          {outputDbMode === "saved" ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                              <select
                                className="border border-[#A1A3AF] p-2"
                                value={outputConnectionId}
                                onChange={(e) => handleOutputConnectionChange(e.target.value)}
                              >
                                <option value="">Select saved connection...</option>
                                {savedConnections.map((c) => (
                                  <option key={c.connection_id} value={c.connection_id}>
                                    {c.connection_name} ({c.host}:{c.port})
                                  </option>
                                ))}
                              </select>
                              <input
                                className="border border-[#A1A3AF] p-2"
                                placeholder="Database name (not mdms)"
                                value={dbCreds.dbname}
                                onChange={(e) => setDbCreds((p) => ({ ...p, dbname: e.target.value }))}
                              />
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                              <input className="border border-[#A1A3AF] p-2" placeholder="Host" value={dbCreds.host} onChange={(e) => setDbCreds((p) => ({ ...p, host: e.target.value }))} />
                              <input className="border border-[#A1A3AF] p-2" placeholder="Port" value={dbCreds.port} onChange={(e) => setDbCreds((p) => ({ ...p, port: e.target.value }))} />
                              <input className="border border-[#A1A3AF] p-2" placeholder="Username" value={dbCreds.user} onChange={(e) => setDbCreds((p) => ({ ...p, user: e.target.value }))} />
                              <input type="password" className="border border-[#A1A3AF] p-2" placeholder="Password" value={dbCreds.pass} onChange={(e) => setDbCreds((p) => ({ ...p, pass: e.target.value }))} />
                              <input className="border border-[#A1A3AF] p-2 sm:col-span-2" placeholder="Database name" value={dbCreds.dbname} onChange={(e) => setDbCreds((p) => ({ ...p, dbname: e.target.value }))} />
                              <label className="sm:col-span-2 flex items-center gap-2 text-[11px] text-gray-600 uppercase tracking-wider">
                                <input
                                  type="checkbox"
                                  checked={outputSaveConnection}
                                  onChange={(e) => setOutputSaveConnection(e.target.checked)}
                                />
                                Save this connection
                              </label>
                              {outputSaveConnection && (
                                <input
                                  className="border border-[#A1A3AF] p-2 sm:col-span-2"
                                  placeholder="Connection name (e.g. PROD_MDMS)"
                                  value={outputConnectionName}
                                  onChange={(e) => setOutputConnectionName(e.target.value)}
                                />
                              )}
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                            <button
                              type="button"
                              onClick={handleOutputDbLoadTargets}
                              className="py-2 border border-[#23243B] text-[#23243B] font-bold uppercase hover:bg-gray-50"
                            >
                              Load Target Tables
                            </button>
                            <select
                              className="border border-[#A1A3AF] p-2"
                              value={outputDbState.targetSchema}
                              onChange={(e) => setOutputDbState((s) => ({ ...s, targetSchema: e.target.value, targetTable: "" }))}
                            >
                              <option value="">Target schema (optional)</option>
                              {Object.keys(tablesBySchema || {}).map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                            <input
                              className="border border-[#A1A3AF] p-2"
                              placeholder="Target table (existing or new)"
                              list="output-target-table-options"
                              value={outputDbState.targetTable}
                              onChange={(e) => setOutputDbState((s) => ({ ...s, targetTable: e.target.value }))}
                            />
                            <datalist id="output-target-table-options">
                              {(tablesBySchema[outputDbState.targetSchema] || []).map((t) => (
                                <option key={t} value={t} />
                              ))}
                            </datalist>
                            <select
                              className="border border-[#A1A3AF] p-2"
                              value={outputDbState.ifExists}
                              onChange={(e) => setOutputDbState((s) => ({ ...s, ifExists: e.target.value }))}
                            >
                              <option value="append">Append</option>
                              <option value="replace">Replace</option>
                            </select>
                          </div>

                          <p className="mt-1 text-[11px] text-gray-500">
                            Export runs after <b>Run Job</b> only if you click <b>Done</b> here with a
                            valid saved connection, output database (e.g. <code>postgres</code>, not{" "}
                            <code>mdms</code>), and target table. Otherwise use <b>File Output</b> to
                            download results.
                          </p>
                          {outputDbState.message ? (
                            <p className={`mt-2 text-xs ${outputDbState.message.toLowerCase().includes("failed") ? "text-red-600" : "text-green-700"}`}>
                              {outputDbState.message}
                            </p>
                          ) : null}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                        <button
                          onClick={() => {
                            setShowOutputStep(false);
                            setShowRuleStep(true);
                          }}
                          className="w-full py-3 border border-[#23243B] rounded-md text-[#23243B] text-xs font-bold uppercase tracking-widest hover:bg-gray-50 transition-colors"
                        >
                          Back
                        </button>
                        <button
                          onClick={() => {
                            setExportOnRunEnabled(isTableExportFullyConfigured());
                            resetCreateFlow();
                            fetchJobs();
                          }}
                          className="w-full py-3 bg-[#23243B] rounded-md text-white text-xs font-bold uppercase tracking-widest hover:bg-black transition-colors"
                        >
                          Done
                        </button>
                      </div>
                    </>
                  )}

                  {!showRuleStep && !showOutputStep && (
                    <>
                  {!showFilePreview && (
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
                        <p className="text-[11px] text-gray-500 mt-1">
                          Use a descriptive name for this job. &quot;File Input&quot; / &quot;Table
                          Input&quot; below are source types, not the job name.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setCreateDataMode("file")}
                          className={`py-3 text-xs font-bold uppercase tracking-widest border ${createDataMode === "file" ? "bg-[#23243B] text-white border-[#23243B]" : "bg-white text-[#23243B] border-[#A1A3AF]"}`}
                        >
                          File Input
                        </button>
                        <button
                          onClick={() => {
                            setCreateDataMode("db");
                            setSchemasLoadHint("");
                            setDbCreds((prev) => ({
                              ...prev,
                              dbname: prev.dbname?.trim() ? prev.dbname : "mdms",
                            }));
                          }}
                          className={`py-3 text-xs font-bold uppercase tracking-widest border ${createDataMode === "db" ? "bg-[#23243B] text-white border-[#23243B]" : "bg-white text-[#23243B] border-[#A1A3AF]"}`}
                        >
                          Table Input
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        {createDataMode === "file"
                          ? "File: upload CSV or paste a path → Next → preview → rules → output."
                          : "Table: connection → Load tables → schema/table → Next → preview → rules → output."}
                      </p>
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
                            const selectedFile = e.target.files[0];
                            setUploadFile(selectedFile);
                            setUploadFilePath("");
                            setUploadSourcePath(inferSourcePathFromFile(selectedFile));
                            setShowFilePreview(false);
                            setPreviewColumns([]);
                            setPreviewColumnTypes({});
                            setPreviewRows([]);
                            setPreviewTotalRows(0);
                            setPreviewEditable([]);
                            setPreviewPage(1);
                          }}
                          className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:border-0 file:text-xs file:font-bold file:uppercase file:rounded-md file:bg-[#23243B] file:text-white hover:file:bg-black cursor-pointer"
                        />
                        <p className="mt-2 text-xs text-gray-600 break-all">
                          Selected file: {uploadFile?.name || "No file selected"}
                        </p>
                        <input
                          className="w-full mt-2 border border-[#A1A3AF] p-2 text-sm outline-none"
                          placeholder="Or paste local file path (e.g. C:\\Downloads\\data.csv)"
                          value={uploadFilePath}
                          onChange={(e) => {
                            setUploadFilePath(e.target.value);
                            setUploadSourcePath(String(e.target.value || "").trim());
                            if (e.target.value.trim()) {
                              setUploadFile(null);
                            }
                            setShowFilePreview(false);
                            setPreviewColumns([]);
                            setPreviewColumnTypes({});
                            setPreviewRows([]);
                            setPreviewTotalRows(0);
                            setPreviewEditable([]);
                            setPreviewPage(1);
                          }}
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
                    createDataMode === "db" && !showFilePreview && (
                    <>
                      <div className="mt-2 border border-[#D6D9E0] rounded-lg p-4 bg-white">
                        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-3">
                          Connection Details
                        </div>
                        <div>
                          <label className="text-[10px] uppercase text-gray-500 font-bold">
                            Saved Connection
                          </label>
                          <select
                            className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none bg-transparent"
                            value={inputConnectionId}
                            onChange={(e) => handleInputConnectionChange(e.target.value)}
                          >
                            <option value="">Select a saved connection...</option>
                            {savedConnections.map((c) => (
                              <option key={c.connection_id} value={c.connection_id}>
                                {c.connection_name} ({c.host}:{c.port})
                              </option>
                            ))}
                          </select>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-2">
                          <b>Easy way:</b> pick a saved connection, set <b>Database</b> to{" "}
                          <code className="text-[10px]">mdms</code>, click <b>Load tables</b>.
                          <br />
                          <b>Manual way:</b> leave dropdown empty, fill Host / Username / Password /
                          Database, then <b>Load tables</b>.
                        </p>
                        <div className="mt-3">
                          <label className="text-[10px] uppercase text-gray-500 font-bold">
                            Label for Save Connection (optional)
                          </label>
                          <input
                            className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none"
                            placeholder="e.g. MY_LOCAL_PG (only if you click Save Connection)"
                            value={connectionName}
                            autoComplete="off"
                            onChange={(e) => setConnectionName(e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                          <div>
                            <label className="text-[10px] uppercase text-gray-500 font-bold">
                              Host
                            </label>
                            <input
                              className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none"
                              placeholder="localhost"
                              value={dbCreds.host}
                              autoComplete="off"
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
                              autoComplete="off"
                              onChange={(e) =>
                                setDbCreds((prev) => ({ ...prev, port: e.target.value }))
                              }
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                          <div>
                            <label className="text-[10px] uppercase text-gray-500 font-bold">
                              Username
                            </label>
                            <input
                              className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none"
                              placeholder="postgres"
                              value={dbCreds.user}
                              autoComplete="off"
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
                              autoComplete="new-password"
                              onChange={(e) =>
                                setDbCreds((prev) => ({ ...prev, pass: e.target.value }))
                              }
                            />
                          </div>
                        </div>
                        <div className="mt-3">
                          <label className="text-[10px] uppercase text-gray-500 font-bold">
                            Database (required for Load tables)
                          </label>
                          <input
                            className="w-full border-b border-[#A1A3AF] p-2 text-sm outline-none"
                            placeholder="mdms"
                            value={dbCreds.dbname}
                            autoComplete="off"
                            onChange={(e) =>
                              setDbCreds((prev) => ({ ...prev, dbname: e.target.value }))
                            }
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                          <button
                            type="button"
                            onClick={handleTestConnection}
                            className="w-full py-2 border border-[#23243B] text-[#23243B] text-xs font-bold uppercase hover:bg-gray-50"
                          >
                            Test Connection
                          </button>
                          <button
                            type="button"
                            onClick={handleFetchTables}
                            disabled={schemasLoadBusy}
                            className="w-full py-2 border border-[#23243B] text-[#23243B] text-xs font-bold uppercase hover:bg-gray-50 disabled:opacity-50"
                          >
                            {schemasLoadBusy ? "Loading…" : "Load tables"}
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveConnection}
                            className="w-full py-2 bg-[#23243B] text-white text-xs font-bold uppercase hover:bg-black"
                          >
                            Save Connection
                          </button>
                        </div>
                      </div>
                      {schemasLoadHint ? (
                        <p
                          className={`text-xs mt-2 ${
                            schemasLoadHint.toLowerCase().includes("loaded")
                              ? "text-green-700"
                              : "text-amber-700"
                          }`}
                        >
                          {schemasLoadHint}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500 mt-2">
                          After connection details, click <b>Load tables</b> (or <b>Test Connection</b>) to
                          fill schema and table lists.
                        </p>
                      )}
                      <div ref={schemaSectionRef}>
                        <label className="text-[10px] uppercase text-gray-500 font-bold">
                          Choose Schema
                        </label>
                        <select
                          className="w-full border border-[#A1A3AF] p-2 text-sm bg-white"
                          value={selectedSchema}
                          disabled={schemasLoadBusy || schemaOptions.length === 0}
                          onChange={(e) => {
                            const schema = e.target.value;
                            setSelectedSchema(schema);
                            const scopedTables = tablesBySchema[schema] || [];
                            setTableOptions(scopedTables);
                            setSelectedTables(scopedTables.length > 0 ? [scopedTables[0]] : []);
                          }}
                        >
                          <option value="">
                            {schemaOptions.length === 0
                              ? "Load tables first…"
                              : "Select schema…"}
                          </option>
                          {schemaOptions.map((schema) => (
                            <option key={schema} value={schema}>
                              {schema}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-gray-500 font-bold">
                          Choose Table(s)
                        </label>
                        <div className="flex gap-2" ref={dbDropdownRef}>
                          <div className="w-full relative">
                            <button
                              type="button"
                              onClick={() => setDbDropdownOpen((prev) => !prev)}
                              disabled={schemasLoadBusy || schemaOptions.length === 0}
                              className="w-full cursor-pointer border border-[#A1A3AF] p-2 text-sm bg-white flex items-center justify-between disabled:opacity-50"
                            >
                              <span className="truncate text-left">
                                {selectedTables.length > 0
                                  ? `${selectedTables.length} table(s) selected`
                                  : "Select table(s)..."}
                              </span>
                              <span className="text-xs text-gray-500">▼</span>
                            </button>
                            {dbDropdownOpen && (
                              <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto border border-[#A1A3AF] bg-white p-2 shadow-lg rounded">
                                <div className="flex justify-between mb-2">
                                  <button
                                    type="button"
                                    className="text-[10px] uppercase font-bold text-[#23243B] hover:underline"
                                    onClick={selectAllTables}
                                  >
                                    Select All
                                  </button>
                                  <button
                                    type="button"
                                    className="text-[10px] uppercase font-bold text-[#23243B] hover:underline"
                                    onClick={clearSelectedTables}
                                  >
                                    Clear
                                  </button>
                                </div>
                                {tableOptions.length === 0 ? (
                                  <div className="text-xs text-gray-500">No tables found. Click Connect to load from selected DB/schema.</div>
                                ) : (
                                  tableOptions.map((tableName) => (
                                    <label key={tableName} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={selectedTables.includes(tableName)}
                                        onChange={() => toggleTableSelection(tableName)}
                                      />
                                      <span>{tableName}</span>
                                    </label>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={handleFetchTables}
                            disabled={schemasLoadBusy}
                            className="px-3 py-2 text-xs font-bold uppercase border border-[#23243B] text-[#23243B] hover:bg-[#23243B] hover:text-white disabled:opacity-50"
                          >
                            {schemasLoadBusy ? "…" : "Reload"}
                          </button>
                        </div>
                        {selectedTables.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {selectedTables.map((tableName) => (
                              <span
                                key={tableName}
                                className="text-[10px] uppercase tracking-wider bg-[#23243B] text-white px-2 py-1"
                              >
                                {tableName}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handlePreviewDb}
                        className="w-full mt-2 py-4 bg-[#23243B] text-white text-sm font-bold uppercase tracking-widest hover:bg-black"
                      >
                        Next
                      </button>
                    </>
                    )
                  )}

                  {showFilePreview && (
                    <>
                      <div className="rounded-lg border border-[#D6D9E0] p-4 bg-gradient-to-br from-white to-[#F8FAFF]">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-[#23243B]">
                          Step 2: {createDataMode === "db" ? "Table" : "File"} Preview (First 11 Rows)
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
                            <div className="text-[10px] uppercase text-gray-500">Rows Found</div>
                            <div className="text-xs font-semibold">{previewTotalRows}</div>
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
                            </tr>
                          </thead>
                          <tbody>
                            {pagedPreview.map((item, localIdx) => {
                              const idx = (previewPage - 1) * previewPageSize + localIdx;
                              return (
                              <tr key={`${item.originalName}-${idx}`} className="odd:bg-white even:bg-[#FAFAFA] align-top">
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
                            setPreviewTotalRows(0);
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
            </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {lookupModal.open &&
        createPortal(
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4"
            onClick={closeLookupModal}
          >
          <div
            className="bg-white border border-[#23243B] w-full max-w-lg shadow-2xl relative p-6 max-h-[min(90vh,calc(100dvh-2rem))] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lookup-modal-title"
          >
            <button
              type="button"
              onClick={closeLookupModal}
              className="absolute top-3 right-3 p-1 text-gray-500 hover:text-black"
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <h3 id="lookup-modal-title" className="text-sm font-bold uppercase tracking-widest text-[#23243B] mb-1 pr-8">
              Lookup master values
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Choose how to provide values for fuzzy matching.
            </p>

            {lookupModal.view === "choice" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setLookupModal((m) => ({ ...m, view: "file" }))
                  }
                  className="group flex flex-col items-center gap-2 border-2 border-[#23243B] p-6 hover:bg-[#23243B] hover:text-white transition-colors text-[#23243B]"
                >
                  <FileUp size={28} strokeWidth={1.5} />
                  <span className="text-xs font-bold uppercase tracking-widest">
                    File input
                  </span>
                  <span className="text-[10px] text-gray-500 group-hover:text-white/80 text-center font-normal normal-case">
                    .txt or .csv
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setLookupModal((m) => ({ ...m, view: "table" }))
                  }
                  className="group flex flex-col items-center gap-2 border-2 border-[#23243B] p-6 hover:bg-[#23243B] hover:text-white transition-colors text-[#23243B]"
                >
                  <Table2 size={28} strokeWidth={1.5} />
                  <span className="text-xs font-bold uppercase tracking-widest">
                    Test input
                  </span>
                  <span className="text-[10px] text-gray-500 group-hover:text-white/80 text-center font-normal normal-case">
                    Paste from Excel or type lines
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setLookupModal((m) => ({ ...m, view: "db" }))
                  }
                  className="group flex flex-col items-center gap-2 border-2 border-[#23243B] p-6 hover:bg-[#23243B] hover:text-white transition-colors text-[#23243B]"
                >
                  <Database size={28} strokeWidth={1.5} />
                  <span className="text-xs font-bold uppercase tracking-widest">
                    DB table
                  </span>
                  <span className="text-[10px] text-gray-500 group-hover:text-white/80 text-center font-normal normal-case">
                    Schema, table, column
                  </span>
                </button>
              </div>
            )}

            {lookupModal.view === "file" && (
              <div>
                <button
                  type="button"
                  onClick={() =>
                    setLookupModal((m) => ({ ...m, view: "choice" }))
                  }
                  className="text-xs font-bold uppercase text-[#23243B] mb-3 hover:underline"
                >
                  ← Back
                </button>
                <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-bold mb-2">
                  Upload file
                </label>
                <input
                  type="file"
                  accept=".txt,.csv"
                  onChange={(e) =>
                    handleLookupFileFromModal(e.target.files?.[0])
                  }
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:border-0 file:text-xs file:font-bold file:uppercase file:rounded-md file:bg-[#23243B] file:text-white hover:file:bg-black cursor-pointer"
                />
              </div>
            )}

            {lookupModal.view === "table" && (
              <div>
                <button
                  type="button"
                  onClick={() =>
                    setLookupModal((m) => ({ ...m, view: "choice" }))
                  }
                  className="text-xs font-bold uppercase text-[#23243B] mb-3 hover:underline"
                >
                  ← Back
                </button>
                <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-bold mb-2">
                  Paste table or list
                </label>
                <textarea
                  value={tablePasteBuffer}
                  onChange={(e) => setTablePasteBuffer(e.target.value)}
                  rows={10}
                  placeholder="One value per line, or paste from Excel (tabs/commas split into values)."
                  className="w-full border border-[#D1D5DB] p-3 text-sm font-mono outline-none focus:border-[#23243B]"
                />
                <button
                  type="button"
                  onClick={applyTablePaste}
                  className="mt-3 w-full py-3 bg-[#23243B] text-white text-xs font-bold uppercase tracking-widest hover:bg-black"
                >
                  Apply
                </button>
              </div>
            )}

            {lookupModal.view === "db" && (
              <div>
                <button
                  type="button"
                  onClick={() =>
                    setLookupModal((m) => ({ ...m, view: "choice" }))
                  }
                  className="text-xs font-bold uppercase text-[#23243B] mb-3 hover:underline"
                >
                  ← Back
                </button>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLookupDbConnMode("saved");
                      if (!inputConnectionId && savedConnections[0]) {
                        handleInputConnectionChange(String(savedConnections[0].connection_id));
                      }
                    }}
                    className={`py-2 text-xs font-bold uppercase tracking-widest border ${lookupDbConnMode === "saved" ? "bg-[#23243B] text-white border-[#23243B]" : "bg-white text-[#23243B] border-[#A1A3AF]"}`}
                  >
                    Saved connection
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLookupDbConnMode("manual");
                      setInputConnectionId("");
                    }}
                    className={`py-2 text-xs font-bold uppercase tracking-widest border ${lookupDbConnMode === "manual" ? "bg-[#23243B] text-white border-[#23243B]" : "bg-white text-[#23243B] border-[#A1A3AF]"}`}
                  >
                    Manual
                  </button>
                </div>

                {lookupDbConnMode === "saved" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-bold mb-1">
                        Saved connection
                      </label>
                      <select
                        value={inputConnectionId}
                        onChange={(e) => handleInputConnectionChange(e.target.value)}
                        className="w-full border border-[#D1D5DB] p-2 text-sm"
                      >
                        <option value="">Select a saved connection...</option>
                        {savedConnections.map((c) => (
                          <option key={c.connection_id} value={c.connection_id}>
                            {c.connection_name} ({c.host}:{c.port})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-bold mb-1">
                        Database
                      </label>
                      <input
                        value={dbCreds.dbname}
                        onChange={(e) => setDbCreds((prev) => ({ ...prev, dbname: e.target.value }))}
                        placeholder="e.g. mdms"
                        className="w-full border border-[#D1D5DB] p-2 text-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-bold mb-1">Host</label>
                      <input value={dbCreds.host} onChange={(e) => setDbCreds((p) => ({ ...p, host: e.target.value }))} className="w-full border border-[#D1D5DB] p-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-bold mb-1">Port</label>
                      <input value={dbCreds.port} onChange={(e) => setDbCreds((p) => ({ ...p, port: e.target.value }))} className="w-full border border-[#D1D5DB] p-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-bold mb-1">Username</label>
                      <input value={dbCreds.user} onChange={(e) => setDbCreds((p) => ({ ...p, user: e.target.value }))} className="w-full border border-[#D1D5DB] p-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-bold mb-1">Password</label>
                      <input type="password" value={dbCreds.pass} onChange={(e) => setDbCreds((p) => ({ ...p, pass: e.target.value }))} className="w-full border border-[#D1D5DB] p-2 text-sm" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-bold mb-1">Database</label>
                      <input value={dbCreds.dbname} onChange={(e) => setDbCreds((p) => ({ ...p, dbname: e.target.value }))} className="w-full border border-[#D1D5DB] p-2 text-sm" />
                    </div>
                  </div>
                )}

                <div className="mb-3">
                  <button
                    type="button"
                    onClick={handleLoadLookupSchemasTables}
                    className="w-full py-2 border border-[#23243B] text-[#23243B] text-xs font-bold uppercase hover:bg-gray-50"
                  >
                    Load schemas & tables
                  </button>
                  {lookupDbLoadMessage ? (
                    <p className="mt-2 text-xs text-green-700 font-semibold">
                      {lookupDbLoadMessage}
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-bold mb-1">
                      Schema
                    </label>
                    <select
                      value={lookupDbState.schema_name}
                      onChange={(e) =>
                        setLookupDbState((s) => ({
                          ...s,
                          schema_name: e.target.value,
                          table_name: "",
                          column_name: "",
                        }))
                      }
                      className="w-full border border-[#D1D5DB] p-2 text-sm"
                    >
                      <option value="">Select schema...</option>
                      {Object.keys(tablesBySchema || {}).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-bold mb-1">
                      Table
                    </label>
                    <select
                      value={lookupDbState.table_name}
                      onChange={(e) =>
                        (() => {
                          const t = e.target.value;
                          setLookupDbState((s) => ({
                            ...s,
                            table_name: t,
                            column_name: "",
                          }));
                          loadLookupTableColumns(lookupDbState.schema_name, t);
                        })()
                      }
                      className="w-full border border-[#D1D5DB] p-2 text-sm"
                    >
                      <option value="">Select table...</option>
                      {dbLookupTables.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-bold mb-1">
                      Column name
                    </label>
                    <select
                      value={lookupDbState.column_name}
                      onChange={(e) =>
                        setLookupDbState((s) => ({ ...s, column_name: e.target.value }))
                      }
                      className="w-full border border-[#D1D5DB] p-2 text-sm"
                    >
                      <option value="">
                        {lookupDbState.table_name ? "Select column..." : "Choose table first..."}
                      </option>
                      {lookupDbColumns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[10px] uppercase tracking-wider text-gray-600 font-bold mb-1">
                      Limit (optional)
                    </label>
                    <input
                      type="text"
                      min={1}
                      max={5000}
                      value={lookupDbState.limit}
                      onChange={(e) =>
                        setLookupDbState((s) => ({ ...s, limit: e.target.value }))
                      }
                      placeholder=""
                      className="w-full border border-[#D1D5DB] p-2 text-sm"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-gray-500 mt-2">
                  Uses DB credentials from Step 1 and selected database.
                </p>
                <button
                  type="button"
                  onClick={loadDbLookupValues}
                  disabled={lookupDbState.loading}
                  className="mt-3 w-full py-3 bg-[#23243B] text-white text-xs font-bold uppercase tracking-widest hover:bg-black disabled:opacity-50"
                >
                  {lookupDbState.loading ? "Loading..." : "Load values"}
                </button>
              </div>
            )}
          </div>
        </div>,
          document.body,
        )}
    </div>
  );
}

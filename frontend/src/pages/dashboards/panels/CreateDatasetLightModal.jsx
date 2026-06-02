import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppModal, ModalAlert, modalInputClass, modalLabelClass } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createNewJob,
  uploadCsvToJob,
  uploadCsvPathToJob,
  deleteJob,
  listSchemasTables,
  listSavedConnections,
  getSavedConnectionCredentials,
  registerDbDatasetSource,
  scheduleJob,
  testDbConnection,
} from "../../../api";
import { enterpriseGovernanceDatasetCreate } from "../enterpriseApi";

/** Lightweight create flow: job name + file upload/path OR DB table — no rules wizard (use Jobs later if needed). */
export default function CreateDatasetLightModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState("file");
  const [file, setFile] = useState(null);
  const [filePath, setFilePath] = useState("");
  const [busy, setBusy] = useState(false);
  const [schemasBusy, setSchemasBusy] = useState(false);
  const [credsLoading, setCredsLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadHint, setLoadHint] = useState("");

  const [savedConnections, setSavedConnections] = useState([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [dbCreds, setDbCreds] = useState({
    host: "",
    port: "",
    user: "",
    pass: "",
    dbname: "",
  });
  const [schemaOptions, setSchemaOptions] = useState([]);
  const [tablesBySchema, setTablesBySchema] = useState({});
  const [selectedSchema, setSelectedSchema] = useState("");
  const [tableOptions, setTableOptions] = useState([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [scheduleRefresh, setScheduleRefresh] = useState(false);
  const [scheduleType, setScheduleType] = useState("daily");
  const [scheduleTime, setScheduleTime] = useState("02:00");
  const [scheduleDate, setScheduleDate] = useState("");

  const pickConnection = async (value, connList) => {
    setSelectedConnectionId(value);
    setSchemaOptions([]);
    setTablesBySchema({});
    setSelectedSchema("");
    setTableOptions([]);
    setSelectedTable("");
    setLoadHint("");
    setError("");

    const selected = (connList || []).find((c) => String(c.connection_id) === String(value));
    if (!selected) return;

    const type = selected.db_type || "postgres";
    let defaultPort = "5432";
    let defaultDb = "mdms";
    if (type === "sqlserver") {
      defaultPort = "1433";
      defaultDb = "master";
    } else if (type === "mysql") {
      defaultPort = "3306";
      defaultDb = "";
    }

    setDbCreds((prev) => ({
      ...prev,
      host: selected.host || "",
      port: selected.port || defaultPort,
      user: selected.user || "",
      pass: "",
      dbname: prev.dbname || defaultDb,
    }));

    setCredsLoading(true);
    try {
      const res = await getSavedConnectionCredentials(Number(value));
      const creds = res?.data;
      if (creds) {
        setDbCreds((prev) => ({
          ...prev,
          host: creds.host || prev.host,
          port: creds.port || prev.port,
          user: creds.user || prev.user,
          pass: creds.password || "",
        }));
      }
    } catch {
      setError("Could not load saved password. Type it below or fix the profile on DB Connections.");
    } finally {
      setCredsLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await listSavedConnections();
        const list = Array.isArray(res?.data) ? res.data : [];
        if (cancelled) return;
        setSavedConnections(list);
        const preferred =
          list.find((c) => /^good$/i.test(String(c.connection_name || "").trim())) ||
          list.find((c) => /good/i.test(String(c.connection_name || "")));
        if (preferred) {
          await pickConnection(String(preferred.connection_id), list);
        }
      } catch {
        if (!cancelled) setSavedConnections([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const reset = () => {
    setName("");
    setMode("file");
    setFile(null);
    setFilePath("");
    setError("");
    setLoadHint("");
    setBusy(false);
    setSchemasBusy(false);
    setSelectedConnectionId("");
    setDbCreds({ host: "", port: "", user: "", pass: "", dbname: "" });
    setSchemaOptions([]);
    setTablesBySchema({});
    setSelectedSchema("");
    setTableOptions([]);
    setSelectedTable("");
    setScheduleRefresh(false);
    setScheduleType("daily");
    setScheduleTime("02:00");
    setScheduleDate("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSavedConnChange = (value) => {
    if (!value) {
      setSelectedConnectionId("");
      return;
    }
    pickConnection(value, savedConnections);
  };

  function formatAxiosDetail(data) {
    const d = data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join("; ") || "Request failed.";
    if (d && typeof d === "object") return d.msg || JSON.stringify(d);
    return "";
  }

  const buildSchemasPayload = () => {
    const dbname = (dbCreds.dbname || "mdms").trim();
    const payload = {
      dbname,
      host: dbCreds.host,
      port: dbCreds.port || "5432",
      user: dbCreds.user,
      pass: dbCreds.pass || "",
    };
    if (selectedConnectionId) {
      payload.connection_id = Number(selectedConnectionId);
    }
    return payload;
  };

  const loadSchemasTables = async () => {
    if (!selectedConnectionId) {
      setError("Select a saved connection (save profiles from DB Connections or Jobs).");
      setLoadHint("");
      return;
    }
    if (!dbCreds.dbname?.trim()) {
      setError("Enter database name (the database to connect into).");
      setLoadHint("");
      return;
    }
    if (!dbCreds.pass?.trim()) {
      setError("Enter the database password below (or re-save the connection on DB Connections with the correct password).");
      setLoadHint("");
      return;
    }
    setError("");
    setLoadHint("");
    setSchemasBusy(true);
    try {
      const payload = buildSchemasPayload();
      await testDbConnection(payload);
      const res = await listSchemasTables(payload);
      const schemas = res?.data?.schemas || [];
      const tableMap = res?.data?.tables_by_schema || {};
      setSchemaOptions(schemas);
      setTablesBySchema(tableMap);
      const first = schemas[0] || "";
      setSelectedSchema(first);
      const firstTables = tableMap[first] || [];
      setTableOptions(firstTables);
      setSelectedTable("");

      let tableCt = 0;
      Object.values(tableMap || {}).forEach((arr) => {
        tableCt += (arr || []).length;
      });
      if (schemas.length === 0) {
        setLoadHint("Connected, but no user schemas returned. Confirm you used the correct database name.");
      } else {
        setLoadHint(`${schemas.length} schema(s), ${tableCt} table(s) loaded.`);
      }
    } catch (e) {
      setLoadHint("");
      const msg = formatAxiosDetail(e?.response?.data);
      setError(msg || e?.message || "Failed to load schemas/tables.");
    } finally {
      setSchemasBusy(false);
    }
  };

  const registerGovernanceQuiet = async (datasetName, jobId) => {
    try {
      const body = {
        name: datasetName,
        domain: null,
        classification: mode === "file" ? "file" : "table",
        description: "Created from Data Owner → Datasets quick create",
      };
      if (jobId != null && Number.isFinite(Number(jobId))) {
        body.job_id = Number(jobId);
      }
      await enterpriseGovernanceDatasetCreate(body);
    } catch {
      /* duplicate name or governance optional */
    }
  };

  const onSubmitFile = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setError("Enter a dataset name.");
      return;
    }
    if (!file && !filePath.trim()) {
      setError("Choose a CSV file or enter a server file path.");
      return;
    }
    setBusy(true);
    setError("");
    let jobId = null;
    try {
      const { data } = await createNewJob(n);
      jobId = data?.job_id;
      if (!jobId) throw new Error("Could not create job.");
      if (filePath.trim()) {
        await uploadCsvPathToJob(jobId, filePath.trim());
      } else {
        await uploadCsvToJob(jobId, file, [], "");
      }
      await registerGovernanceQuiet(n, jobId);
      onCreated?.();
      handleClose();
    } catch (err) {
      if (jobId) {
        try {
          await deleteJob(jobId);
        } catch {
          /* best-effort */
        }
      }
      setError(formatAxiosDetail(err?.response?.data) || err?.message || "Create failed.");
    } finally {
      setBusy(false);
    }
  };

  const saveTableDataset = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setError("Enter a dataset name.");
      return;
    }
    if (!selectedSchema || !selectedTable) {
      setError("Load schemas and select one table.");
      return;
    }
    if (!dbCreds.dbname?.trim()) {
      setError("Enter database name.");
      return;
    }
    if (!selectedConnectionId) {
      setError("Select a saved connection.");
      return;
    }
    if (scheduleRefresh && scheduleType === "once" && !scheduleDate) {
      setError("Pick a date for the one-time refresh schedule.");
      return;
    }
    setBusy(true);
    setError("");
    setLoadHint("");
    try {
      const payload = buildSchemasPayload();
      payload.job_name = n;
      payload.schema_name = selectedSchema;
      payload.table_names = [selectedTable];
      const regRes = await registerDbDatasetSource(payload);
      const jobId = regRes?.data?.job_id ?? regRes?.data?.created_jobs?.[0]?.job_id;
      if (!jobId) throw new Error("Could not register dataset.");
      await registerGovernanceQuiet(n, jobId);
      if (scheduleRefresh) {
        const sched = {
          type: scheduleType,
          action: "refresh",
          time: scheduleTime || "02:00",
        };
        if (scheduleType === "once") sched.date = scheduleDate;
        if (scheduleType === "weekly") sched.day = "0";
        await scheduleJob(jobId, sched);
      }
      setLoadHint("Saved. Use Run on the datasets table to load data in the background.");
      onCreated?.();
      handleClose();
    } catch (err) {
      setError(formatAxiosDetail(err?.response?.data) || err?.message || "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const onPickSchema = (schemaName) => {
    setSelectedSchema(schemaName);
    const opts = tablesBySchema[schemaName] || [];
    setTableOptions(opts);
    setSelectedTable("");
  };

  const modeBtn = (active) =>
    cn(
      "py-2 text-xs font-bold uppercase tracking-wider rounded-lg border transition-colors",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title="Create dataset"
      description="Register a CSV or one database table. Save and close, then use Run on the datasets list to load data in the background."
      maxWidth="max-w-lg"
      showDefaultFooter={false}
      bodyClassName="overflow-y-auto max-h-[calc(90vh-8rem)]"
    >
        <div className="mb-3">
          <label className={modalLabelClass}>Dataset name</label>
          <input
            className={modalInputClass}
            placeholder="e.g. CUSTOMER_MASTER"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setMode("file")}
            className={modeBtn(mode === "file")}
          >
            File (CSV)
          </button>
          <button
            type="button"
            onClick={() => setMode("table")}
            className={modeBtn(mode === "table")}
          >
            Table (DB)
          </button>
        </div>

        {error ? <p className="text-xs text-destructive mb-3">{error}</p> : null}
        {loadHint ? (
          <ModalAlert variant={/MDQM_DB_SOURCE_MASTER_SECRET|encrypt/i.test(loadHint) ? "warning" : "success"} className="mb-2">
            {loadHint}
          </ModalAlert>
        ) : null}

        {mode === "file" ? (
          <form onSubmit={onSubmitFile} className="space-y-3">
            <div>
              <label className={modalLabelClass}>Upload CSV</label>
              <input
                type="file"
                accept=".csv"
                className="mt-1 w-full text-xs"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  if (e.target.files?.[0]) setFilePath("");
                }}
              />
            </div>
            <div>
              <label className={modalLabelClass}>Or server path</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-medium border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--input-foreground)]"
                placeholder="C:\\data\\file.csv"
                value={filePath}
                onChange={(e) => {
                  setFilePath(e.target.value);
                  if (e.target.value.trim()) setFile(null);
                }}
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full text-xs font-bold uppercase tracking-wide">
              {busy ? "Creating…" : "Create from file"}
            </Button>
          </form>
        ) : (
          <form onSubmit={saveTableDataset} className="space-y-3">
            <div>
              <label className={modalLabelClass}>Saved connection</label>
              <select
                className={cn(modalInputClass, "mt-1")}
                value={selectedConnectionId}
                onChange={(e) => onSavedConnChange(e.target.value)}
              >
                <option value="">Select saved connection…</option>
                {savedConnections.map((c) => (
                  <option key={c.connection_id} value={c.connection_id}>
                    {c.connection_name} ({c.host})
                  </option>
                ))}
              </select>
              {savedConnections.length === 0 ? (
                <p className="text-[11px] text-muted-foreground mt-1">
                  No saved connections yet.{" "}
                  <Link to="/connections" className="text-primary underline" onClick={handleClose}>
                    Add one on DB Connections
                  </Link>
                  .
                </p>
              ) : null}
              {credsLoading ? (
                <p className="text-[11px] text-muted-foreground mt-1">Loading connection details…</p>
              ) : null}
            </div>
            {selectedConnectionId ? (
              <div className="grid sm:grid-cols-2 gap-2">
                <div>
                  <label className={modalLabelClass}>Postgres username</label>
                  <input
                    className={modalInputClass}
                    value={dbCreds.user}
                    onChange={(e) => setDbCreds((p) => ({ ...p, user: e.target.value }))}
                    placeholder="e.g. postgres"
                  />
                </div>
                <div>
                  <label className={modalLabelClass}>Host</label>
                  <input
                    className={cn(modalInputClass, "opacity-70")}
                    value={dbCreds.host}
                    readOnly
                  />
                </div>
              </div>
            ) : null}
            <div>
              <label className={modalLabelClass}>Database name</label>
              <input
                className={modalInputClass}
                placeholder="e.g. mdms"
                value={dbCreds.dbname}
                onChange={(e) => setDbCreds((p) => ({ ...p, dbname: e.target.value }))}
              />
            </div>
            <div>
              <label className={modalLabelClass}>Password</label>
              <input
                type="password"
                className={modalInputClass}
                placeholder="Postgres password for this connection"
                value={dbCreds.pass}
                autoComplete="new-password"
                onChange={(e) => setDbCreds((p) => ({ ...p, pass: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Wrong password on <b>Test user 1</b>? Pick connection <b>good</b>, or{" "}
                <Link to="/connections" className="text-primary underline" onClick={handleClose}>
                  edit the profile on DB Connections
                </Link>
                .
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={schemasBusy || credsLoading}
              onClick={loadSchemasTables}
              className="w-full text-xs font-bold uppercase tracking-wide"
            >
              {schemasBusy ? "Loading…" : "Connect & list tables"}
            </Button>
            {schemaOptions.length > 0 ? (
              <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-3">
                <div>
                  <label className={cn(modalLabelClass, "block")} htmlFor="create-ds-schema">
                    Schema
                  </label>
                  <select
                    id="create-ds-schema"
                    className={cn(modalInputClass, "mt-1")}
                    value={selectedSchema}
                    onChange={(e) => onPickSchema(e.target.value)}
                  >
                    {schemaOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={cn(modalLabelClass, "block")} htmlFor="create-ds-table">
                    Table (one only)
                  </label>
                  <select
                    id="create-ds-table"
                    className={cn(modalInputClass, "mt-1")}
                    value={selectedTable}
                    onChange={(e) => setSelectedTable(e.target.value)}
                    disabled={tableOptions.length === 0}
                  >
                    <option value="">Select a table…</option>
                    {tableOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedTable ? (
                  <p className="text-[11px] font-mono text-muted-foreground">
                    {selectedSchema}.{selectedTable}
                  </p>
                ) : null}
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-border"
                checked={scheduleRefresh}
                onChange={(e) => setScheduleRefresh(e.target.checked)}
              />
              Schedule automatic refresh from database
            </label>
            {scheduleRefresh ? (
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/30 p-3">
                <select
                  className={modalInputClass}
                  value={scheduleType}
                  onChange={(e) => setScheduleType(e.target.value)}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="hourly">Hourly</option>
                  <option value="once">Once</option>
                </select>
                {scheduleType === "once" ? (
                  <input
                    type="date"
                    className={modalInputClass}
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                  />
                ) : null}
                <input
                  type="time"
                  className={cn(modalInputClass, scheduleType === "once" ? "" : "col-span-2")}
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>
            ) : null}
            <Button type="submit" disabled={busy || schemasBusy} className="w-full text-xs font-bold uppercase tracking-wide">
              {busy ? "Saving…" : "Save & close"}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Data is not loaded yet. After closing, click <strong className="text-foreground">Run</strong> on the datasets table.
            </p>
          </form>
        )}
    </AppModal>
  );
}

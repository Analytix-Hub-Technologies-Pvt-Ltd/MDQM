import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  createNewJob,
  uploadCsvToJob,
  uploadCsvPathToJob,
  connectToDb,
  listSchemasTables,
  listSavedConnections,
  getSavedConnectionCredentials,
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
  const [selectedTables, setSelectedTables] = useState([]);
  /** Type-to-filter query for table combobox and browse list */
  const [tableSearch, setTableSearch] = useState("");
  /** Searchable table dropdown panel */
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const tablePickerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    listSavedConnections()
      .then((res) => setSavedConnections(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setSavedConnections([]));
  }, [open]);

  useEffect(() => {
    if (!tablePickerOpen) return;
    const close = (e) => {
      if (tablePickerRef.current && !tablePickerRef.current.contains(e.target)) {
        setTablePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [tablePickerOpen]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [tableSearch, selectedSchema, tableOptions]);

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
    setSelectedTables([]);
    setTableSearch("");
    setTablePickerOpen(false);
    setHighlightIndex(0);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSavedConnChange = async (value) => {
    setSelectedConnectionId(value);
    const selected = savedConnections.find((c) => String(c.connection_id) === String(value));
    if (!selected) return;
    setDbCreds((prev) => ({
      ...prev,
      host: selected.host || "",
      port: selected.port || "5432",
      user: selected.user || "",
      pass: "",
    }));
    if (!value) return;
    try {
      const res = await getSavedConnectionCredentials(value);
      const d = res?.data || {};
      setDbCreds((prev) => ({
        ...prev,
        host: d.host || prev.host,
        port: d.port || prev.port || "5432",
        user: d.user || prev.user,
        pass: typeof d.password === "string" ? d.password : "",
      }));
    } catch (e) {
      console.error(e);
    }
  };

  function formatAxiosDetail(data) {
    const d = data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join("; ") || "Request failed.";
    if (d && typeof d === "object") return d.msg || JSON.stringify(d);
    return "";
  }

  const loadSchemasTables = async () => {
    if (!selectedConnectionId && (!dbCreds.host?.trim() || !dbCreds.user?.trim())) {
      setError("Enter host and username, or pick a saved connection.");
      setLoadHint("");
      return;
    }
    if (!dbCreds.dbname?.trim()) {
      setError("Enter database name (the PostgreSQL database to connect into).");
      setLoadHint("");
      return;
    }
    setError("");
    setLoadHint("");
    setSchemasBusy(true);
    try {
      const dbname = dbCreds.dbname.trim();
      const payload = selectedConnectionId
        ? {
            connection_id: Number(selectedConnectionId),
            dbname,
            host: dbCreds.host?.trim() || undefined,
            port: dbCreds.port?.trim() || undefined,
            user: dbCreds.user?.trim() || undefined,
            pass: dbCreds.pass !== "" ? dbCreds.pass : undefined,
          }
        : {
            host: dbCreds.host,
            port: dbCreds.port || "5432",
            user: dbCreds.user,
            pass: dbCreds.pass || "",
            dbname,
          };
      const res = await listSchemasTables(payload);
      const schemas = res?.data?.schemas || [];
      const tableMap = res?.data?.tables_by_schema || {};
      setSchemaOptions(schemas);
      setTablesBySchema(tableMap);
      const first = schemas[0] || "";
      setSelectedSchema(first);
      const firstTables = tableMap[first] || [];
      setTableOptions(firstTables);
      setSelectedTables([]);
      setTableSearch("");

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
    try {
      const { data } = await createNewJob(n);
      const jobId = data?.job_id;
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
      setError(formatAxiosDetail(err?.response?.data) || err?.message || "Create failed.");
    } finally {
      setBusy(false);
    }
  };

  const onSubmitTable = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setError("Enter a dataset name.");
      return;
    }
    if (!selectedSchema || selectedTables.length === 0) {
      setError("Load schemas and select at least one table.");
      return;
    }
    if (!dbCreds.dbname?.trim()) {
      setError("Enter database name.");
      return;
    }
    if (!selectedConnectionId && (!dbCreds.host || !dbCreds.user)) {
      setError("Enter connection details or pick a saved connection.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        job_name: n,
        dbname: dbCreds.dbname.trim(),
        schema_name: selectedSchema,
        table_names: selectedTables,
      };
      if (selectedConnectionId) {
        payload.connection_id = Number(selectedConnectionId);
        if (dbCreds.host?.trim()) payload.host = dbCreds.host.trim();
        if (dbCreds.port?.trim()) payload.port = dbCreds.port.trim();
        if (dbCreds.user?.trim()) payload.user = dbCreds.user.trim();
        if (dbCreds.pass !== "") payload.pass = dbCreds.pass;
      } else {
        payload.host = dbCreds.host;
        payload.port = dbCreds.port || "5432";
        payload.user = dbCreds.user;
        payload.pass = dbCreds.pass || "";
      }
      const connRes = await connectToDb(payload);
      const warns = connRes?.data?.warnings;
      if (Array.isArray(warns) && warns.length) {
        setLoadHint(warns.join(" "));
      }
      const jobId = connRes?.data?.created_jobs?.[0]?.job_id;
      await registerGovernanceQuiet(n, jobId);
      onCreated?.();
      handleClose();
    } catch (err) {
      setError(formatAxiosDetail(err?.response?.data) || err?.message || "Database create failed.");
    } finally {
      setBusy(false);
    }
  };

  const filteredTableOptions = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return tableOptions;
    return tableOptions.filter((t) => String(t).toLowerCase().includes(q));
  }, [tableOptions, tableSearch]);

  const selectedCountInSchema = selectedTables.filter((t) => tableOptions.includes(t)).length;

  const selectAllTablesInSchema = () => {
    setSelectedTables((prev) => {
      const set = new Set(prev);
      tableOptions.forEach((t) => set.add(t));
      return Array.from(set);
    });
  };

  const clearTablesInCurrentSchema = () => {
    setSelectedTables((prev) => prev.filter((t) => !tableOptions.includes(t)));
  };

  const onPickSchema = (schemaName) => {
    setSelectedSchema(schemaName);
    const opts = tablesBySchema[schemaName] || [];
    setTableOptions(opts);
    setTableSearch("");
    setTablePickerOpen(false);
    setHighlightIndex(0);
    setSelectedTables((prev) => prev.filter((t) => opts.includes(t)));
  };

  const toggleTableFromPicker = (t) => {
    setSelectedTables((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  const removeSelectedTable = (t) => {
    setSelectedTables((prev) => prev.filter((x) => x !== t));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="enterprise-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 text-sm border border-[#22324f] shadow-xl">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <h3 className="enterprise-title text-sm">Create dataset</h3>
            <p className="text-xs text-[#7f95b6] mt-1">
              Name your dataset, then attach a CSV or choose database table(s). Uses the same APIs as job creation — without the rules or output steps on this screen.
            </p>
          </div>
          <button type="button" onClick={handleClose} className="text-[#9ab0d1] hover:text-white p-1" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="mb-3">
          <label className="text-[10px] uppercase text-[#7f95b6] font-bold">Dataset name</label>
          <input
            className="mt-1 w-full border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2 text-[#d7e3f7]"
            placeholder="e.g. CUSTOMER_MASTER"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setMode("file")}
            className={`py-2 text-xs font-bold uppercase tracking-wider rounded border ${
              mode === "file" ? "bg-[#2b7fff] text-white border-[#2b7fff]" : "border-[#2a3f63] text-[#9ab0d1]"
            }`}
          >
            File (CSV)
          </button>
          <button
            type="button"
            onClick={() => setMode("table")}
            className={`py-2 text-xs font-bold uppercase tracking-wider rounded border ${
              mode === "table" ? "bg-[#2b7fff] text-white border-[#2b7fff]" : "border-[#2a3f63] text-[#9ab0d1]"
            }`}
          >
            Table (DB)
          </button>
        </div>

        {error ? <p className="text-xs text-red-400 mb-3">{error}</p> : null}
        {loadHint ? (
          <p
            className={`text-xs mb-2 ${
              /MDQM_DB_SOURCE_MASTER_SECRET|encrypt/i.test(loadHint) ? "text-amber-200" : "text-emerald-400/90"
            }`}
          >
            {loadHint}
          </p>
        ) : null}

        {mode === "file" ? (
          <form onSubmit={onSubmitFile} className="space-y-3 text-[#d7e3f7]">
            <div>
              <label className="text-[10px] uppercase text-[#7f95b6] font-bold">Upload CSV</label>
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
              <label className="text-[10px] uppercase text-[#7f95b6] font-bold">Or server path</label>
              <input
                className="mt-1 w-full border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
                placeholder="C:\\data\\file.csv"
                value={filePath}
                onChange={(e) => {
                  setFilePath(e.target.value);
                  if (e.target.value.trim()) setFile(null);
                }}
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 bg-[#2b7fff] text-white text-xs font-bold uppercase tracking-wide rounded disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create from file"}
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmitTable} className="space-y-3 text-[#d7e3f7]">
            <div>
              <label className="text-[10px] uppercase text-[#7f95b6] font-bold">Saved connection</label>
              <select
                className="mt-1 w-full border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
                value={selectedConnectionId}
                onChange={(e) => onSavedConnChange(e.target.value)}
              >
                <option value="">Manual host / user…</option>
                {savedConnections.map((c) => (
                  <option key={c.connection_id} value={c.connection_id}>
                    {c.connection_name} ({c.host})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
                placeholder="Host"
                value={dbCreds.host}
                onChange={(e) => setDbCreds((p) => ({ ...p, host: e.target.value }))}
              />
              <input
                className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
                placeholder="Port"
                value={dbCreds.port}
                onChange={(e) => setDbCreds((p) => ({ ...p, port: e.target.value }))}
              />
              <input
                className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
                placeholder="Username"
                value={dbCreds.user}
                onChange={(e) => setDbCreds((p) => ({ ...p, user: e.target.value }))}
              />
              <input
                type="password"
                className="border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
                placeholder="Password"
                value={dbCreds.pass}
                onChange={(e) => setDbCreds((p) => ({ ...p, pass: e.target.value }))}
              />
            </div>
            <p className="text-[11px] text-[#7f95b6] leading-relaxed">
              When you use a password, the backend saves it{" "}
              <span className="text-[#9ab0d1]">encrypted</span> on the job (set{" "}
              <code className="text-[10px] text-emerald-300/90">MDQM_DB_SOURCE_MASTER_SECRET</code> in{" "}
              <code className="text-[10px]">backend/.env</code>
              —see <code className="text-[10px]">.env.example</code>) so <strong className="font-semibold text-[#9ab0d1]">View → Refresh</strong> can
              run without typing the password again.
            </p>
            <input
              className="w-full border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
              placeholder="Database name *"
              value={dbCreds.dbname}
              onChange={(e) => setDbCreds((p) => ({ ...p, dbname: e.target.value }))}
            />
            <button
              type="button"
              disabled={schemasBusy}
              onClick={loadSchemasTables}
              className="w-full py-2 border border-[#2a4a7a] text-[#9ab0d1] text-xs uppercase font-bold rounded disabled:opacity-50"
            >
              {schemasBusy ? "Loading…" : "Load schemas & tables"}
            </button>
            {schemaOptions.length > 0 ? (
              <div className="rounded-lg border border-[#2a4a7a]/60 bg-[#0a1424] p-3 space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#7f95b6] font-bold">
                    Choose schema &amp; tables
                  </p>
                  <p className="text-[11px] text-[#9ab0d1] mt-0.5">
                    Pick one schema, then type in the table field to filter and choose from the dropdown — or expand the full list with checkboxes.
                  </p>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-[#7f95b6] font-bold block" htmlFor="create-ds-schema">
                    Schema ({schemaOptions.length} available)
                  </label>
                  <select
                    id="create-ds-schema"
                    className="mt-1 w-full border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2"
                    value={selectedSchema}
                    onChange={(e) => onPickSchema(e.target.value)}
                  >
                    {schemaOptions.map((s) => {
                      const tb = tablesBySchema[s] || [];
                      return (
                        <option key={s} value={s}>
                          {s} — {tb.length} table(s)
                        </option>
                      );
                    })}
                  </select>
                  {selectedSchema ? (
                    <p className="text-[11px] text-[#5c7a9e] mt-1">
                      {tableOptions.length} table(s) in this schema · {selectedCountInSchema} selected
                    </p>
                  ) : null}
                </div>
                <div ref={tablePickerRef}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <label className="text-[10px] uppercase text-[#7f95b6] font-bold" htmlFor="create-ds-table-combo">
                      Tables to include
                    </label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={tableOptions.length === 0 || schemasBusy}
                        onClick={selectAllTablesInSchema}
                        className="text-[11px] font-semibold px-2 py-1 rounded border border-[#2a5a9a]/70 text-[#9ab0d1] hover:bg-[#132542] disabled:opacity-40"
                      >
                        Select all in schema
                      </button>
                      <button
                        type="button"
                        disabled={selectedCountInSchema === 0 || schemasBusy}
                        onClick={clearTablesInCurrentSchema}
                        className="text-[11px] font-semibold px-2 py-1 rounded border border-[#2a3f63] text-[#7f95b6] hover:bg-[#132542] disabled:opacity-40"
                      >
                        Clear schema
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#5c7a9e] mb-1.5">
                    Type to narrow the list; click a row or press Enter to add or remove a table. Use the arrow to open every table without typing.
                  </p>
                  <div className="relative">
                    <input
                      id="create-ds-table-combo"
                      type="text"
                      role="combobox"
                      aria-expanded={tablePickerOpen}
                      aria-controls="create-ds-table-listbox"
                      aria-autocomplete="list"
                      disabled={tableOptions.length === 0 || schemasBusy}
                      className="w-full border border-[#2a3f63] bg-[#0f1b31] rounded px-2 py-2 pr-9 text-xs text-[#d7e3f7] placeholder:text-[#5c6b84] disabled:opacity-50"
                      placeholder={
                        tableOptions.length === 0
                          ? "Load schemas & tables first…"
                          : `Type to find a table in ${selectedSchema}…`
                      }
                      value={tableSearch}
                      onChange={(e) => {
                        setTableSearch(e.target.value);
                        setTablePickerOpen(true);
                      }}
                      onFocus={() => {
                        if (tableOptions.length > 0) setTablePickerOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (tableOptions.length === 0 || schemasBusy) return;
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setTablePickerOpen(false);
                          return;
                        }
                        const len = filteredTableOptions.length;
                        if (!tablePickerOpen && (e.key === "ArrowDown" || e.key === "Enter")) {
                          setTablePickerOpen(true);
                        }
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          if (len === 0) return;
                          setHighlightIndex((i) => Math.min(i + 1, len - 1));
                          setTablePickerOpen(true);
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setHighlightIndex((i) => Math.max(0, i - 1));
                          return;
                        }
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (len === 0) return;
                          const t = filteredTableOptions[highlightIndex];
                          if (t !== undefined) toggleTableFromPicker(t);
                        }
                      }}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      disabled={tableOptions.length === 0 || schemasBusy}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded text-[#9ab0d1] hover:bg-[#1a2f4f] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                      aria-label={tablePickerOpen ? "Close table list" : "Open table list"}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (tableOptions.length === 0) return;
                        setTablePickerOpen((o) => !o);
                      }}
                    >
                      <ChevronDown
                        size={18}
                        className={`transition-transform ${tablePickerOpen ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                    </button>
                    {tablePickerOpen && tableOptions.length > 0 ? (
                      <ul
                        id="create-ds-table-listbox"
                        role="listbox"
                        className="absolute z-[110] left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded border border-[#2a5a9a]/55 bg-[#0b1528] shadow-xl"
                      >
                        {filteredTableOptions.length === 0 ? (
                          <li className="px-3 py-3 text-xs text-[#7f95b6] text-center">
                            No tables match &quot;{tableSearch.trim()}&quot;.
                          </li>
                        ) : (
                          filteredTableOptions.map((t, i) => {
                            const sel = selectedTables.includes(t);
                            return (
                              <li
                                key={t}
                                role="option"
                                aria-selected={sel}
                                className={`flex items-center gap-2 px-2.5 py-2 text-xs cursor-pointer border-b border-[#1a2840]/80 last:border-b-0 ${
                                  i === highlightIndex ? "bg-[#1a3a6e]/90" : "hover:bg-[#152238]"
                                }`}
                                onMouseEnter={() => setHighlightIndex(i)}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => toggleTableFromPicker(t)}
                              >
                                <span
                                  className={`w-3.5 shrink-0 text-center font-bold ${sel ? "text-emerald-400" : "text-[#3d4f6a]"}`}
                                  aria-hidden
                                >
                                  {sel ? "✓" : "·"}
                                </span>
                                <span className="truncate font-medium text-[#d7e3f7]" title={String(t)}>
                                  {t}
                                </span>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    ) : null}
                  </div>
                  {selectedCountInSchema > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2" aria-label="Selected tables">
                      {[...selectedTables]
                        .filter((t) => tableOptions.includes(t))
                        .sort((a, b) => String(a).localeCompare(String(b)))
                        .map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 max-w-full pl-2 pr-1 py-0.5 rounded-md border border-emerald-500/35 bg-emerald-500/10 text-[11px] text-emerald-100"
                          >
                            <span className="truncate font-mono" title={String(t)}>
                              {t}
                            </span>
                            <button
                              type="button"
                              className="shrink-0 p-0.5 rounded hover:bg-emerald-500/25 text-emerald-200"
                              aria-label={`Remove ${t}`}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => removeSelectedTable(t)}
                            >
                              <X size={14} strokeWidth={2.5} />
                            </button>
                          </span>
                        ))}
                    </div>
                  ) : null}
                  <details className="mt-3 rounded border border-[#2a3f63]/60 bg-[#0f1b31]/40 open:border-[#2a5a9a]/40">
                    <summary className="cursor-pointer text-[11px] text-[#9ab0d1] px-2 py-2 hover:text-[#d7e3f7] select-none">
                      Browse full list (checkboxes)
                    </summary>
                    <div className="px-2 pb-2">
                      <div className="min-h-[100px] max-h-40 overflow-y-auto rounded border border-[#2a3f63] divide-y divide-[#1f2f4a]/80 bg-[#0f1b31]/70">
                        {tableOptions.length === 0 ? (
                          <p className="p-4 text-xs text-[#7f95b6] text-center">
                            No tables in this schema — pick another schema or confirm your database catalog.
                          </p>
                        ) : (
                          tableOptions.map((t, i) => (
                            <label
                              key={t}
                              className={`flex items-center gap-2.5 text-xs px-2.5 py-2 cursor-pointer hover:bg-[#152238] ${
                                i % 2 === 0 ? "bg-[#0c1628]/90" : "bg-transparent"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="shrink-0 rounded border-[#2a5a9a]"
                                checked={selectedTables.includes(t)}
                                onChange={() => toggleTableFromPicker(t)}
                              />
                              <span className="truncate font-medium text-[#d7e3f7]" title={String(t)}>
                                {t}
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  </details>
                </div>
                {selectedTables.length > 0 ? (
                  <div className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-2">
                    <p className="text-[10px] uppercase font-bold text-emerald-400/95">Included in this dataset</p>
                    <p className="text-[11px] text-emerald-100/90 mt-1 break-words font-mono">
                      {[...selectedTables]
                        .sort((a, b) => String(a).localeCompare(String(b)))
                        .map((t) => `${selectedSchema}.${t}`)
                        .join(", ")}
                      <span className="text-emerald-300/80 ml-1">
                        ({selectedTables.length} table{selectedTables.length === 1 ? "" : "s"})
                      </span>
                    </p>
                  </div>
                ) : schemaOptions.length > 0 && tableOptions.length > 0 ? (
                  <p className="text-xs text-amber-300/95 bg-amber-500/10 border border-amber-500/25 rounded px-2 py-2">
                    Select at least one table above, then click Create from table.
                  </p>
                ) : null}
              </div>
            ) : null}
            <button
              type="submit"
              disabled={busy || schemasBusy}
              className="w-full py-2.5 bg-[#2b7fff] text-white text-xs font-bold uppercase tracking-wide rounded disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create from table"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

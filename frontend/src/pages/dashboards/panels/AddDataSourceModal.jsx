import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppModal, ModalAlert, ModalFileInput, modalInputClass, modalLabelClass } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import ColumnSelector from "@/components/enterprise/ColumnSelector";
import JoinKeyPairsEditor from "@/components/enterprise/JoinKeyPairsEditor";
import { cn } from "@/lib/utils";
import {
  addJobJoinSource,
  getDbTableColumns,
  getSavedConnectionCredentials,
  listSavedConnections,
  listSchemasTables,
  previewCsvFile,
  previewCsvFileFromPath,
  previewDbTable,
  recommendJobJoinKeys,
} from "@/api";

const FILE_ACCEPT = ".csv,.xlsx,.xls";
const FILE_ACCEPT_HINT = "Accepted formats: CSV (.csv), Excel (.xlsx, .xls)";
const DEFAULT_JOIN_TYPE = "outer";

function formatDetail(d) {
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join("; ") || "Request failed.";
  if (d && typeof d === "object") {
    const det = d.detail;
    if (typeof det === "string") return det;
    if (Array.isArray(det)) return det.map((x) => x?.msg || JSON.stringify(x)).join("; ");
    return d.msg || JSON.stringify(d);
  }
  return "";
}

function nameFromFileName(fileName) {
  if (!fileName) return "";
  const base = String(fileName).replace(/\.[^.]+$/, "");
  return base || String(fileName);
}

function nameFromPath(path) {
  if (!path?.trim()) return "";
  return nameFromFileName(path.trim().split(/[/\\]/).pop() || "");
}

function emptyJoinPair() {
  return { left_key: "", right_key: "" };
}

export default function AddDataSourceModal({ open, onClose, jobId, baseColumns = [], onSaved }) {
  const [label, setLabel] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [mode, setMode] = useState("file");
  const [file, setFile] = useState(null);
  const [filePath, setFilePath] = useState("");
  const [joinKeys, setJoinKeys] = useState([emptyJoinPair()]);
  const [keysEdited, setKeysEdited] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestSummary, setSuggestSummary] = useState("");
  const [suggestSource, setSuggestSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [schemasBusy, setSchemasBusy] = useState(false);
  const [columnsBusy, setColumnsBusy] = useState(false);
  const [savedConnections, setSavedConnections] = useState([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [dbCreds, setDbCreds] = useState({ host: "", port: "", user: "", pass: "", dbname: "" });
  const [schemaOptions, setSchemaOptions] = useState([]);
  const [tablesBySchema, setTablesBySchema] = useState({});
  const [selectedSchema, setSelectedSchema] = useState("");
  const [tableOptions, setTableOptions] = useState([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [availableColumns, setAvailableColumns] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [columnAliases, setColumnAliases] = useState({});
  const [rightSampleRows, setRightSampleRows] = useState([]);
  const autoSuggestRef = useRef(false);

  const baseColumnNames = useMemo(
    () => (baseColumns || []).map((c) => (typeof c === "string" ? c : c.name)).filter(Boolean),
    [baseColumns],
  );

  const reset = () => {
    setLabel("");
    setNameEdited(false);
    setMode("file");
    setFile(null);
    setFilePath("");
    setJoinKeys([emptyJoinPair()]);
    setKeysEdited(false);
    setSuggestBusy(false);
    setSuggestSummary("");
    setSuggestSource("");
    setError("");
    setBusy(false);
    setSelectedConnectionId("");
    setDbCreds({ host: "", port: "", user: "", pass: "", dbname: "" });
    setSchemaOptions([]);
    setTablesBySchema({});
    setSelectedSchema("");
    setTableOptions([]);
    setSelectedTable("");
    setAvailableColumns([]);
    setSelectedColumns([]);
    setColumnAliases({});
    setRightSampleRows([]);
    autoSuggestRef.current = false;
  };

  useEffect(() => {
    if (!open) return;
    reset();
    (async () => {
      try {
        const res = await listSavedConnections();
        setSavedConnections(Array.isArray(res?.data) ? res.data : []);
      } catch {
        setSavedConnections([]);
      }
    })();
  }, [open, baseColumnNames]);

  useEffect(() => {
    if (!open || !selectedConnectionId) return;
    (async () => {
      try {
        const res = await getSavedConnectionCredentials(Number(selectedConnectionId));
        const creds = res?.data;
        if (creds) {
          setDbCreds((prev) => ({
            ...prev,
            host: creds.host || prev.host,
            port: creds.port || prev.port,
            user: creds.user || prev.user,
            pass: creds.password || prev.pass,
          }));
        }
      } catch {
        /* optional */
      }
    })();
  }, [open, selectedConnectionId]);

  const buildDbPayload = () => ({
    connection_id: selectedConnectionId ? Number(selectedConnectionId) : null,
    host: dbCreds.host,
    port: dbCreds.port || "5432",
    user: dbCreds.user,
    pass: dbCreds.pass || "",
    dbname: dbCreds.dbname,
    schema_name: selectedSchema,
    table_name: selectedTable,
  });

  const applyAutoName = (nextName) => {
    if (!nextName || nameEdited) return;
    setLabel(nextName);
  };

  const resolveSourceName = () => {
    const manual = label.trim();
    if (manual) return manual;
    if (mode === "file") {
      if (file?.name) return nameFromFileName(file.name);
      if (filePath.trim()) return nameFromPath(filePath);
    }
    if (mode === "table" && selectedTable) return selectedTable;
    return "";
  };

  const suggestJoinKeys = useCallback(
    async ({ auto = false } = {}) => {
      if (!jobId || !baseColumnNames.length || !availableColumns.length) return;
      if (auto && (keysEdited || autoSuggestRef.current)) return;

      setSuggestBusy(true);
      if (!auto) setError("");
      try {
        const res = await recommendJobJoinKeys(jobId, {
          left_columns: baseColumnNames,
          right_columns: availableColumns,
          right_sample: rightSampleRows,
          right_label: resolveSourceName() || selectedTable || file?.name || "new source",
        });
        const body = res?.data ?? res;
        const keys = Array.isArray(body?.join_keys) ? body.join_keys : [];
        if (keys.length) {
          setJoinKeys(keys.map((k) => ({ left_key: k.left_key, right_key: k.right_key })));
          setKeysEdited(false);
        }
        setSuggestSummary(body?.summary || "");
        setSuggestSource(body?.source || "");
        if (auto) autoSuggestRef.current = true;
      } catch (e) {
        if (!auto) setError(formatDetail(e?.response?.data) || e?.message || "Could not suggest join keys.");
      } finally {
        setSuggestBusy(false);
      }
    },
    [jobId, baseColumnNames, availableColumns, rightSampleRows, keysEdited, label, selectedTable, file, mode, filePath],
  );

  const loadCsvColumns = async (nextFile, nextPath) => {
    setColumnsBusy(true);
    setError("");
    try {
      let cols = [];
      let rows = [];
      if (nextFile) {
        const res = await previewCsvFile(nextFile);
        cols = res?.data?.columns || [];
        rows = res?.data?.rows || [];
      } else if (nextPath?.trim()) {
        const res = await previewCsvFileFromPath(nextPath.trim());
        cols = res?.data?.columns || [];
        rows = res?.data?.rows || [];
      }
      setAvailableColumns(cols);
      setSelectedColumns(cols);
      setColumnAliases({});
      setRightSampleRows(rows);
      setJoinKeys([emptyJoinPair()]);
      setKeysEdited(false);
      setSuggestSummary("");
      setSuggestSource("");
      autoSuggestRef.current = false;
    } catch (e) {
      setError(formatDetail(e?.response?.data) || e?.message || "Could not read file columns.");
      setAvailableColumns([]);
      setSelectedColumns([]);
      setColumnAliases({});
      setRightSampleRows([]);
    } finally {
      setColumnsBusy(false);
    }
  };

  const loadTableColumns = async (schemaName, tableName) => {
    if (!schemaName || !tableName) return;
    setColumnsBusy(true);
    setError("");
    try {
      const payload = { ...buildDbPayload(), schema_name: schemaName, table_name: tableName };
      const [colsRes, previewRes] = await Promise.all([
        getDbTableColumns(payload),
        previewDbTable(payload).catch(() => null),
      ]);
      const cols = colsRes?.data?.columns || [];
      const rows = previewRes?.data?.rows || [];
      setAvailableColumns(cols);
      setSelectedColumns(cols);
      setColumnAliases({});
      setRightSampleRows(rows);
      setJoinKeys([emptyJoinPair()]);
      setKeysEdited(false);
      setSuggestSummary("");
      setSuggestSource("");
      autoSuggestRef.current = false;
    } catch (e) {
      setError(formatDetail(e?.response?.data) || e?.message || "Could not load table columns.");
      setAvailableColumns([]);
      setSelectedColumns([]);
      setColumnAliases({});
      setRightSampleRows([]);
    } finally {
      setColumnsBusy(false);
    }
  };

  useEffect(() => {
    if (!open || mode !== "file") return undefined;
    const timer = setTimeout(() => loadCsvColumns(file, filePath), 300);
    return () => clearTimeout(timer);
  }, [open, mode, file, filePath]);

  useEffect(() => {
    if (!open || columnsBusy || !availableColumns.length || !baseColumnNames.length) return;
    suggestJoinKeys({ auto: true });
  }, [open, availableColumns, baseColumnNames, columnsBusy, suggestJoinKeys]);

  const loadSchemas = async () => {
    setSchemasBusy(true);
    setError("");
    try {
      const res = await listSchemasTables(buildDbPayload());
      const schemas = res?.data?.schemas || [];
      const tableMap = res?.data?.tables_by_schema || {};
      setSchemaOptions(schemas);
      setTablesBySchema(tableMap);
      const schema = schemas[0] || "";
      setSelectedSchema(schema);
      const tables = tableMap[schema] || [];
      setTableOptions(tables);
      const firstTable = tables[0] || "";
      setSelectedTable(firstTable);
      if (firstTable && !nameEdited) setLabel(firstTable);
      if (schema && firstTable) await loadTableColumns(schema, firstTable);
    } catch (e) {
      setError(formatDetail(e?.response?.data) || e?.message || "Failed to list schemas/tables.");
    } finally {
      setSchemasBusy(false);
    }
  };

  const validJoinKeys = joinKeys.filter((p) => p.left_key && p.right_key);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!jobId) return;
    if (!validJoinKeys.length) {
      setError("Add at least one complete join key pair for both datasets.");
      return;
    }
    if (!selectedColumns.length) {
      setError("Select at least one column from the new data source.");
      return;
    }
    if (mode === "file" && !file && !filePath.trim()) {
      setError("Choose a CSV or Excel file, or enter a server file path.");
      return;
    }
    if (mode === "table" && (!selectedSchema || !selectedTable)) {
      setError("Select schema and table for the new data source.");
      return;
    }
    const sourceName = resolveSourceName();
    if (!sourceName) {
      setError("Enter a name or choose a file / table to use its name.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const payload = {
        label: sourceName,
        source_kind: mode,
        join_type: DEFAULT_JOIN_TYPE,
        join_keys: validJoinKeys,
        left_key: validJoinKeys[0].left_key,
        right_key: validJoinKeys[0].right_key,
        selected_columns: selectedColumns,
        column_aliases: Object.fromEntries(
          Object.entries(columnAliases).filter(([col, alias]) => selectedColumns.includes(col) && String(alias || "").trim()),
        ),
      };

      let res;
      if (mode === "table") {
        Object.assign(payload, buildDbPayload());
        res = await addJobJoinSource(jobId, payload);
      } else if (file) {
        res = await addJobJoinSource(jobId, { ...payload, source_kind: "file" }, file);
      } else {
        res = await addJobJoinSource(jobId, { ...payload, source_kind: "file", file_path: filePath.trim() });
      }

      const body = res?.data ?? res;
      if (!body?.materialized) throw new Error("Join did not complete. Dataset was not updated.");

      onSaved?.(body);
      reset();
      onClose();
    } catch (e2) {
      setError(formatDetail(e2?.response?.data) || e2?.message || "Failed to add data source.");
    } finally {
      setBusy(false);
    }
  };

  const modeBtn = (active) =>
    cn(
      "py-2 text-xs font-bold uppercase tracking-wider rounded-lg border transition-colors",
      active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <AppModal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Add data source"
      description="Attach a CSV, Excel file, or database table and join it to this dataset."
      maxWidth="max-w-2xl"
      showDefaultFooter={false}
      bodyClassName="overflow-y-auto max-h-[calc(90vh-8rem)]"
    >
      <form className="space-y-3" onSubmit={onSubmit}>
        {error ? <ModalAlert variant="danger">{error}</ModalAlert> : null}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setMode("file"); setLabel(""); setNameEdited(false); }} className={modeBtn(mode === "file")}>
            File (CSV / Excel)
          </button>
          <button type="button" onClick={() => { setMode("table"); setLabel(""); setNameEdited(false); }} className={modeBtn(mode === "table")}>
            Table (DB)
          </button>
        </div>

        {mode === "file" ? (
          <>
            <div>
              <label className={modalLabelClass}>Upload file</label>
              <ModalFileInput
                accept={FILE_ACCEPT}
                chooseLabel="Choose CSV or Excel file"
                acceptHint={FILE_ACCEPT_HINT}
                file={file}
                onFileChange={(selected) => {
                  setFile(selected);
                  if (selected) { setFilePath(""); applyAutoName(nameFromFileName(selected.name)); }
                }}
              />
            </div>
            <div>
              <label className={modalLabelClass}>Or server path</label>
              <input
                className={modalInputClass}
                placeholder="C:\\data\\details.csv or .xlsx"
                value={filePath}
                onChange={(e) => {
                  const nextPath = e.target.value;
                  setFilePath(nextPath);
                  if (nextPath.trim()) { setFile(null); applyAutoName(nameFromPath(nextPath)); }
                }}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">{FILE_ACCEPT_HINT}</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className={modalLabelClass}>Saved connection</label>
              <select className={modalInputClass} value={selectedConnectionId} onChange={(e) => setSelectedConnectionId(e.target.value)}>
                <option value="">Select saved connection…</option>
                {savedConnections.map((c) => (
                  <option key={c.connection_id} value={c.connection_id}>{c.connection_name} ({c.host})</option>
                ))}
              </select>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <div>
                <label className={modalLabelClass}>Database name</label>
                <input className={modalInputClass} value={dbCreds.dbname} onChange={(e) => setDbCreds((p) => ({ ...p, dbname: e.target.value }))} />
              </div>
              <div>
                <label className={modalLabelClass}>Password</label>
                <input type="password" className={modalInputClass} value={dbCreds.pass} onChange={(e) => setDbCreds((p) => ({ ...p, pass: e.target.value }))} />
              </div>
            </div>
            <Button type="button" variant="outline" disabled={schemasBusy} onClick={loadSchemas} className="w-full text-xs uppercase tracking-wide">
              {schemasBusy ? "Loading…" : "Connect & list tables"}
            </Button>
            {schemaOptions.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-2">
                <div>
                  <label className={modalLabelClass}>Schema</label>
                  <select className={modalInputClass} value={selectedSchema} onChange={(e) => {
                    const s = e.target.value;
                    setSelectedSchema(s);
                    setTableOptions(tablesBySchema[s] || []);
                    setSelectedTable("");
                    setAvailableColumns([]);
                    setSelectedColumns([]);
      setColumnAliases({});
                  }}>
                    {schemaOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={modalLabelClass}>Table</label>
                  <select className={modalInputClass} value={selectedTable} onChange={(e) => {
                    const t = e.target.value;
                    setSelectedTable(t);
                    applyAutoName(t);
                    if (t) loadTableColumns(selectedSchema, t);
                  }}>
                    <option value="">Select table…</option>
                    {tableOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            ) : null}
          </>
        )}

        <div>
          <label className={modalLabelClass}>Name</label>
          <input
            className={modalInputClass}
            placeholder={mode === "file" ? "Uses file name when you choose a file" : "Uses table name when you select a table"}
            value={label}
            onChange={(e) => { setNameEdited(true); setLabel(e.target.value); }}
          />
        </div>

        <ColumnSelector
          columns={availableColumns}
          selected={selectedColumns}
          onChange={setSelectedColumns}
          aliases={columnAliases}
          onAliasesChange={setColumnAliases}
          enableAliases
          loading={columnsBusy}
        />

        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Join configuration</p>
          <JoinKeyPairsEditor
            pairs={joinKeys}
            onChange={setJoinKeys}
            baseColumns={baseColumnNames}
            rightColumns={availableColumns}
            onSuggest={() => suggestJoinKeys({ auto: false })}
            suggestBusy={suggestBusy}
            suggestSummary={suggestSummary}
            suggestSource={suggestSource}
            keysEdited={keysEdited}
            onKeysEdited={setKeysEdited}
          />
        </div>

        <Button type="submit" disabled={busy || columnsBusy || suggestBusy} className="w-full text-xs uppercase tracking-wide">
          {busy ? "Joining…" : "Add & join data source"}
        </Button>
      </form>
    </AppModal>
  );
}

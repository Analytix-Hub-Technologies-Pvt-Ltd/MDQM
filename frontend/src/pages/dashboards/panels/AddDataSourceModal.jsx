import { useEffect, useMemo, useState } from "react";
import { AppModal, ModalAlert, modalInputClass, modalLabelClass } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import ColumnSelector from "@/components/enterprise/ColumnSelector";
import { cn } from "@/lib/utils";
import {
  addJobJoinSource,
  getDbTableColumns,
  getSavedConnectionCredentials,
  listSavedConnections,
  listSchemasTables,
  previewCsvFile,
  previewCsvFileFromPath,
} from "@/api";

const JOIN_TYPES = [
  { value: "left", label: "Left join (keep all base rows)" },
  { value: "inner", label: "Inner join (matching rows only)" },
  { value: "right", label: "Right join (keep all new source rows)" },
  { value: "outer", label: "Full outer join" },
];

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

export default function AddDataSourceModal({ open, onClose, jobId, baseColumns = [], onSaved }) {
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState("file");
  const [file, setFile] = useState(null);
  const [filePath, setFilePath] = useState("");
  const [joinType, setJoinType] = useState("left");
  const [leftKey, setLeftKey] = useState("");
  const [rightKey, setRightKey] = useState("");
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

  const baseColumnNames = useMemo(
    () => (baseColumns || []).map((c) => (typeof c === "string" ? c : c.name)).filter(Boolean),
    [baseColumns],
  );

  const reset = () => {
    setLabel("");
    setMode("file");
    setFile(null);
    setFilePath("");
    setJoinType("left");
    setLeftKey(baseColumnNames[0] || "");
    setRightKey("");
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
  };

  useEffect(() => {
    if (!open) return;
    setLabel("");
    setMode("file");
    setFile(null);
    setFilePath("");
    setJoinType("left");
    setLeftKey(baseColumnNames[0] || "");
    setRightKey("");
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

  const loadCsvColumns = async (nextFile, nextPath) => {
    setColumnsBusy(true);
    setError("");
    try {
      let cols = [];
      if (nextFile) {
        const res = await previewCsvFile(nextFile);
        cols = res?.data?.columns || [];
      } else if (nextPath?.trim()) {
        const res = await previewCsvFileFromPath(nextPath.trim());
        cols = res?.data?.columns || [];
      }
      setAvailableColumns(cols);
      setSelectedColumns(cols);
      if (!rightKey && cols.length) setRightKey(cols[0]);
    } catch (e) {
      setError(formatDetail(e?.response?.data) || e?.message || "Could not read file columns.");
      setAvailableColumns([]);
      setSelectedColumns([]);
    } finally {
      setColumnsBusy(false);
    }
  };

  const loadTableColumns = async (schemaName, tableName) => {
    if (!schemaName || !tableName) return;
    setColumnsBusy(true);
    setError("");
    try {
      const res = await getDbTableColumns({ ...buildDbPayload(), schema_name: schemaName, table_name: tableName });
      const cols = res?.data?.columns || [];
      setAvailableColumns(cols);
      setSelectedColumns(cols);
      if (!rightKey && cols.length) setRightKey(cols[0]);
    } catch (e) {
      setError(formatDetail(e?.response?.data) || e?.message || "Could not load table columns.");
      setAvailableColumns([]);
      setSelectedColumns([]);
    } finally {
      setColumnsBusy(false);
    }
  };

  useEffect(() => {
    if (!open || mode !== "file") return undefined;
    const timer = setTimeout(() => loadCsvColumns(file, filePath), 300);
    return () => clearTimeout(timer);
  }, [open, mode, file, filePath]);

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
      setSelectedTable(tables[0] || "");
      if (schema && tables[0]) await loadTableColumns(schema, tables[0]);
    } catch (e) {
      setError(formatDetail(e?.response?.data) || e?.message || "Failed to list schemas/tables.");
    } finally {
      setSchemasBusy(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!jobId) return;
    if (!leftKey || !rightKey) {
      setError("Select join keys for both datasets.");
      return;
    }
    if (!selectedColumns.length) {
      setError("Select at least one column from the new data source.");
      return;
    }
    if (mode === "file" && !file && !filePath.trim()) {
      setError("Upload a CSV file or enter a server file path.");
      return;
    }
    if (mode === "table" && (!selectedSchema || !selectedTable)) {
      setError("Select schema and table for the new data source.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const payload = {
        label: label.trim() || undefined,
        source_kind: mode,
        join_type: joinType,
        left_key: leftKey,
        right_key: rightKey,
        selected_columns: selectedColumns,
      };

      if (mode === "table") {
        Object.assign(payload, buildDbPayload());
        await addJobJoinSource(jobId, payload);
      } else if (file) {
        await addJobJoinSource(jobId, { ...payload, source_kind: "file" }, file);
      } else {
        await addJobJoinSource(jobId, { ...payload, source_kind: "file", file_path: filePath.trim() });
      }

      onSaved?.();
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
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <AppModal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add data source"
      description="Attach a CSV or database table and join it to this dataset (e.g. customers + customer_details on customer_id)."
      maxWidth="max-w-2xl"
      showDefaultFooter={false}
      bodyClassName="overflow-y-auto max-h-[calc(90vh-8rem)]"
    >
      <form className="space-y-3" onSubmit={onSubmit}>
        {error ? <ModalAlert variant="danger">{error}</ModalAlert> : null}

        <div>
          <label className={modalLabelClass}>Source label (optional)</label>
          <input className={modalInputClass} placeholder="e.g. customer_details" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode("file")} className={modeBtn(mode === "file")}>
            File (CSV)
          </button>
          <button type="button" onClick={() => setMode("table")} className={modeBtn(mode === "table")}>
            Table (DB)
          </button>
        </div>

        {mode === "file" ? (
          <>
            <div>
              <label className={modalLabelClass}>Upload CSV</label>
              <input type="file" accept=".csv,.xlsx,.xls" className="mt-1 w-full text-xs" onChange={(e) => { setFile(e.target.files?.[0] || null); if (e.target.files?.[0]) setFilePath(""); }} />
            </div>
            <div>
              <label className={modalLabelClass}>Or server path</label>
              <input className={modalInputClass} placeholder="C:\\data\\details.csv" value={filePath} onChange={(e) => { setFilePath(e.target.value); if (e.target.value.trim()) setFile(null); }} />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className={modalLabelClass}>Saved connection</label>
              <select className={modalInputClass} value={selectedConnectionId} onChange={(e) => setSelectedConnectionId(e.target.value)}>
                <option value="">Select saved connection…</option>
                {savedConnections.map((c) => (
                  <option key={c.connection_id} value={c.connection_id}>
                    {c.connection_name} ({c.host})
                  </option>
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
                  <select
                    className={modalInputClass}
                    value={selectedSchema}
                    onChange={(e) => {
                      const s = e.target.value;
                      setSelectedSchema(s);
                      const tables = tablesBySchema[s] || [];
                      setTableOptions(tables);
                      setSelectedTable("");
                      setAvailableColumns([]);
                      setSelectedColumns([]);
                    }}
                  >
                    {schemaOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={modalLabelClass}>Table</label>
                  <select
                    className={modalInputClass}
                    value={selectedTable}
                    onChange={(e) => {
                      const t = e.target.value;
                      setSelectedTable(t);
                      if (t) loadTableColumns(selectedSchema, t);
                    }}
                  >
                    <option value="">Select table…</option>
                    {tableOptions.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
          </>
        )}

        <ColumnSelector columns={availableColumns} selected={selectedColumns} onChange={setSelectedColumns} loading={columnsBusy} />

        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Join configuration</p>
          <div>
            <label className={modalLabelClass}>Join type</label>
            <select className={modalInputClass} value={joinType} onChange={(e) => setJoinType(e.target.value)}>
              {JOIN_TYPES.map((j) => (
                <option key={j.value} value={j.value}>{j.label}</option>
              ))}
            </select>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <label className={modalLabelClass}>Base dataset key</label>
              <select className={modalInputClass} value={leftKey} onChange={(e) => setLeftKey(e.target.value)}>
                <option value="">Select column…</option>
                {baseColumnNames.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={modalLabelClass}>New source key</label>
              <select className={modalInputClass} value={rightKey} onChange={(e) => setRightKey(e.target.value)}>
                <option value="">Select column…</option>
                {availableColumns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <Button type="submit" disabled={busy || columnsBusy} className="w-full text-xs uppercase tracking-wide">
          {busy ? "Joining…" : "Add & join data source"}
        </Button>
      </form>
    </AppModal>
  );
}

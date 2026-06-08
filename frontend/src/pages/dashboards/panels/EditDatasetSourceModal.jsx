import { useEffect, useMemo, useState } from "react";
import { AppModal, ModalAlert, modalInputClass, modalLabelClass } from "@/components/layout/AppModal";
import { Button } from "@/components/ui/button";
import ColumnSelector from "@/components/enterprise/ColumnSelector";
import {
  getDbTableColumns,
  getSavedConnectionCredentials,
  listSavedConnections,
  listSchemasTables,
  updateJobDbSource,
} from "@/api";

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

export default function EditDatasetSourceModal({ open, onClose, jobId, sourceConfig, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
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

  const canSubmit = useMemo(
    () => !!jobId && !!selectedSchema && !!selectedTable && selectedColumns.length > 0 && !busy && !columnsBusy,
    [jobId, selectedSchema, selectedTable, selectedColumns.length, busy, columnsBusy],
  );

  const buildPayload = () => {
    const payload = {
      connection_id: selectedConnectionId ? Number(selectedConnectionId) : null,
      host: dbCreds.host,
      port: dbCreds.port || "5432",
      user: dbCreds.user,
      pass: dbCreds.pass || "",
      dbname: dbCreds.dbname,
      schema_name: selectedSchema,
      table_name: selectedTable,
      selected_columns: selectedColumns,
    };
    return payload;
  };

  const loadColumns = async (schemaName, tableName) => {
    if (!schemaName || !tableName) return;
    setColumnsBusy(true);
    setError("");
    try {
      const res = await getDbTableColumns(buildPayload());
      const cols = Array.isArray(res?.data?.columns) ? res.data.columns : [];
      setAvailableColumns(cols);
      const preselected = Array.isArray(sourceConfig?.selected_columns) ? sourceConfig.selected_columns : [];
      const validPreselected = preselected.filter((c) => cols.includes(c));
      setSelectedColumns(validPreselected.length ? validPreselected : cols);
    } catch (e) {
      setError(formatDetail(e?.response?.data) || e?.message || "Failed to load columns.");
      setAvailableColumns([]);
      setSelectedColumns([]);
    } finally {
      setColumnsBusy(false);
    }
  };

  const loadSchemas = async () => {
    setSchemasBusy(true);
    setError("");
    try {
      const res = await listSchemasTables(buildPayload());
      const schemas = res?.data?.schemas || [];
      const tableMap = res?.data?.tables_by_schema || {};
      setSchemaOptions(schemas);
      setTablesBySchema(tableMap);
      const schema = schemas.includes(selectedSchema) ? selectedSchema : schemas[0] || "";
      setSelectedSchema(schema);
      const tables = tableMap[schema] || [];
      setTableOptions(tables);
      const table = tables.includes(selectedTable) ? selectedTable : tables[0] || "";
      setSelectedTable(table);
      if (schema && table) {
        await loadColumns(schema, table);
      } else {
        setAvailableColumns([]);
        setSelectedColumns([]);
      }
    } catch (e) {
      setError(formatDetail(e?.response?.data) || e?.message || "Failed to list schemas/tables.");
    } finally {
      setSchemasBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setError("");
    setOk("");
    setSelectedConnectionId(sourceConfig?.connection_id != null ? String(sourceConfig.connection_id) : "");
    setDbCreds({
      host: sourceConfig?.host || "",
      port: sourceConfig?.port || "5432",
      user: sourceConfig?.user || "",
      pass: "",
      dbname: sourceConfig?.dbname || "",
    });
    setSelectedSchema(sourceConfig?.schema_name || "");
    setSelectedTable(sourceConfig?.table_name || "");
    setSelectedColumns(Array.isArray(sourceConfig?.selected_columns) ? sourceConfig.selected_columns : []);
    (async () => {
      try {
        const res = await listSavedConnections();
        const list = Array.isArray(res?.data) ? res.data : [];
        setSavedConnections(list);
      } catch {
        setSavedConnections([]);
      }
    })();
  }, [open, sourceConfig]);

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
        // Non-fatal: user can type credentials manually.
      }
    })();
  }, [open, selectedConnectionId]);

  const onPickSchema = (schemaName) => {
    setSelectedSchema(schemaName);
    const tables = tablesBySchema[schemaName] || [];
    setTableOptions(tables);
    setSelectedTable("");
    setAvailableColumns([]);
    setSelectedColumns([]);
  };

  const onPickTable = async (tableName) => {
    setSelectedTable(tableName);
    if (!tableName) {
      setAvailableColumns([]);
      setSelectedColumns([]);
      return;
    }
    await loadColumns(selectedSchema, tableName);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    setOk("");
    try {
      await updateJobDbSource(jobId, buildPayload());
      setOk("Dataset source updated. Run import to load data from the updated source.");
      onSaved?.();
    } catch (e2) {
      setError(formatDetail(e2?.response?.data) || e2?.message || "Failed to update dataset source.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Edit dataset"
      description="Change source connection, table, and included columns."
      maxWidth="max-w-2xl"
      showDefaultFooter={false}
    >
      <form className="space-y-3" onSubmit={onSubmit}>
        {error ? <ModalAlert variant="danger">{error}</ModalAlert> : null}
        {ok ? <ModalAlert variant="success">{ok}</ModalAlert> : null}

        <div>
          <label className={modalLabelClass}>Saved connection</label>
          <select
            className={modalInputClass}
            value={selectedConnectionId}
            onChange={(e) => setSelectedConnectionId(e.target.value)}
          >
            <option value="">Use manual connection fields</option>
            {savedConnections.map((c) => (
              <option key={c.connection_id} value={c.connection_id}>
                {c.connection_name} ({c.host})
              </option>
            ))}
          </select>
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          <div>
            <label className={modalLabelClass}>Host</label>
            <input className={modalInputClass} value={dbCreds.host} onChange={(e) => setDbCreds((p) => ({ ...p, host: e.target.value }))} />
          </div>
          <div>
            <label className={modalLabelClass}>Port</label>
            <input className={modalInputClass} value={dbCreds.port} onChange={(e) => setDbCreds((p) => ({ ...p, port: e.target.value }))} />
          </div>
          <div>
            <label className={modalLabelClass}>Username</label>
            <input className={modalInputClass} value={dbCreds.user} onChange={(e) => setDbCreds((p) => ({ ...p, user: e.target.value }))} />
          </div>
          <div>
            <label className={modalLabelClass}>Database name</label>
            <input className={modalInputClass} value={dbCreds.dbname} onChange={(e) => setDbCreds((p) => ({ ...p, dbname: e.target.value }))} />
          </div>
        </div>

        <div>
          <label className={modalLabelClass}>Password</label>
          <input
            type="password"
            className={modalInputClass}
            value={dbCreds.pass}
            autoComplete="new-password"
            onChange={(e) => setDbCreds((p) => ({ ...p, pass: e.target.value }))}
          />
        </div>

        <Button type="button" variant="outline" disabled={schemasBusy} onClick={loadSchemas} className="w-full text-xs uppercase tracking-wide">
          {schemasBusy ? "Loading…" : "Connect & list tables"}
        </Button>

        {schemaOptions.length > 0 ? (
          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <label className={modalLabelClass}>Schema</label>
              <select className={modalInputClass} value={selectedSchema} onChange={(e) => onPickSchema(e.target.value)}>
                {schemaOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={modalLabelClass}>Table</label>
              <select className={modalInputClass} value={selectedTable} onChange={(e) => onPickTable(e.target.value)}>
                <option value="">Select table…</option>
                {tableOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        <ColumnSelector
          columns={availableColumns}
          selected={selectedColumns}
          onChange={setSelectedColumns}
          loading={columnsBusy}
        />

        <Button type="submit" disabled={!canSubmit} className="w-full text-xs uppercase tracking-wide">
          {busy ? "Saving…" : "Save dataset changes"}
        </Button>
      </form>
    </AppModal>
  );
}

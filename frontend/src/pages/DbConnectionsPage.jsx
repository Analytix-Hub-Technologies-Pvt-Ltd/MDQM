import { useEffect, useMemo, useState } from "react";
import {
  listSavedConnections,
  getSavedConnectionCredentials,
  saveDbConnection,
  updateSavedConnection,
  deleteSavedConnection,
  shareSavedConnection,
  testDbConnection,
} from "@/api";
import { cn } from "@/lib/utils";

const inputClass =
  "mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-input-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const actionBtnClass =
  "inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto";

function formatApiError(err, fallback = "Request failed.") {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item?.message || JSON.stringify(item)).join("; ");
  }
  if (detail && typeof detail === "object") {
    return detail.message || JSON.stringify(detail);
  }
  return err?.message || fallback;
}

export default function DbConnectionsPage() {
  const [connections, setConnections] = useState([]);
  const [form, setForm] = useState({
    connection_name: "",
    host: "",
    port: "",
    user: "",
    pass: "",
    db_type: "postgres",
    dbname: "",
  });
  const [editingId, setEditingId] = useState(null);
  const [editingOwned, setEditingOwned] = useState(false);
  const [shareWith, setShareWith] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPassed, setTestPassed] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [lastTestedFingerprint, setLastTestedFingerprint] = useState("");

  const connectionFingerprint = useMemo(
    () =>
      JSON.stringify({
        host: form.host.trim(),
        port: form.port.trim(),
        user: form.user.trim(),
        pass: form.pass,
        db_type: form.db_type,
        dbname: form.dbname.trim(),
        editingId: editingId || null,
      }),
    [form.host, form.port, form.user, form.pass, form.db_type, form.dbname, editingId],
  );

  const canTestConnection = Boolean(
    form.connection_name.trim() &&
      form.host.trim() &&
      form.port.trim() &&
      form.user.trim() &&
      form.dbname.trim() &&
      form.pass.trim(),
  );

  const canSaveConnection =
    testPassed && lastTestedFingerprint === connectionFingerprint && !loading && !testing;

  const invalidateTest = () => {
    setTestPassed(false);
    setTestMessage("");
    setLastTestedFingerprint("");
  };

  const buildTestPayload = () => {
    const payload = {
      host: form.host.trim(),
      port: form.port.trim() || "5432",
      user: form.user.trim(),
      pass: form.pass || "",
      db_type: form.db_type || "postgres",
      dbname: form.dbname.trim() || "postgres",
    };
    if (editingId) {
      payload.connection_id = editingId;
    }
    return payload;
  };

  const fetchConnections = async () => {
    try {
      const res = await listSavedConnections();
      setConnections(res?.data || []);
    } catch (err) {
      console.error(err);
      setMessage("Failed to load saved connections.");
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setEditingOwned(false);
    setShareWith("");
    setShareMessage("");
    setForm({
      connection_name: "",
      host: "",
      port: "",
      user: "",
      pass: "",
      db_type: "postgres",
      dbname: "",
    });
    setMessage("");
    invalidateTest();
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (["host", "port", "user", "pass", "db_type", "dbname"].includes(field)) {
      invalidateTest();
    }
  };

  const buildSavePayload = () => ({
    connection_name: form.connection_name.trim(),
    host: form.host.trim(),
    port: form.port.trim() || "5432",
    user: form.user.trim(),
    pass: form.pass || "",
    db_type: form.db_type || "postgres",
    dbname: form.dbname.trim() || "",
  });

  const handleTestConnection = async () => {
    if (!canTestConnection) {
      setMessage(
        "Fill connection name, host, port, username, database name, and password before testing.",
      );
      return;
    }

    setTesting(true);
    setTestMessage("");
    setMessage("");
    try {
      await testDbConnection(buildTestPayload());
      setTestPassed(true);
      setLastTestedFingerprint(connectionFingerprint);
      setTestMessage("Connection successful. You can save now.");
    } catch (err) {
      invalidateTest();
      setTestMessage(formatApiError(err, "Connection test failed."));
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.connection_name.trim() || !form.host.trim() || !form.user.trim()) {
      setMessage("Connection name, host, and username are required.");
      return;
    }
    if (!editingId && !form.pass.trim()) {
      setMessage("Password is required for new connections.");
      return;
    }
    if (!canSaveConnection) {
      setMessage("Test the connection successfully before saving.");
      return;
    }

    setLoading(true);
    try {
      if (editingId) {
        await updateSavedConnection(editingId, buildSavePayload());
        setMessage("Saved connection updated.");
      } else {
        await saveDbConnection(buildSavePayload());
        setMessage("Saved connection created.");
      }
      resetForm();
      await fetchConnections();
    } catch (err) {
      setMessage(formatApiError(err, "Failed to save connection."));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (connection) => {
    try {
      const res = await getSavedConnectionCredentials(connection.connection_id);
      const data = res?.data || {};
      setForm({
        connection_name: data.connection_name || "",
        host: data.host || "",
        port: data.port || "5432",
        user: data.user || "",
        pass: data.password || "",
        db_type: data.db_type || "postgres",
        dbname: data.dbname || "",
      });
      setEditingId(connection.connection_id);
      setEditingOwned(connection.owned);
      setShareWith("");
      setShareMessage("");
      setMessage(
        data.password
          ? ""
          : "No saved password found for this profile. Enter the database password, then test again.",
      );
      invalidateTest();
    } catch (err) {
      setMessage(formatApiError(err, "Failed to load connection details."));
    }
  };

  const handleDelete = async (connection) => {
    if (!window.confirm(`Delete connection “${connection.connection_name}”?`)) {
      return;
    }
    setLoading(true);
    try {
      await deleteSavedConnection(connection.connection_id);
      setMessage("Saved connection deleted.");
      if (editingId === connection.connection_id) {
        resetForm();
      }
      await fetchConnections();
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Failed to delete connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!shareWith.trim()) {
      setShareMessage("Enter the target user's email or username.");
      return;
    }
    setLoading(true);
    try {
      await shareSavedConnection(editingId, { share_with: shareWith.trim() });
      setShareMessage(`Shared with ${shareWith.trim()}.`);
      setShareWith("");
    } catch (err) {
      setShareMessage(err?.response?.data?.detail || "Failed to share connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">DB Connections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Save and manage your database connection profiles. These can be reused by jobs and database access workflows.
          </p>
        </div>
      </div>

      {message ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          {message}
        </div>
      ) : null}

      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">{editingId ? "Edit connection" : "New connection"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {editingId
                ? "Update your saved database profile. Test the connection before saving changes."
                : "Fill in all fields, test the connection, then save the profile for reuse."}
            </p>
          </div>

          <form id="db-connection-form" className="space-y-4" onSubmit={handleSubmit} autoComplete="off">
             <label className="block text-sm font-medium text-foreground">
               Connection name
               <input
                 value={form.connection_name}
                 onChange={(event) => handleChange("connection_name", event.target.value)}
                 className={inputClass}
                 placeholder="e.g. analytics-db"
                 autoComplete="off"
               />
             </label>
             <label className="block text-sm font-medium text-foreground">
               Database Type
               <select
                 value={form.db_type || "postgres"}
                 onChange={(event) => {
                   const type = event.target.value;
                   let defPort = "5432";
                   if (type === "sqlserver") defPort = "1433";
                   else if (type === "mysql") defPort = "3306";
                   else if (type === "oracle") defPort = "1521";
                   else if (type === "snowflake") defPort = "443";
                   else if (type === "databricks") defPort = "443";
                   handleChange("db_type", type);
                   handleChange("port", defPort);
                 }}
                 className={inputClass}
               >
                 <option value="postgres">PostgreSQL</option>
                 <option value="sqlserver">Microsoft SQL Server</option>
                 <option value="mysql">MySQL</option>
                 <option value="oracle">Oracle</option>
                 <option value="snowflake">Snowflake</option>
                 <option value="databricks">Databricks</option>
               </select>
             </label>
            <label className="block text-sm font-medium text-foreground">
              Host
              <input
                value={form.host}
                onChange={(event) => handleChange("host", event.target.value)}
                className={inputClass}
                placeholder="db.company.local"
                autoComplete="off"
              />
            </label>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-2">
              <label className="block text-sm font-medium text-foreground">
                Port
                <input
                  value={form.port}
                  onChange={(event) => handleChange("port", event.target.value)}
                  className={inputClass}
                  placeholder="5432"
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm font-medium text-foreground">
                Username
                <input
                  value={form.user}
                  onChange={(event) => handleChange("user", event.target.value)}
                  className={inputClass}
                  placeholder="db_user"
                  autoComplete="off"
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-foreground">
              Password
              <input
                value={form.pass}
                onChange={(event) => handleChange("pass", event.target.value)}
                type="password"
                className={inputClass}
                placeholder={editingId ? "Re-enter password to test and save" : "Enter database password"}
                autoComplete="new-password"
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Database name
              <input
                value={form.dbname}
                onChange={(event) => handleChange("dbname", event.target.value)}
                className={inputClass}
                placeholder="postgres"
                autoComplete="off"
              />
            </label>

            {testMessage ? (
              <div
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm",
                  testPassed
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                    : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                {testMessage}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className={cn(actionBtnClass, "border border-border bg-card text-foreground hover:bg-muted sm:mr-auto")}
                >
                  Cancel edit
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={!canTestConnection || testing || loading}
                className={cn(
                  actionBtnClass,
                  "border border-primary bg-card text-primary hover:bg-primary/5",
                )}
              >
                {testing ? "Testing…" : "Test connection"}
              </button>
              <button
                type="submit"
                disabled={!canSaveConnection}
                className={cn(actionBtnClass, "bg-primary text-primary-foreground hover:bg-primary/90")}
              >
                {loading ? "Saving…" : editingId ? "Update connection" : "Save connection"}
              </button>
            </div>

            {editingOwned ? (
              <div className="rounded-2xl border border-border bg-muted p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-foreground">Share this connection</h3>
                  <p className="text-sm text-muted-foreground">Grant another user permission to use this saved profile.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    value={shareWith}
                    onChange={(event) => setShareWith(event.target.value)}
                    className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-input-foreground shadow-sm focus:border-primary focus:outline-none"
                    placeholder="User email or username"
                  />
                  <button
                    type="button"
                    onClick={handleShare}
                    disabled={loading}
                    className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Share
                  </button>
                </div>
                {shareMessage ? (
                  <p className="mt-3 text-sm text-muted-foreground">{shareMessage}</p>
                ) : null}
              </div>
            ) : null}
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Saved connections</h2>
              <p className="text-sm text-muted-foreground">Your personal connection profiles appear here.</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="min-w-[720px] w-full divide-y divide-border text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-3 font-semibold text-muted-foreground sm:px-4">Name</th>
                  <th className="px-3 py-3 font-semibold text-muted-foreground sm:px-4">Type</th>
                  <th className="hidden px-3 py-3 font-semibold text-muted-foreground md:table-cell sm:px-4">Host</th>
                  <th className="px-3 py-3 font-semibold text-muted-foreground sm:px-4">Port</th>
                  <th className="hidden px-3 py-3 font-semibold text-muted-foreground lg:table-cell sm:px-4">User</th>
                  <th className="px-3 py-3 font-semibold text-muted-foreground sm:px-4">Source</th>
                  <th className="px-3 py-3 font-semibold text-muted-foreground sm:px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {connections.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No saved connections yet. Create one using the form.
                    </td>
                  </tr>
                ) : (
                  connections.map((connection) => (
                    <tr key={connection.connection_id}>
                      <td className="px-3 py-3 text-foreground sm:px-4">{connection.connection_name}</td>
                      <td className="px-3 py-3 text-muted-foreground capitalize sm:px-4">
                        {connection.db_type === "sqlserver"
                          ? "SQL Server"
                          : connection.db_type === "postgres"
                          ? "PostgreSQL"
                          : connection.db_type || "PostgreSQL"}
                      </td>
                      <td className="hidden px-3 py-3 text-muted-foreground md:table-cell sm:px-4">{connection.host}</td>
                      <td className="px-3 py-3 text-muted-foreground sm:px-4">{connection.port}</td>
                      <td className="hidden px-3 py-3 text-muted-foreground lg:table-cell sm:px-4">{connection.user}</td>
                      <td className="px-3 py-3 text-muted-foreground sm:px-4">
                        {connection.owned ? "Mine" : "Shared"}
                      </td>
                      <td className="px-3 py-3 sm:px-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(connection)}
                            className="rounded-lg bg-muted px-3 py-1 text-sm font-medium text-foreground hover:bg-muted-foreground/10"
                          >
                            Edit
                          </button>
                          {connection.owned ? (
                            <button
                              type="button"
                              onClick={() => handleDelete(connection)}
                              className="rounded-lg bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive hover:bg-destructive/20"
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

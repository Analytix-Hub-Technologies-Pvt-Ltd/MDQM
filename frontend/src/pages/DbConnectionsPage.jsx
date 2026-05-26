import { useEffect, useState } from "react";
import {
  listSavedConnections,
  getSavedConnectionCredentials,
  saveDbConnection,
  updateSavedConnection,
  deleteSavedConnection,
  shareSavedConnection,
} from "@/api";

export default function DbConnectionsPage() {
  const [connections, setConnections] = useState([]);
  const [form, setForm] = useState({
    connection_name: "",
    host: "",
    port: "5432",
    user: "",
    pass: "",
    db_type: "postgres",
  });
  const [editingId, setEditingId] = useState(null);
  const [editingOwned, setEditingOwned] = useState(false);
  const [shareWith, setShareWith] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

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
    setForm({ connection_name: "", host: "", port: "5432", user: "", pass: "", db_type: "postgres" });
    setMessage("");
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.connection_name.trim() || !form.host.trim() || !form.user.trim()) {
      setMessage("Connection name, host, and username are required.");
      return;
    }

    setLoading(true);
    try {
      if (editingId) {
        await updateSavedConnection(editingId, form);
        setMessage("Saved connection updated.");
      } else {
        await saveDbConnection(form);
        setMessage("Saved connection created.");
      }
      resetForm();
      await fetchConnections();
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Failed to save connection.");
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
      });
      setEditingId(connection.connection_id);
      setEditingOwned(connection.owned);
      setShareWith("");
      setShareMessage("");
      setMessage("");
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Failed to load connection details.");
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
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Saved connections</h2>
              <p className="text-sm text-muted-foreground">Your personal connection profiles appear here.</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Name</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Type</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Host</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Port</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">User</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Source</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Actions</th>
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
                      <td className="px-4 py-3 text-foreground">{connection.connection_name}</td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">
                        {connection.db_type === "sqlserver"
                          ? "SQL Server"
                          : connection.db_type === "postgres"
                          ? "PostgreSQL"
                          : connection.db_type || "PostgreSQL"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{connection.host}</td>
                      <td className="px-4 py-3 text-muted-foreground">{connection.port}</td>
                      <td className="px-4 py-3 text-muted-foreground">{connection.user}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {connection.owned ? "Mine" : "Shared"}
                      </td>
                      <td className="px-4 py-3">
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

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{editingId ? "Edit connection" : "New connection"}</h2>
              <p className="text-sm text-muted-foreground">
                {editingId ? "Update your saved database profile." : "Save a new connection profile for reuse."}
              </p>
            </div>
            <button
              type="submit"
              form="db-connection-form"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {editingId ? "Update connection" : "Save connection"}
            </button>
          </div>

          <form id="db-connection-form" className="space-y-4" onSubmit={handleSubmit}>
             <label className="block text-sm font-medium text-foreground">
               Connection name
               <input
                 value={form.connection_name}
                 onChange={(event) => handleChange("connection_name", event.target.value)}
                 className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-input-foreground shadow-sm focus:border-primary focus:outline-none"
                 placeholder="e.g. analytics-db"
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
                   setForm((prev) => ({ ...prev, db_type: type, port: defPort }));
                 }}
                 className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-input-foreground shadow-sm focus:border-primary focus:outline-none"
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
                className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-input-foreground shadow-sm focus:border-primary focus:outline-none"
                placeholder="db.company.local"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-foreground">
                Port
                <input
                  value={form.port}
                  onChange={(event) => handleChange("port", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-input-foreground shadow-sm focus:border-primary focus:outline-none"
                  placeholder="5432"
                />
              </label>
              <label className="block text-sm font-medium text-foreground">
                Username
                <input
                  value={form.user}
                  onChange={(event) => handleChange("user", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-input-foreground shadow-sm focus:border-primary focus:outline-none"
                  placeholder="db_user"
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-foreground">
              Password
              <input
                value={form.pass}
                onChange={(event) => handleChange("pass", event.target.value)}
                type="password"
                className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-input-foreground shadow-sm focus:border-primary focus:outline-none"
                placeholder="Leave blank to keep current password"
              />
            </label>

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

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

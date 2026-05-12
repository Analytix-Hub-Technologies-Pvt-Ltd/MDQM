import { useEffect, useState } from "react";
import {
  adminApproveRequest,
  adminCreateUser,
  adminDeleteUser,
  adminDisableUser,
  adminListAccessRequests,
  adminListUsers,
  adminRejectRequest,
  adminRoles,
  adminUpdateUserRole,
} from "../api";
import { useAuth } from "../auth/AuthContext";

export default function AdminPanel() {
  const { user: currentUser } = useAuth();
  const defaultRole = "ANALYST";
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ full_name: "", email: "", role: defaultRole, password: "" });
  const [editUser, setEditUser] = useState(null);
  const [draftRole, setDraftRole] = useState(defaultRole);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    const [u, r, roleRes] = await Promise.all([adminListUsers(), adminListAccessRequests(), adminRoles()]);
    const rawUsers = u?.data;
    setUsers(Array.isArray(rawUsers) ? rawUsers : []);
    setRequests((Array.isArray(r?.data) ? r.data : []).filter((x) => x.status === "pending"));
    setRoles(roleRes.data?.roles || []);
  };

  useEffect(() => {
    load().catch(() => setErr("Failed to load admin data"));
  }, []);

  const createUser = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      await adminCreateUser({ ...form, password: form.password || undefined });
      setMsg("User created");
      setForm({ full_name: "", email: "", role: defaultRole, password: "" });
      await load();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Failed to create user");
    }
  };

  const approveRequest = async (id) => {
    setErr("");
    setMsg("");
    try {
      const res = await adminApproveRequest(id, "user");
      if (res?.data?.mail_sent) {
        setMsg("Request approved and invitation email sent.");
      } else {
        setMsg("Request approved.");
        if (res?.data?.mail_error) setErr(`Invitation email failed: ${res.data.mail_error}`);
      }
      await load();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Failed to approve request");
    }
  };

  useEffect(() => {
    if (editUser) setDraftRole(editUser.role);
  }, [editUser]);

  const closeUserEditor = () => {
    setEditUser(null);
  };

  const saveUserRole = async () => {
    if (!editUser) return;
    setErr("");
    setMsg("");
    try {
      await adminUpdateUserRole(editUser.id, draftRole);
      setMsg("User updated.");
      closeUserEditor();
      await load();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Failed to update user");
      await load();
    }
  };

  const disableEditedUser = async () => {
    if (!editUser) return;
    setErr("");
    setMsg("");
    try {
      await adminDisableUser(editUser.id);
      setMsg("User disabled.");
      closeUserEditor();
      await load();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Failed to disable user");
    }
  };

  const deleteEditedUser = async () => {
    if (!editUser) return;
    if (
      !window.confirm(
        `Permanently delete user ${editUser.email}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setErr("");
    setMsg("");
    try {
      await adminDeleteUser(editUser.id);
      setMsg("User deleted.");
      closeUserEditor();
      await load();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Failed to delete user");
    }
  };

  const isSelf = editUser && currentUser && editUser.id === currentUser.id;
  const isAdminRole = (role) => String(role || "").trim().toUpperCase() === "ADMIN";

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-[#FBFBFB] text-[#23243B]">
      <h1 className="text-2xl uppercase tracking-widest text-[#23243B] mb-6">Admin Panel</h1>
      {msg && <div className="mb-4 text-sm text-green-700">{msg}</div>}
      {err && <div className="mb-4 text-sm text-red-600">{err}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 p-4 text-[#23243B]">
          <h2 className="text-sm uppercase tracking-widest text-gray-600 mb-3">Create User</h2>
          <form className="space-y-2" onSubmit={createUser}>
            <input className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900" placeholder="Full name" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} required />
            <input className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900" placeholder="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
            <select className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
              {(roles.length ? roles : ["ADMIN", "CDO", "DATA_STEWARD", "DATA_OWNER", "DEVELOPER", "AUDITOR", "ANALYST", "VIEWER"]).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900" placeholder="Password (optional)" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
            <button className="w-full bg-[#23243B] text-white py-2 text-xs uppercase tracking-widest">Create User</button>
          </form>
        </div>

        <div className="bg-white border border-gray-200 p-4 xl:col-span-2 text-[#23243B]">
          <h2 className="text-sm uppercase tracking-widest text-gray-600 mb-3">Pending Requests</h2>
          <div className="overflow-auto">
            <table className="w-full text-sm text-gray-800">
              <thead><tr className="text-left text-gray-600"><th>Name</th><th>Username</th><th>Email</th><th>Department</th><th>Actions</th></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="py-2">{r.full_name}</td>
                    <td>{r.username || "—"}</td>
                    <td>{r.email}</td>
                    <td>{r.department || "-"}</td>
                    <td className="py-2 space-x-2">
                      <button className="px-2 py-1 border border-green-300 text-green-700" onClick={() => approveRequest(r.id)}>Approve</button>
                      <button className="px-2 py-1 border border-red-300 text-red-700" onClick={async () => { await adminRejectRequest(r.id); await load(); }}>Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 p-4 mt-6 text-[#23243B]">
        <h2 className="text-sm uppercase tracking-widest text-gray-600 mb-3">Users</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm text-gray-800">
            <thead>
              <tr className="text-left text-gray-500">
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="py-2">{u.full_name}</td>
                  <td>{u.username || "—"}</td>
                  <td>{u.email}</td>
                  <td className="capitalize">{u.role}</td>
                  <td>{u.is_active ? "Active" : "Disabled"}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      className="px-2 py-1 border border-gray-300 text-gray-800 uppercase text-xs tracking-wider"
                      onClick={() => setEditUser(u)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={closeUserEditor}
        >
          <div
            className="w-full max-w-md border border-gray-200 bg-white p-5 shadow-lg"
            role="dialog"
            aria-labelledby="user-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="user-edit-title" className="text-sm uppercase tracking-widest text-[#23243B] mb-4">
              Edit user
            </h3>
            <div className="space-y-2 text-sm text-gray-700 mb-4">
              <div>
                <span className="text-gray-500">Name</span>
                <div className="font-medium text-gray-900">{editUser.full_name}</div>
              </div>
              <div>
                <span className="text-gray-500">Username</span>
                <div className="font-medium text-gray-900">{editUser.username || "—"}</div>
              </div>
              <div>
                <span className="text-gray-500">Email</span>
                <div className="font-medium text-gray-900 break-all">{editUser.email}</div>
              </div>
            </div>
            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">Role</label>
            <select
              className="mb-4 w-full border border-gray-300 px-3 py-2 text-sm"
              value={draftRole}
              onChange={(e) => setDraftRole(e.target.value)}
            >
              {(roles.length ? roles : ["admin", "user", "viewer"]).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {isSelf && isAdminRole(editUser.role) && (
              <p className="mb-3 text-xs text-gray-500">
                You cannot remove your own admin role. Another admin can change your role if needed.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="bg-[#23243B] px-4 py-2 text-xs uppercase tracking-widest text-white"
                onClick={saveUserRole}
                disabled={
                  isSelf && isAdminRole(editUser.role) && !isAdminRole(draftRole)
                }
              >
                Save role
              </button>
              <button
                type="button"
                className="border border-gray-300 px-4 py-2 text-xs uppercase tracking-widest text-gray-700"
                onClick={closeUserEditor}
              >
                Cancel
              </button>
              {editUser.is_active && !isSelf && (
                <button
                  type="button"
                  className="border border-red-300 px-4 py-2 text-xs uppercase tracking-widest text-red-700"
                  onClick={disableEditedUser}
                >
                  Disable
                </button>
              )}
              {!isSelf && (
                <button
                  type="button"
                  className="border border-red-600 px-4 py-2 text-xs uppercase tracking-widest text-red-800"
                  onClick={deleteEditedUser}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 p-4 mt-6 text-[#23243B]">
        <h2 className="text-sm uppercase tracking-widest text-gray-600 mb-3">Roles</h2>
        <div className="text-sm text-gray-700">{roles.join(", ") || "ADMIN, CDO, DATA_STEWARD, DATA_OWNER, DEVELOPER, AUDITOR, ANALYST, VIEWER"}</div>
      </div>
    </div>
  );
}

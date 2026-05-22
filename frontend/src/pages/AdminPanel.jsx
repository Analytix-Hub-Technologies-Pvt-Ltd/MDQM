import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminCreateUser,
  adminDeleteUser,
  adminDisableUser,
  adminListUsers,
  adminRoles,
  adminUpdateUserRole,
  adminResetUserPassword,
} from "../api";
import { useAuth } from "../auth/AuthContext";

export default function AdminPanel() {
  const { user: currentUser } = useAuth();
  const defaultRole = "ANALYST";
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ full_name: "", username: "", email: "", role: defaultRole, password: "" });
  const [editUser, setEditUser] = useState(null);
  const [draftRole, setDraftRole] = useState(defaultRole);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");

  const load = async () => {
    const [u, roleRes] = await Promise.all([adminListUsers(), adminRoles()]);
    const rawUsers = u?.data;
    setUsers(Array.isArray(rawUsers) ? rawUsers : []);
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
      await adminCreateUser({
        ...form,
        username: form.username.trim() || undefined,
        password: form.password || undefined,
      });
      setMsg("User created");
      setForm({ full_name: "", username: "", email: "", role: defaultRole, password: "" });
      await load();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Failed to create user");
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

  const handleResetPassword = async () => {
    if (!editUser) return;
    if (!resetPassword) {
      setErr("Please enter a new password");
      return;
    }
    if (resetPassword.length < 8) {
      setErr("Password must be at least 8 characters");
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setErr("Passwords do not match");
      return;
    }
    
    setErr("");
    setMsg("");
    try {
      await adminResetUserPassword(editUser.id, resetPassword);
      setMsg(`Password reset for user ${editUser.email}`);
      setShowResetPassword(false);
      setResetPassword("");
      setResetPasswordConfirm("");
      closeUserEditor();
      await load();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Failed to reset password");
    }
  };

  const closeResetPasswordDialog = () => {
    setShowResetPassword(false);
    setResetPassword("");
    setResetPasswordConfirm("");
    setErr("");
  };

  const isSelf = editUser && currentUser && editUser.id === currentUser.id;
  const isAdminRole = (role) => String(role || "").trim().toUpperCase() === "ADMIN";

  return (
    <div className="flex-1 overflow-y-auto text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Admin overview</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Pending signup and data-access requests are under{" "}
        <Link to="/admin/access-requests" className="font-medium text-primary underline underline-offset-2 hover:no-underline">
          Access requests
        </Link>{" "}
        in the admin menu.
      </p>
      {msg && <div className="mb-4 text-sm text-green-700">{msg}</div>}
      {err && <div className="mb-4 text-sm text-red-600">{err}</div>}

      <div className="grid grid-cols-1 gap-6 lg:max-w-xl">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground mb-3">Create User</h2>
          <form className="space-y-2" onSubmit={createUser}>
            <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Full name" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} required />
            <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Username" value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} />
            <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
            <select className="w-full rounded-lg border px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
              {(roles.length ? roles : ["ADMIN", "CDO", "DATA_STEWARD", "DATA_OWNER", "DEVELOPER", "AUDITOR", "ANALYST", "BUSINESS_USER"]).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Password (optional)" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
            <button className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-xs font-semibold uppercase tracking-widest hover:opacity-90">Create User</button>
          </form>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 mt-6 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground mb-3">Users</h2>
        <div className="overflow-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
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
                <tr key={u.id} className="border-t border-border">
                  <td className="py-2">{u.full_name}</td>
                  <td>{u.username || "—"}</td>
                  <td>{u.email}</td>
                  <td className="capitalize">{u.role}</td>
                  <td>{u.is_active ? "Active" : "Disabled"}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      className="px-2 py-1 rounded-md border border-border text-foreground uppercase text-xs font-semibold tracking-wider hover:bg-muted"
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
              {(roles.length ? roles : ["admin", "user", "business_user"]).map((r) => (
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
                className="bg-blue-600 px-4 py-2 text-xs uppercase tracking-widest text-white hover:bg-blue-700"
                onClick={() => setShowResetPassword(true)}
              >
                Reset Password
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
        <div className="text-sm text-gray-700">{roles.join(", ") || "ADMIN, CDO, DATA_STEWARD, DATA_OWNER, DEVELOPER, AUDITOR, ANALYST, BUSINESS_USER"}</div>
      </div>

      {/* Reset Password Modal */}
      {showResetPassword && editUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={closeResetPasswordDialog}
        >
          <div
            className="w-full max-w-md border border-gray-200 bg-white p-5 shadow-lg"
            role="dialog"
            aria-labelledby="reset-password-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="reset-password-title" className="text-sm uppercase tracking-widest text-[#23243B] mb-4">
              Reset Password for {editUser.email}
            </h3>
            
            {err && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">{err}</div>}
            {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded">{msg}</div>}
            
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">New Password</label>
                <input
                  type="password"
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Enter new password (min 8 characters)"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">Confirm Password</label>
                <input
                  type="password"
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Confirm new password"
                  value={resetPasswordConfirm}
                  onChange={(e) => setResetPasswordConfirm(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="bg-blue-600 px-4 py-2 text-xs uppercase tracking-widest text-white hover:bg-blue-700"
                onClick={handleResetPassword}
              >
                Reset Password
              </button>
              <button
                type="button"
                className="border border-gray-300 px-4 py-2 text-xs uppercase tracking-widest text-gray-700"
                onClick={closeResetPasswordDialog}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


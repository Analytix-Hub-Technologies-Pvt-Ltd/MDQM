import { useEffect, useState } from "react";
import {
  adminApproveRequest,
  adminCreateUser,
  adminDisableUser,
  adminListAccessRequests,
  adminListUsers,
  adminRejectRequest,
  adminRoles,
  adminUpdateUserRole,
} from "../api";

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ full_name: "", email: "", role: "user", password: "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    const [u, r, roleRes] = await Promise.all([adminListUsers(), adminListAccessRequests(), adminRoles()]);
    setUsers(u.data || []);
    setRequests((r.data || []).filter((x) => x.status === "pending"));
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
      setForm({ full_name: "", email: "", role: "user", password: "" });
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

  const updateUserRole = async (userId, role) => {
    setErr("");
    setMsg("");
    try {
      await adminUpdateUserRole(userId, role);
      setMsg("User role updated.");
      await load();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Failed to update user role");
      await load();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-[#FBFBFB]">
      <h1 className="text-2xl uppercase tracking-widest text-[#23243B] mb-6">Admin Panel</h1>
      {msg && <div className="mb-4 text-sm text-green-700">{msg}</div>}
      {err && <div className="mb-4 text-sm text-red-600">{err}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 p-4">
          <h2 className="text-sm uppercase tracking-widest text-gray-600 mb-3">Create User</h2>
          <form className="space-y-2" onSubmit={createUser}>
            <input className="w-full border border-gray-300 px-3 py-2 text-sm" placeholder="Full name" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} required />
            <input className="w-full border border-gray-300 px-3 py-2 text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
            <select className="w-full border border-gray-300 px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
              <option value="user">User</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
            <input className="w-full border border-gray-300 px-3 py-2 text-sm" placeholder="Password (optional)" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
            <button className="w-full bg-[#23243B] text-white py-2 text-xs uppercase tracking-widest">Create User</button>
          </form>
        </div>

        <div className="bg-white border border-gray-200 p-4 xl:col-span-2">
          <h2 className="text-sm uppercase tracking-widest text-gray-600 mb-3">Pending Requests</h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th>Name</th><th>Email</th><th>Department</th><th>Actions</th></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="py-2">{r.full_name}</td><td>{r.email}</td><td>{r.department || "-"}</td>
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

      <div className="bg-white border border-gray-200 p-4 mt-6">
        <h2 className="text-sm uppercase tracking-widest text-gray-600 mb-3">Users</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500"><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="py-2">{u.full_name}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      className="border border-gray-300 px-2 py-1 text-xs bg-white"
                      value={u.role}
                      onChange={(e) => updateUserRole(u.id, e.target.value)}
                    >
                      <option value="admin">admin</option>
                      <option value="user">user</option>
                      <option value="viewer">viewer</option>
                    </select>
                  </td>
                  <td>{u.is_active ? "Active" : "Disabled"}</td>
                  <td className="py-2">{u.is_active ? <button className="px-2 py-1 border border-red-300 text-red-700" onClick={async () => { await adminDisableUser(u.id); await load(); }}>Disable</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-gray-200 p-4 mt-6">
        <h2 className="text-sm uppercase tracking-widest text-gray-600 mb-3">Roles</h2>
        <div className="text-sm text-gray-700">{roles.join(", ") || "admin, user, viewer"}</div>
      </div>
    </div>
  );
}

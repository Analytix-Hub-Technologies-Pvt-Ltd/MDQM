import { useEffect, useMemo, useState } from "react";
import {
  assignTicketByEmail,
  createTicket,
  getTicketUsers,
  getTickets,
  updateTicketStatus,
  getTicketDatasets
} from "@/api";

import { useAuth } from "@/auth/AuthContext";import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ROLES = {
  ADMIN: "ADMIN",
  CDO: "CDO",
  DATA_STEWARD: "DATA_STEWARD",
  DATA_OWNER: "DATA_OWNER",
  DEVELOPER: "DEVELOPER",
  AUDITOR: "AUDITOR",
  ANALYST: "ANALYST",
  BUSINESS_USER: "BUSINESS_USER",
};

const ALL_ROLES = [
  ROLES.ADMIN,
  ROLES.CDO,
  ROLES.DATA_STEWARD,
  ROLES.DATA_OWNER,
  ROLES.DEVELOPER,
  ROLES.AUDITOR,
  ROLES.ANALYST,
  ROLES.BUSINESS_USER,
];

const CREATOR_ROLES = ALL_ROLES;
const ASSIGN_ROLES = ALL_ROLES;
const VIEW_ALL_ROLES = ALL_ROLES;

function normalizeRole(role) {
  const value = String(role || ROLES.BUSINESS_USER).toUpperCase();
  if (value === "STEWARD") return ROLES.DATA_STEWARD;
  if (value === "OWNER") return ROLES.DATA_OWNER;
  if (value === "BUSINESS" || value === "BU" || value === "USER") return ROLES.BUSINESS_USER;
  return value;
}

function statusBadgeClass(status) {
  if (status === "Closed") return "border-green-600 text-green-700";
  if (status === "Fixed") return "border-blue-600 text-blue-700";
  if (status === "In Progress") return "border-yellow-600 text-yellow-700";
  if (status === "Assigned") return "border-purple-600 text-purple-700";
  return "border-gray-400";
}

export default function TicketsPage() {
  const { role, user } = useAuth();
  const normalizedRole = normalizeRole(role);

  const canCreate = CREATOR_ROLES.includes(normalizedRole);
  const canAssign = ASSIGN_ROLES.includes(normalizedRole);
  const canViewAll = VIEW_ALL_ROLES.includes(normalizedRole);

  const [tickets, setTickets] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [assigningTicketId, setAssigningTicketId] = useState(null);
  const [selectedDeveloperEmail, setSelectedDeveloperEmail] = useState("");
  const [fixNotes, setFixNotes] = useState({});
  const [selectedRole, setSelectedRole] = useState("");
  const [datasets, setDatasets] = useState([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Bug Issue",
    priority: "Medium",
    assignment_type: "ROLE",
    assigned_role: "",
    user_email: "",
  });

  const pageSubtitle = useMemo(() => {
    if (canViewAll) return "View and monitor all tickets.";
    if (normalizedRole === ROLES.DEVELOPER) return "View all created tickets and mark them as in progress or fixed.";
    if (normalizedRole === ROLES.DATA_STEWARD) return "View data/governance tickets, assign work, verify, and close.";
    return "Raise tickets and track your ticket status.";
  }, [canViewAll, normalizedRole]);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const res = await getTickets();
      setTickets(res.data || []);
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Unable to load tickets");
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    if (!canAssign) return;
    try {
      const res = await getTicketUsers();
      setUsers(res.data || []);
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Unable to load users list");
    }
  };

  const loadDatasets = async () => {
  try {
    const res = await getTicketDatasets();
    console.log("Datasets:", res.data);
    setDatasets(res.data || []);
  } catch (err) {
    console.log("Dataset loading error:", err);
  }
};

useEffect(() => {
  loadTickets();
  loadUsers();
  loadDatasets();
}, []);
  
const handleCreate = async (e) => {
  e.preventDefault();
  setMessage("");

  try {
    const payload = {
      title: form.title,
      description: form.description,
      category: form.category,
      priority: form.priority,
      assignment_type: form.assignment_type,
    };

    if (form.assignment_type === "ROLE" || form.assignment_type === "BOTH") {
      payload.assigned_role = form.assigned_role;
    }

    if (form.assignment_type === "USER" || form.assignment_type === "BOTH") {
      if (form.user_email && form.user_email.trim() !== "") {
        payload.user_email = form.user_email;
      }
    }

    const res = await createTicket(payload);

    setForm({
      title: "",
      description: "",
      category: "Bug Issue",
      priority: "Medium",
      assignment_type: "ROLE",
      assigned_role: "",
      user_email: "",
    });

    setSelectedRole("");
    if (res.data.mail_sent) {
  setMessage("Ticket created successfully. Email notification Triggered.");
} else {
  setMessage("Ticket created successfully. Email notification not sent.");
}
    setShowCreateModal(false);
    loadTickets();
  } catch (err) {
    const detail = err?.response?.data?.detail;

    if (Array.isArray(detail)) {
      setMessage(detail.map((e) => e.msg).join(", "));
    } else {
      setMessage(detail || "Ticket creation failed");
    }
    
  }
};

  const handleAssign = async (ticketId) => {
    if (!selectedDeveloperEmail) {
      setMessage("Select a User email before assigning");
      return;
    }
    try {
      const res = await assignTicketByEmail(ticketId, selectedDeveloperEmail);
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? res.data.ticket : t)));
      setAssigningTicketId(null);
      setSelectedDeveloperEmail("");
      setMessage("Ticket assigned successfully");
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Ticket assignment failed");
    }
  };

  const changeStatus = async (ticketId, status) => {
  setMessage("");

  try {
    const payload = { status };

    if (status === "Fixed") {
      payload.fix_note = fixNotes[ticketId] || "Fixed in source code";
      payload.comment = payload.fix_note;
    }

    await updateTicketStatus(ticketId, payload);

    setMessage(
      status === "Closed"
        ? "Ticket closed. Email notification triggered."
        : `Ticket moved to ${status}.`
    );

    await loadTickets();

  } catch (err) {
    setMessage(err?.response?.data?.detail || "Status update failed");
  }
};

  const roleHelp = {
    ADMIN: "Can view all, raise, assign, verify, and close tickets.",
    CDO: "Can view, assign, verify, close, fix all tickets and raise escalation tickets.",
    DATA_STEWARD: "Can raise data tickets, assign to users, verify, fix and close.",
    DATA_OWNER: "Can raise, assign, close, fix and verify data-related tickets.",
    DEVELOPER: "Can view all created tickets, verify, close and mark them as fixed.",
    AUDITOR: "Can view all tickets, assign, verify, fix and close.",
    ANALYST: "Can raise, verify, fix, assign, close and track own analytics/report tickets.",
    BUSINESS_USER: "Can raise, verify, fix, assign, close and track own business issue tickets.",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
        <p className="text-sm text-muted-foreground">{pageSubtitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Current role: <b>{normalizedRole}</b> — {roleHelp[normalizedRole] || "Role-based ticket access enabled."}
        </p>
      </div>

      {message && <div className="rounded-md border p-3 text-sm">{message}</div>}

      <div className="flex justify-end">
  <Button onClick={() => setShowCreateModal(true)}>
    New Ticket
  </Button>
</div>

{showCreateModal && (
<div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/40 pt-20">    <div className="w-[500px] max-w-[95%] rounded-xl bg-white p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Create Ticket</h2>

        <button
          onClick={() => setShowCreateModal(false)}
          className="text-xl"
        >
          
        </button>
      </div>

<form onSubmit={handleCreate} className="flex flex-col gap-4 w-full">        <Input
          placeholder="Title"
          value={form.title}
          onChange={(e) =>
            setForm({ ...form, title: e.target.value })
          }
          required
        />

        <select
          className="rounded-md border bg-background px-3 py-2"
          value={form.category}
          onChange={(e) =>
            setForm({ ...form, category: e.target.value })
          }
        >
          <option>Bug Issue</option>
          <option>Data Quality Issue</option>
          <option>Dashboard Issue</option>
          <option>Access Request</option>
          <option>Governance Issue</option>
          <option>Validation</option>
          <option>Metadata</option>
          <option>Data Correction</option>
        </select>

        <textarea
          className="min-h-24 rounded-md border bg-background px-3 py-2"
          placeholder="Description"
          value={form.description}
          onChange={(e) =>
            setForm({ ...form, description: e.target.value })
          }
          required
        />
        <select
  className="rounded-md border bg-background px-3 py-2"
  value={form.dataset_id}
  onChange={(e) => {
    const selected = datasets.find(
      (d) => String(d.id) === e.target.value
    );

    setForm({...form,
  dataset_id: e.target.value,
  dataset_name: selected?.name || "",
  dataset_owner: selected?.created_by_name || "",

  assignment_type: "ROLE",
  assigned_role: "DATA_OWNER",
  user_email: "",
});
  }}
>
  <option value="">Select Dataset</option>

  {datasets.map((d) => (
    <option key={d.id} value={d.id}>
      {d.name} - Created by {d.created_by_name || d.created_by_email}
    </option>
  ))}
</select>

        <select
          className="rounded-md border bg-background px-3 py-2"
          value={form.priority}
          onChange={(e) =>
            setForm({ ...form, priority: e.target.value })
          }
        >
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
          <option>Critical</option>
        </select>
        
<select
  className="rounded-md border bg-background px-3 py-2"
  value={form.assignment_type}
  onChange={(e) =>
    setForm({
      ...form,
      assignment_type: e.target.value,
      assigned_role: "",
      user_email: "",
    })
  }
>
  <option value="ROLE">Role Based</option>
  <option value="USER">User Based</option>
</select>
        {/* Role Dropdown */}
{form.assignment_type === "ROLE" && (
  <select
    className="rounded-md border bg-background px-3 py-2"
    value={form.assigned_role}
    onChange={(e) =>
      setForm({ ...form, assigned_role: e.target.value })
    }
  >
    <option value="">Select Role</option>
    <option value="ADMIN">ADMIN</option>
    <option value="CDO">CDO</option>
    <option value="DATA_STEWARD">DATA_STEWARD</option>
    <option value="DATA_OWNER">DATA_OWNER</option>
    <option value="DEVELOPER">DEVELOPER</option>
    <option value="AUDITOR">AUDITOR</option>
    <option value="ANALYST">ANALYST</option>
    <option value="BUSINESS_USER">BUSINESS_USER</option>
  </select>
)}

{/* User Email Dropdown */}
{form.assignment_type === "USER" && (
  <select
    className="rounded-md border bg-background px-3 py-2"
    value={form.user_email}
    onChange={(e) =>
      setForm({ ...form, user_email: e.target.value })
    }
  >
    <option value="">Assign User</option>

    {users.map((u) => (
      <option key={u.id} value={u.email}>
        {u.full_name} - {u.email}
      </option>
    ))}
  </select>
)}

        <div className="flex gap-2">
          <Button type="submit">
            Create Ticket
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setShowCreateModal(false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  </div>
)}

      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 text-lg font-semibold">
            {normalizedRole === ROLES.DEVELOPER ? "All Tickets" : "Ticket List"}
          </h2>

          {loading ? (
            <p>Loading tickets...</p>
          ) : tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickets found.</p>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">#{ticket.id} — {ticket.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{ticket.description}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs ${statusBadgeClass(ticket.status)}`}>{ticket.status}</span>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                    <p><b>Category:</b> {ticket.category}</p>
                    <p><b>Priority:</b> {ticket.priority}</p>
                    <p><b>Raised by:</b> {ticket.created_by_name || ticket.created_by_email}</p>
                    <p><b>Assigned to:</b> {ticket.assigned_to_name ? `${ticket.assigned_to_name} (${ticket.assigned_to_email})` : "Not assigned"}</p>
                    <p><b>Fixed by:</b> {ticket.fixed_by_name || "-"}</p>
                    <p><b>Verified by:</b> {ticket.verified_by_name || "-"}</p>
                    <p><b>Created:</b> {ticket.created_at ? new Date(ticket.created_at).toLocaleString() : "-"}</p>
                    <p><b>Fixed:</b> {ticket.fixed_at ? new Date(ticket.fixed_at).toLocaleString() : "-"}</p>
                    <p><b>Verified:</b> {ticket.verified_at ? new Date(ticket.verified_at).toLocaleString() : "-"}</p>
                    <p><b>Closed:</b> {ticket.closed_at ? new Date(ticket.closed_at).toLocaleString() : "-"}</p>
                  </div>

                  {ticket.fix_note && (
                    <div className="mt-3 rounded-md border p-3 text-sm">
                      <b>Fix Note:</b> {ticket.fix_note}
                    </div>
                  )}

                  {canAssign && ticket.status !== "Closed" && (
                    <div className="mt-4 rounded-md border p-3">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => setAssigningTicketId(ticket.id)}>
                          Assign User
                        </Button>
                        {assigningTicketId === ticket.id && (
                          <>
                            <select className="rounded-md border bg-background px-3 py-2 text-sm" value={selectedDeveloperEmail} onChange={(e) => setSelectedDeveloperEmail(e.target.value)}>
                              <option value="">Select User Email</option>
                              {users.map((dev) => (
                                <option key={dev.id} value={dev.email}>{dev.full_name} ({dev.email})</option>
                              ))}
                            </select>
                            <Button size="sm" onClick={() => handleAssign(ticket.id)}>Save Assignment</Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                    {ticket.status !== "Closed" &&
 (normalizedRole === ROLES.ADMIN ||
  ticket.assigned_to_user_id === user?.id) && (                  <div className="mt-4 rounded-md border p-3">
                      <h4 className="mb-2 text-sm font-semibold">Ticket Actions</h4>
                      <textarea
                        className="mb-2 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        placeholder="Write fix note, for example: Fixed SQL query in dashboard API"
                        value={fixNotes[ticket.id] || ""}
                        onChange={(e) => setFixNotes({ ...fixNotes, [ticket.id]: e.target.value })}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => changeStatus(ticket.id, "In Progress")}>Mark In Progress</Button>
                        <Button size="sm" onClick={() => changeStatus(ticket.id, "Fixed")}>Mark Fixed</Button>
                      </div>
                    </div>
                  )}

                  {ticket.status !== "Closed" && 
 (normalizedRole === ROLES.ADMIN ||
  ticket.assigned_to_user_id === user?.id) && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => changeStatus(ticket.id, "Verified")} >Verify </Button>
                      <Button variant="outline" size="sm" onClick={() => changeStatus(ticket.id, "Closed")} > Close Ticket </Button>
                    </div>
                  )}
                </div>
  
))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

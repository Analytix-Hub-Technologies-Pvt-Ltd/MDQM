import { useCallback, useEffect, useState } from "react";
import {
  adminApproveRequest,
  adminCompleteDataAccessRequest,
  adminListAccessRequests,
  adminRejectRequest,
} from "../../api";

const DURATION_LABELS_ADMIN = {
  "7_days": "7 days",
  "30_days": "30 days",
  "90_days": "90 days",
  "180_days": "180 days",
  ongoing: "Ongoing",
};

function formatDur(v) {
  if (!v) return "—";
  return DURATION_LABELS_ADMIN[v] || v;
}

export default function AdminAccessRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await adminListAccessRequests();
    setRequests((Array.isArray(r?.data) ? r.data : []).filter((x) => x.status === "pending"));
  }, []);

  useEffect(() => {
    load().catch(() => setErr("Failed to load access requests"));
  }, [load]);

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

  const completeDataAccessRequest = async (id) => {
    setErr("");
    setMsg("");
    try {
      await adminCompleteDataAccessRequest(id);
      setMsg("Data access request marked approved for existing user.");
      await load();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Failed to approve data access request");
    }
  };

  return (
    <div className="p-8">
      <h1 className="mb-2 text-2xl uppercase tracking-widest text-[#23243B]">Pending access requests</h1>
      <p className="mb-6 max-w-3xl text-sm text-gray-600">
        <strong>Approve (new account)</strong> creates a user and sends an invite (public signup).{" "}
        <strong>Approve data access</strong> when the person already has a login (e.g. business user Data requests).
      </p>
      {msg ? <div className="mb-4 text-sm text-green-700">{msg}</div> : null}
      {err ? <div className="mb-4 text-sm text-red-600">{err}</div> : null}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full table-fixed border-collapse text-left text-sm text-gray-800">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase leading-tight tracking-wide text-gray-600">
              <th className="w-[9%] px-3 py-2.5 align-bottom">Name</th>
              <th className="w-[11%] px-3 py-2.5 align-bottom">User</th>
              <th className="w-[17%] px-3 py-2.5 align-bottom">Email</th>
              <th className="w-[12%] px-3 py-2.5 align-bottom">Dataset</th>
              <th className="w-[7%] px-3 py-2.5 align-bottom">Dept</th>
              <th className="w-[18%] px-3 py-2.5 align-bottom">Purpose</th>
              <th className="w-[7%] px-3 py-2.5 align-bottom">Access</th>
              <th className="w-[7%] px-3 py-2.5 align-bottom pr-4">Duration</th>
              <th className="w-[12%] border-l border-gray-200 bg-gray-50 px-3 py-2.5 align-bottom pl-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {requests.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-gray-500">
                  No pending requests.
                </td>
              </tr>
            ) : (
              requests.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="min-w-0 px-3 py-2.5 align-top font-medium break-words text-gray-900">{r.full_name}</td>
                  <td className="min-w-0 px-3 py-2.5 align-top text-gray-700" title={r.username || ""}>
                    <span className="block truncate">{r.username || "—"}</span>
                  </td>
                  <td className="min-w-0 px-3 py-2.5 align-top text-gray-700" title={r.email}>
                    <span className="block truncate">{r.email}</span>
                  </td>
                  <td className="min-w-0 px-3 py-2.5 align-top break-words text-gray-700" title={r.dataset_name || ""}>
                    {r.dataset_name || "—"}
                  </td>
                  <td className="min-w-0 px-3 py-2.5 align-top break-words text-gray-600">{r.department || "—"}</td>
                  <td className="min-w-0 px-3 py-2.5 align-top break-words text-gray-700" title={r.reason || ""}>
                    {r.reason || "—"}
                  </td>
                  <td className="min-w-0 px-3 py-2.5 align-top whitespace-nowrap">
                    <span className="inline-block rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-800">
                      {r.access_type || "—"}
                    </span>
                  </td>
                  <td className="min-w-0 px-3 py-2.5 align-top whitespace-nowrap pr-4 text-gray-700">{formatDur(r.duration)}</td>
                  <td className="min-w-0 border-l border-gray-100 bg-white px-3 py-2.5 pl-4 align-top">
                    <div className="flex flex-col gap-1.5">
                      {r.has_user ? (
                        <button
                          type="button"
                          className="w-full rounded border border-blue-400 bg-blue-50 px-2 py-1.5 text-left text-[11px] font-medium leading-snug text-blue-900 hover:bg-blue-100"
                          onClick={() => completeDataAccessRequest(r.id)}
                        >
                          Approve data access
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="w-full rounded border border-emerald-400 bg-emerald-50 px-2 py-1.5 text-left text-[11px] font-medium leading-snug text-emerald-900 hover:bg-emerald-100"
                          onClick={() => approveRequest(r.id)}
                        >
                          Approve (new account)
                        </button>
                      )}
                      <button
                        type="button"
                        className="w-full rounded border border-red-300 bg-white px-2 py-1.5 text-left text-[11px] font-medium text-red-700 hover:bg-red-50"
                        onClick={async () => {
                          await adminRejectRequest(r.id);
                          setMsg("Request rejected.");
                          setErr("");
                          await load();
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

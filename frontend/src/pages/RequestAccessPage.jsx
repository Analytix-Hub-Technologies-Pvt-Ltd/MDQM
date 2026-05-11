import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { submitAccessRequest } from "../api";

const getApiErrorMessage = (err, fallback) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message)
      .filter(Boolean)
      .join(", ") || fallback;
  }
  if (detail && typeof detail === "object") return detail.msg || fallback;
  return fallback;
};

export default function RequestAccessPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    username: "",
    email: "",
    department: "",
    reason: "",
  });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const onChange = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus("");
    setError("");
    try {
      await submitAccessRequest({
        ...form,
        username: form.username.trim(),
        email: form.email.trim(),
      });
      setStatus("Request submitted. Admin will review your request.");
      setForm({ full_name: "", username: "", email: "", department: "", reason: "" });
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to submit request"));
    }
  };

  return (
    <div className="min-h-screen bg-[#FBFBFB] flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-white border border-gray-200 p-6">
        <h1 className="text-xl uppercase tracking-widest text-[#23243B] mb-5">Request Access</h1>
        <form className="space-y-3" onSubmit={onSubmit}>
          <input className="w-full border border-gray-300 px-3 py-2" placeholder="Full name" value={form.full_name} onChange={(e) => onChange("full_name", e.target.value)} required />
          <input className="w-full border border-gray-300 px-3 py-2" placeholder="Username" value={form.username} onChange={(e) => onChange("username", e.target.value)} required autoComplete="username" />
          <input className="w-full border border-gray-300 px-3 py-2" placeholder="Company email" type="email" value={form.email} onChange={(e) => onChange("email", e.target.value)} required />
          <input className="w-full border border-gray-300 px-3 py-2" placeholder="Department" value={form.department} onChange={(e) => onChange("department", e.target.value)} />
          <textarea className="w-full border border-gray-300 px-3 py-2 min-h-[110px]" placeholder="Reason for access" value={form.reason} onChange={(e) => onChange("reason", e.target.value)} />
          {status && <div className="text-sm text-green-700">{status}</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex gap-2">
            <button className="bg-[#23243B] text-white px-4 py-2 uppercase text-xs tracking-widest">Submit</button>
            <button type="button" onClick={() => navigate("/login")} className="border border-gray-300 px-4 py-2 uppercase text-xs tracking-widest text-gray-700">Back to Login</button>
          </div>
        </form>
      </div>
    </div>
  );
}

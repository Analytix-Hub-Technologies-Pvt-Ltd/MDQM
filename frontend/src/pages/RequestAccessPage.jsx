import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { submitAccessRequest } from "../api";
import AuthLayout from "@/components/layout/AuthLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
    <AuthLayout title="Request access" subtitle="Submit a request for MDQM platform access">
      <form className="space-y-4" onSubmit={onSubmit}>
        <Input placeholder="Full name" value={form.full_name} onChange={(e) => onChange("full_name", e.target.value)} required />
        <Input placeholder="Username" value={form.username} onChange={(e) => onChange("username", e.target.value)} required autoComplete="username" />
        <Input placeholder="Company email" type="email" value={form.email} onChange={(e) => onChange("email", e.target.value)} required />
        <Input placeholder="Department" value={form.department} onChange={(e) => onChange("department", e.target.value)} />
        <textarea
          className="flex min-h-[110px] w-full resize-y rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition-colors border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--input-foreground)] placeholder:font-normal placeholder:text-[var(--placeholder)] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          placeholder="Reason for access"
          value={form.reason}
          onChange={(e) => onChange("reason", e.target.value)}
          required
        />
        {status ? (
          <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{status}</div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Submit request</Button>
          <Button type="button" variant="outline" asChild>
            <Link to="/login">Back to login</Link>
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}

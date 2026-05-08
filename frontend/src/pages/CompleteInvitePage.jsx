import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { completeInvite } from "../api";

const getApiErrorMessage = (err, fallback) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return (
      detail
        .map((item) => item?.msg || item?.message)
        .filter(Boolean)
        .join(", ") || fallback
    );
  }
  if (detail && typeof detail === "object") return detail.msg || fallback;
  return fallback;
};

export default function CompleteInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setError("");
    if (!token) {
      setError("Invitation token is missing.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await completeInvite({ token, password });
      setMsg("Password set successfully. You can now log in.");
      setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to complete invitation"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBFBFB] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-gray-200 p-6">
        <h1 className="text-xl tracking-wide uppercase text-[#23243B] mb-5">Set your password</h1>
        <form className="space-y-3" onSubmit={onSubmit}>
          <input
            className="w-full border border-gray-300 px-3 py-2"
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            className="w-full border border-gray-300 px-3 py-2"
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {msg && <div className="text-sm text-green-700">{msg}</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button disabled={loading} className="w-full bg-[#23243B] text-white py-2 uppercase text-xs tracking-widest">
            {loading ? "Saving..." : "Complete setup"}
          </button>
        </form>
      </div>
    </div>
  );
}

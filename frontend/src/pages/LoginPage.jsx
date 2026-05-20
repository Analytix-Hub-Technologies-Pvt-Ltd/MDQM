import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

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

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(loginId.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBFBFB] flex items-center justify-center p-6 text-[#23243B]">
      <div className="auth-surface-light w-full max-w-md bg-white border border-gray-200 p-6 text-[#23243B] shadow-sm">
        <h1 className="text-2xl tracking-wide uppercase text-[#23243B] mb-6">MDQM Login</h1>
        <form className="space-y-4" onSubmit={onSubmit}>
          <input
            className="w-full border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 px-3 py-2"
            placeholder="Username or company email"
            type="text"
            required
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
          />
          <input
            className="w-full border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 px-3 py-2"
            placeholder="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button disabled={loading} className="w-full bg-[#23243B] text-white py-2 uppercase text-xs tracking-widest">
            {loading ? "Signing in..." : "Login"}
          </button>
          <button type="button" onClick={() => navigate("/request-access")} className="w-full border border-gray-300 py-2 uppercase text-xs tracking-widest text-gray-700">
            Request Access
          </button>
        </form>
      </div>
    </div>
  );
}

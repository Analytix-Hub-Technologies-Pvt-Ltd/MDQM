import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { ROLES } from "./rolePermissions";

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { ready, user } = useAuth();
  if (!ready) {
    return <div className="p-8 text-sm text-gray-500">Loading session...</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && String(user?.role || "").toUpperCase() !== ROLES.ADMIN) return <Navigate to="/dashboard" replace />;
  return children;
}

import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { ROLES } from "../../auth/rolePermissions";

export default function AdminOnly({ children }) {
  const { ready, user } = useAuth();
  if (!ready) {
    return <div className="p-8 text-sm text-gray-500">Loading session...</div>;
  }
  if (!user || String(user?.role || "").toUpperCase() !== ROLES.ADMIN) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

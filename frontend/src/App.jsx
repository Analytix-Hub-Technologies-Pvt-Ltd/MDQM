import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import ValidationRules from "./pages/ValidationRules";
import JobList from "./pages/JobList";
import QuarantineSection from "./components/QuarantineSection";
import DashboardRouter from "./pages/DashboardRouter";
import LoginPage from "./pages/LoginPage";
import RequestAccessPage from "./pages/RequestAccessPage";
import CompleteInvitePage from "./pages/CompleteInvitePage";
import AdminPanel from "./pages/AdminPanel";
import AuditLogsPage from "./pages/AuditLogsPage";
import ProtectedRoute from "./auth/ProtectedRoute";
import { useAuth } from "./auth/AuthContext";
import PermissionGuard from "./auth/PermissionGuard";
import { PERMISSIONS } from "./auth/permissions";

function PlaceholderPage({ title, description }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl text-slate-800">{title}</h1>
      <p className="text-slate-500 mt-2">{description}</p>
    </div>
  );
}

function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen bg-[#FBFBFB]">
      <Sidebar />

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="h-12 border-b border-gray-200 bg-white px-5 flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-gray-500">
            {user?.full_name} ({user?.role})
          </div>
          <button className="text-xs uppercase tracking-widest border border-gray-300 px-3 py-1 text-gray-600" onClick={logout}>
            Logout
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/dashboard" element={<DashboardRouter />} />
            <Route
              path="/jobs"
              element={
                <PermissionGuard require={PERMISSIONS.JOBS_VIEW}>
                  <JobList />
                </PermissionGuard>
              }
            />
            <Route
              path="/rules"
              element={
                <PermissionGuard require={PERMISSIONS.RULES_VIEW}>
                  <ValidationRules />
                </PermissionGuard>
              }
            />
            <Route
              path="/quarantine"
              element={
                <PermissionGuard require={PERMISSIONS.QUARANTINE_VIEW}>
                  <QuarantineSection />
                </PermissionGuard>
              }
            />
            <Route path="/governance" element={<PlaceholderPage title="Governance" description="Metadata catalog and policy management workspace." />} />
            <Route path="/compliance" element={<PlaceholderPage title="Compliance" description="Compliance posture, policy attestations, and violations." />} />
            <Route path="/reports" element={<PlaceholderPage title="Reports" description="Role-based enterprise reporting and exports." />} />
            <Route path="/lineage" element={<PlaceholderPage title="Lineage" description="Data lineage graph and impact analysis." />} />
            <Route path="/stewardship" element={<PlaceholderPage title="Stewardship" description="Steward tasks and remediation assignments." />} />
            <Route
              path="/audit"
              element={
                <PermissionGuard require={PERMISSIONS.AUDIT_VIEW}>
                  <AuditLogsPage />
                </PermissionGuard>
              }
            />
            <Route
              path="/admin"
              element={
                <PermissionGuard require={PERMISSIONS.ADMIN_VIEW}>
                  <AdminPanel />
                </PermissionGuard>
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/request-access" element={<RequestAccessPage />} />
      <Route path="/complete-invite" element={<CompleteInvitePage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
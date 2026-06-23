import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import ValidationRules from "./pages/ValidationRules";
import JobList from "./pages/JobList";
import QuarantineSection from "./components/QuarantineSection";
import DashboardRouter from "./pages/DashboardRouter";
import LoginPage from "./pages/LoginPage";
import RequestAccessPage from "./pages/RequestAccessPage";
import CompleteInvitePage from "./pages/CompleteInvitePage";
import ProfilePage from "./pages/ProfilePage";
import AdminPanel from "./pages/AdminPanel";
import AdminDashboardLayout from "./pages/admin/AdminDashboardLayout";
import AdminAccessRequestsPage from "./pages/admin/AdminAccessRequestsPage";
import DbConnectionsPage from "./pages/DbConnectionsPage";
import LineagePage from "./pages/LineagePage";
import AuditLogsPage from "./pages/AuditLogsPage";
import StewardshipPage from "./pages/StewardshipPage";
import DeveloperToolsPage from "./pages/DeveloperToolsPage";
import TicketsPage from "./pages/TicketsPage";
import ProtectedRoute from "./auth/ProtectedRoute";
import PermissionGuard from "./auth/PermissionGuard";
import { PERMISSIONS } from "./auth/permissions";
import GovernanceRoute from "./pages/GovernanceRoute";
import { Card, CardContent } from "@/components/ui/card";

function PlaceholderPage({ title, description }) {
  return (
    <Card>
      <CardContent className="p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function AppShell() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/dashboard" element={<DashboardRouter />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route
          path="/developer-tools"
          element={
            <PermissionGuard require={PERMISSIONS.API_MONITOR_VIEW}>
              <DeveloperToolsPage />
            </PermissionGuard>
          }
        />
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
        <Route
          path="/governance"
          element={
            <PermissionGuard require={PERMISSIONS.GOVERNANCE_VIEW}>
              <GovernanceRoute />
            </PermissionGuard>
          }
        />
        <Route path="/connections" element={<DbConnectionsPage />} />
        <Route
          path="/tickets"
          element={
            <PermissionGuard require={PERMISSIONS.TICKETS_VIEW}>
              <TicketsPage />
            </PermissionGuard>
          }
        />
        <Route path="/connections" element={<DbConnectionsPage />} />
        <Route
          path="/compliance"
          element={
            <PlaceholderPage
              title="Compliance"
              description="Compliance posture, policy attestations, and violations."
            />
          }
        />
        <Route
          path="/reports"
          element={
            <PlaceholderPage title="Reports" description="Role-based enterprise reporting and exports." />
          }
        />
        <Route
          path="/lineage"
          element={
            <PermissionGuard require={PERMISSIONS.LINEAGE_VIEW}>
              <LineagePage />
            </PermissionGuard>
          }
        />
        <Route
          path="/stewardship"
          element={
            <PermissionGuard require={PERMISSIONS.STEWARDSHIP_VIEW}>
              <StewardshipPage />
            </PermissionGuard>
          }
        />
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
              <AdminDashboardLayout />
            </PermissionGuard>
          }
        >
          <Route index element={<AdminPanel />} />
          <Route path="access-requests" element={<AdminAccessRequestsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppLayout>
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

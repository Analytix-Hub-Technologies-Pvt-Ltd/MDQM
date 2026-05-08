import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import ValidationRules from "./pages/ValidationRules";
import JobList from "./pages/JobList";
import QuarantineSection from "./components/QuarantineSection";
import Dashboard from "./pages/Dashboard";
import LoginPage from "./pages/LoginPage";
import RequestAccessPage from "./pages/RequestAccessPage";
import CompleteInvitePage from "./pages/CompleteInvitePage";
import AdminPanel from "./pages/AdminPanel";
import ProtectedRoute from "./auth/ProtectedRoute";
import { useAuth } from "./auth/AuthContext";

const NAV_STORAGE_KEY = "mdqm_active_tab";
const VALID_TABS = ["dashboard", "jobs", "rules", "quarantine", "admin", "account", "settings"];

function AppShell() {
  const { user, isAdmin, logout } = useAuth();
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem(NAV_STORAGE_KEY);
    return VALID_TABS.includes(saved) ? saved : "dashboard";
  });

  useEffect(() => {
    localStorage.setItem(NAV_STORAGE_KEY, activeTab);
  }, [activeTab]);

  return (
    <div className="flex h-screen bg-[#FBFBFB]">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} isAdmin={isAdmin} />

      <div className="flex-1 overflow-hidden">
        <div className="h-12 border-b border-gray-200 bg-white px-5 flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-gray-500">
            {user?.full_name} ({user?.role})
          </div>
          <button className="text-xs uppercase tracking-widest border border-gray-300 px-3 py-1 text-gray-600" onClick={logout}>
            Logout
          </button>
        </div>
        <div className={activeTab === "dashboard" || activeTab === "account" || activeTab === "settings" ? "h-full" : "hidden"}>
          <Dashboard />
        </div>
        <div className={activeTab === "jobs" && user?.role !== "viewer" ? "h-full" : "hidden"}>
          <JobList />
        </div>
        <div className={activeTab === "rules" && user?.role !== "viewer" ? "h-full" : "hidden"}>
          <ValidationRules />
        </div>
        <div className={activeTab === "quarantine" && user?.role !== "viewer" ? "h-full" : "hidden"}>
          <QuarantineSection />
        </div>
        <div className={activeTab === "admin" && isAdmin ? "h-full" : "hidden"}>
          <AdminPanel />
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
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
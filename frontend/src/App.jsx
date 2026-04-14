import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import ValidationRules from "./pages/ValidationRules";
import JobList from "./pages/JobList";
import QuarantineSection from "./components/QuarantineSection";
import Dashboard from "./pages/Dashboard";

const NAV_STORAGE_KEY = "mdqm_active_tab";
const VALID_TABS = ["dashboard", "jobs", "rules", "quarantine", "account", "settings"];

function App() {
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem(NAV_STORAGE_KEY);
    return VALID_TABS.includes(saved) ? saved : "dashboard";
  });

  useEffect(() => {
    localStorage.setItem(NAV_STORAGE_KEY, activeTab);
  }, [activeTab]);

  return (
    <div className="flex h-screen bg-[#FBFBFB]">
      {/* 1. Left Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* 2. Main Content Area */}
      <div className="flex-1 overflow-hidden">
        <div className={activeTab === "dashboard" || activeTab === "account" || activeTab === "settings" ? "h-full" : "hidden"}>
          <Dashboard />
        </div>
        <div className={activeTab === "jobs" ? "h-full" : "hidden"}>
          <JobList />
        </div>
        <div className={activeTab === "rules" ? "h-full" : "hidden"}>
          <ValidationRules />
        </div>
        <div className={activeTab === "quarantine" ? "h-full" : "hidden"}>
          <QuarantineSection />
        </div>
      </div>
    </div>
  );
}

export default App;
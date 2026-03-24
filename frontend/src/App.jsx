import { useState } from "react";
import Sidebar from "./components/Sidebar";
import ValidationRules from "./pages/ValidationRules";
import JobList from "./pages/JobList";
import QuarantineSection from "./components/QuarantineSection";
import Dashboard from "./pages/Dashboard";

function App() {
  const [activeTab, setActiveTab] = useState("rules"); // Defaulting to Rules page as requested

  return (
    <div className="flex h-screen bg-[#FBFBFB]">
      {/* 1. Left Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* 2. Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "rules" && <ValidationRules />}
        
        {/* Placeholders for other pages */}
        {activeTab === "dashboard" && <Dashboard/>}
        {activeTab === "jobs" && <JobList />}
        {activeTab === "quarantine" && <QuarantineSection />}
      </div>
    </div>
  );
}

export default App;
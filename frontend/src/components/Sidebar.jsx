import React, { useState } from "react";
import {
  LayoutDashboard,
  Workflow,
  ShieldCheck,
  DatabaseZap,
  User,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const Sidebar = ({ activeTab, setActiveTab, isAdmin }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const mainItems = [
    {
      name: "Dashboard",
      id: "dashboard",
      icon: <LayoutDashboard size={18} strokeWidth={1} />,
    },
    {
      name: "Job List",
      id: "jobs",
      icon: <Workflow size={18} strokeWidth={1} />,
    },
    {
      name: "Validation Rules",
      id: "rules",
      icon: <ShieldCheck size={18} strokeWidth={1} />,
    },
    {
      name: "Quarantine Zone",
      id: "quarantine",
      icon: <DatabaseZap size={18} strokeWidth={1} />,
    },
  ];

  const systemItems = [
    ...(isAdmin
      ? [
          {
            name: "Admin",
            id: "admin",
            icon: <ShieldCheck size={18} strokeWidth={1} />,
          },
        ]
      : []),
    {
      name: "Account",
      id: "account",
      icon: <User size={18} strokeWidth={1} />,
    },
    {
      name: "Settings",
      id: "settings",
      icon: <Settings size={18} strokeWidth={1} />,
    },
  ];

  return (
    <aside
      className={`${isCollapsed ? "w-14" : "w-64"} bg-[#FBFBFB] border-r border-[#A1A3AF] border-opacity-20 transition-all duration-300 flex flex-col relative h-screen`}
    >
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-10 bg-[#23243B] text-[#FBFBFB] hover:text-[#23243B] p-1 border border-[#23243B] z-50 shadow-none hover:bg-[#e5e9fd]"
      >
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      <div className="p-4 h-24 flex items-center border-b border-[#A1A3AF] border-opacity-10 overflow-hidden">
        <h1
          className={`text-[#23243B] tracking-[0.2em] text-[12px] font-normal text-center uppercase transition-opacity ${isCollapsed ? "opacity-0" : "opacity-100"}`}
        >
          Master Data Quality Management System
        </h1>
      </div>

      {/* Update your nav tag like this */}
      <nav className="flex flex-col flex-1 h-full">
        {/* TOP GROUP: Main Work Navigation */}
        <div className="flex-none">
          {mainItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center p-4 transition-all border-b border-[#A1A3AF] border-opacity-5 ${
                activeTab === item.id
                  ? "bg-[#23243B] text-[#FBFBFB]"
                  : "text-[#23243B] hover:bg-[#e5e9fd] hover:bg-opacity-5"
              }`}
            >
              <span>{item.icon}</span>
              {!isCollapsed && (
                <span className="ml-6 text-[12px] tracking-widest uppercase">
                  {item.name}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* --- THE SPACER --- */}
        <div className="flex-1" />

        {/* BOTTOM GROUP: Account & Settings */}
        <div className="flex-none">
          {systemItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center border-t border-[#A1A3AF] p-4 transition-all ${
                activeTab === item.id
                  ? "bg-[#23243B] text-[#FBFBFB]"
                  : "text-[#23243B] hover:bg-[#e5e9fd] hover:bg-opacity-5"
              }`}
            >
              <span>{item.icon}</span>
              {!isCollapsed && (
                <span className="ml-6 text-[12px] tracking-widest uppercase">
                  {item.name}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;

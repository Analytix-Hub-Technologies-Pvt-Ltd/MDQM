import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Inbox } from "lucide-react";

const links = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/access-requests", label: "Access requests", icon: Inbox, end: false },
];

export default function AdminDashboardLayout() {
  return (
    <div className="flex min-h-full flex-1 bg-[#FBFBFB] text-[#23243B]">
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-white px-3 py-6">
        <div className="mb-4 px-2 text-[10px] uppercase tracking-[0.2em] text-gray-500">Admin</div>
        <nav className="flex flex-col gap-1">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors ${
                  isActive ? "bg-[#23243B] text-white" : "text-gray-700 hover:bg-gray-100"
                }`
              }
            >
              <Icon size={18} strokeWidth={1.5} />
              <span className="uppercase tracking-wider text-[11px]">{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import { ChevronDown, User, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ProfileDropdown() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-2 max-w-[160px]"
        title={user?.full_name}
      >
        <User className="h-4 w-4 shrink-0" />
        <span className="hidden truncate sm:inline">{user?.username || "Profile"}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
      </Button>

      {isOpen ? (
        <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg z-50">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">{user?.full_name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            <p className="mt-1 text-xs capitalize text-muted-foreground">Role: {user?.role}</p>
          </div>
          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                navigate("/profile");
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-muted transition-colors"
            >
              <User className="h-4 w-4" />
              Edit profile
            </button>
          </div>
          <div className="border-t border-border py-1">
            <button
              type="button"
              onClick={() => {
                logout();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

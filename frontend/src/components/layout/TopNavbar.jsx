import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/auth/AuthContext";
import { normalizeRole, ROLES } from "@/auth/rolePermissions";
import AlertsBell from "@/components/AlertsBell";
import ProfileDropdown from "@/components/ProfileDropdown";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { Badge } from "@/components/ui/badge";

export default function TopNavbar({ onMenuClick }) {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const bellPreset =
    role === ROLES.BUSINESS_USER ? "business" : role === ROLES.DATA_OWNER ? "owner" : null;

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-md md:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted lg:hidden"
        aria-label="Open menu"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="relative hidden min-w-0 flex-1 max-w-md md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 pl-9"
          placeholder="Search datasets, jobs, rules…"
          aria-label="Search"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {user?.role ? (
          <Badge variant="outline" className="hidden sm:inline-flex capitalize">
            {user.role.replace(/_/g, " ")}
          </Badge>
        ) : null}
        <ThemeToggle />
        {bellPreset ? <AlertsBell preset={bellPreset} /> : null}
        <ProfileDropdown />
      </div>
    </header>
  );
}

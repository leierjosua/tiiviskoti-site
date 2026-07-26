import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  CalendarDays,
  Settings,
  LogOut,
  Menu,
  X,
  AlignJustify,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/context/UserRoleContext";
import { useState, useEffect, useRef } from "react";

const navItems = [
  { to: "/tyontekija", label: "Etusivu", icon: Home },
  { to: "/tyontekija/kalenteri", label: "Kalenteri", icon: CalendarDays },
  { to: "/tyontekija/asetukset", label: "Asetukset", icon: Settings },
];

type ViewOption = { key: string; label: string; path: string };

const ALL_VIEWS: ViewOption[] = [
  { key: "admin", label: "Admin", path: "/" },
  { key: "seller", label: "Myynti", path: "/myyja" },
  { key: "installer", label: "Asennus", path: "/tyontekija" },
];

function ViewSwitcher() {
  const { employee } = useUserRole();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const availableViews = ALL_VIEWS.filter((v) => {
    if (!employee) return v.key === "installer";
    return employee.roles.includes(v.key as "admin" | "seller" | "installer");
  });

  const currentLabel = "Asennus";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [dropdownOpen]);

  if (availableViews.length <= 1) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 rounded-lg border border-white/15 hover:border-white/25 bg-white/5 hover:bg-white/10 transition-all px-3 py-1.5"
      >
        <span className="text-[11px] font-bold tracking-widest text-white/80 uppercase">
          {currentLabel}
        </span>
        <AlignJustify className="w-3.5 h-3.5 text-white/50" />
      </button>

      {dropdownOpen && (
        <div className="absolute left-0 top-full mt-2 z-50 min-w-[180px] rounded-xl border border-white/15 bg-white/10 backdrop-blur-xl shadow-2xl shadow-black/30 overflow-hidden">
          <p className="px-4 pt-3 pb-2 text-[11px] font-bold tracking-widest text-white/40 uppercase">
            Näkymä
          </p>
          <div className="pb-2">
            {availableViews.map((view) => (
              <button
                key={view.key}
                onClick={() => {
                  setDropdownOpen(false);
                  navigate(view.path);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-all ${
                  view.key === "installer"
                    ? "text-white bg-white/5"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function InstallerSidebar() {
  const { logout } = useAuth();
  const { employee } = useUserRole();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const employeeName = employee
    ? `${employee.first_name} ${employee.last_name}`
    : "";

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-brand flex items-center px-4 gap-3 h-[calc(2.75rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]">
        <button
          onClick={() => setOpen(true)}
          className="p-2 -ml-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <img src="/logo-white.svg" alt="Lasikiilto" className="h-5" />
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-[min(18rem,85vw)] bg-brand text-white flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 pb-3 flex items-center justify-between" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-3">
            <img src="/logo-white.svg" alt="Lasikiilto" className="h-7" />
            <ViewSwitcher />
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="mx-4 mb-3 h-px bg-white/10" />
        <nav className="flex-1 px-3 overflow-y-auto">
          <div className="space-y-0.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/tyontekija"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] ${
                    isActive
                      ? "bg-accent text-white shadow-sm shadow-accent/20"
                      : "text-white/50 hover:text-white hover:bg-white/5"
                  }`
                }
              >
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="p-3 border-t border-white/10 space-y-0.5">
          {employeeName && (
            <p className="px-3 py-1.5 text-xs text-white/30 truncate">
              {employeeName}
            </p>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-white hover:bg-white/5 transition-all w-full min-h-[44px]"
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            Kirjaudu ulos
          </button>
        </div>
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex bg-brand text-white flex-col h-screen sticky top-0 w-64">
        <div className="p-4 pb-3 flex items-center gap-3">
          <img src="/logo-white.svg" alt="Lasikiilto" className="h-7" />
          <div className="ml-auto">
            <ViewSwitcher />
          </div>
        </div>

        <div className="mx-4 mb-3 h-px bg-white/10" />

        <nav className="flex-1 px-3 overflow-y-auto">
          <div className="space-y-0.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/tyontekija"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? "bg-accent text-white shadow-sm shadow-accent/20"
                      : "text-white/50 hover:text-white hover:bg-white/5"
                  }`
                }
              >
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="p-3 border-t border-white/10 space-y-0.5">
          {employeeName && (
            <p className="px-3 py-1.5 text-xs text-white/30 truncate">
              {employeeName}
            </p>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-white hover:bg-white/5 transition-all w-full"
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            Kirjaudu ulos
          </button>
        </div>
      </aside>
    </>
  );
}

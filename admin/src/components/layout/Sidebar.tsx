import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  ClipboardList,
  Settings,
  LogOut,
  HardHat,
  Package,
  Ticket,
  Wallet,
  MessageSquare,
  MessageSquareText,
  BarChart3,
  Menu,
  TrendingUp,
  FolderKanban,
  ListChecks,
  Phone,
  Inbox,
  FileText,
  SlidersHorizontal,
  Headphones,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlignJustify,
  Mail,
  Megaphone,
  Smartphone,
  Link2,
  Receipt,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/context/UserRoleContext";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// ─── Data ────────────────────────────────────────────────────────────────────

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  subItems?: NavItem[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "YLEISTÄ",
    items: [
      { to: "/", label: "Yhteenveto", icon: LayoutDashboard },
      {
        to: "/analytiikka",
        label: "Analytiikka",
        icon: BarChart3,
        subItems: [
          { to: "/analytiikka/sivusto", label: "Sivusto", icon: Smartphone },
          { to: "/analytiikka/markkinointi", label: "Markkinointi", icon: Megaphone },
          { to: "/kulut", label: "Kulut", icon: Receipt },
        ],
      },
      {
        to: "/varaukset",
        label: "Varaukset",
        icon: ClipboardList,
      },
      { to: "/kalenteri", label: "Kalenteri", icon: CalendarDays },
      {
        to: "/projektit",
        label: "Projektit",
        icon: FolderKanban,
        subItems: [
          { to: "/tehtavat", label: "Tehtävät", icon: ListChecks },
        ],
      },
      {
        to: "/asiakaspalvelu",
        label: "Asiakaspalvelu",
        icon: Headphones,
        subItems: [
          { to: "/lomakkeet", label: "Lomakkeet", icon: MessageSquareText },
          { to: "/asiakaspalvelu/raportointi", label: "Raportointi", icon: BarChart3 },
          { to: "/asiakaspalvelu/asetukset", label: "Asetukset", icon: SlidersHorizontal },
        ],
      },
      {
        to: "/myynti",
        label: "Myynti",
        icon: TrendingUp,
        subItems: [
          { to: "/myynti/liidit", label: "Liidien hallinta", icon: Phone },
          { to: "/myynti/inbound", label: "Inbound-hallinta", icon: Inbox },
          { to: "/myynti/tarjousmallit", label: "Tarjoukset", icon: FileText },
          { to: "/myynti/viitekoodit", label: "Viitekoodit", icon: Link2 },
          { to: "/myynti/asetukset", label: "Asetukset", icon: SlidersHorizontal },
        ],
      },
    ],
  },
  {
    label: "HALLINTA",
    items: [
      { to: "/asiakkaat", label: "Asiakkaat", icon: Users },
      {
        to: "/tyontekijat",
        label: "Työntekijät",
        icon: HardHat,
        subItems: [
          { to: "/tiimit", label: "Tiimit", icon: Users },
          { to: "/palkat", label: "Palkat", icon: Wallet },
        ],
      },
      {
        to: "/palvelut",
        label: "Palvelut",
        icon: Package,
        subItems: [
          { to: "/lisapalvelut", label: "Lisäpalvelut", icon: Sparkles },
        ],
      },
    ],
  },
  {
    label: "MUU",
    items: [
      { to: "/alennuskoodit", label: "Alennuskoodit", icon: Ticket },
      {
        to: "/palautteet",
        label: "Palautteet",
        icon: MessageSquare,
        subItems: [
          { to: "/viestit", label: "Viestit (SMS)", icon: Smartphone },
        ],
      },
      { to: "/sahkopostipohjat", label: "Sähköpostipohjat", icon: Mail },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.subItems) {
    return (
      pathname === item.to ||
      pathname.startsWith(item.to + "/") ||
      item.subItems.some((s) => pathname === s.to || pathname.startsWith(s.to + "/"))
    );
  }
  return item.to === "/" ? pathname === "/" : pathname === item.to || pathname.startsWith(item.to + "/");
}

/** Returns which collapsible groups should be open for a given pathname. */
function computeAutoOpen(pathname: string): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.subItems && isItemActive(item, pathname)) {
        result[item.to] = true;
      }
    }
  }
  return result;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Collapsed sidebar: shows an icon button that reveals a flyout panel on hover.
 * Uses a React portal so the flyout escapes the sidebar's overflow:hidden clip.
 */
function CollapsedFlyout({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate: (to: string) => void;
}) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [flyoutTop, setFlyoutTop] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isActive = isItemActive(item, location.pathname);

  function handleMouseEnter() {
    if (triggerRef.current) {
      setFlyoutTop(triggerRef.current.getBoundingClientRect().top);
    }
    setOpen(true);
  }

  return (
    <div onMouseLeave={() => setOpen(false)}>
      <button
        ref={triggerRef}
        onClick={() => onNavigate(item.to)}
        onMouseEnter={handleMouseEnter}
        title={item.label}
        className={`w-full flex items-center justify-center px-2.5 py-2 rounded-lg text-xs font-medium transition-all min-h-[36px] ${
          isActive
            ? "bg-accent text-white shadow-sm shadow-accent/20"
            : "text-white/50 hover:text-white hover:bg-white/5"
        }`}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
      </button>

      {open &&
        createPortal(
          <div
            style={{ position: "fixed", top: flyoutTop, left: 0, zIndex: 200 }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            className="flex"
          >
            {/* Invisible bridge from sidebar icon to flyout panel */}
            <div style={{ width: 60, pointerEvents: "none" }} className="flex-shrink-0" />
            <div className="bg-brand border border-white/15 rounded-xl shadow-2xl shadow-black/40 min-w-[192px] overflow-hidden py-1">

            {/* Parent link */}
            <button
              onClick={() => { onNavigate(item.to); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs font-semibold text-white flex items-center gap-2.5 hover:bg-white/8 transition-colors"
            >
              <item.icon className="w-4 h-4 flex-shrink-0 text-white/60" />
              {item.label}
            </button>
            <div className="mx-2 my-0.5 h-px bg-white/10" />
            {/* Sub-items */}
            {item.subItems!.map((sub) => (
              <NavLink
                key={sub.to}
                to={sub.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                    isActive
                      ? "text-white bg-white/10"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`
                }
              >
                <sub.icon className="w-3.5 h-3.5 flex-shrink-0" />
                {sub.label}
              </NavLink>
            ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/** Expanded sidebar: collapsible group button + animated sub-item list. */
function ExpandableNavItem({
  item,
  isOpen,
  onToggle,
}: {
  item: NavItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = isItemActive(item, location.pathname);

  return (
    <div>
      <button
        onClick={() => navigate(item.to)}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all min-h-[36px] text-left cursor-pointer ${
          isActive
            ? "bg-accent text-white shadow-sm shadow-accent/20"
            : "text-white/50 hover:text-white hover:bg-white/5"
        }`}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 overflow-hidden whitespace-nowrap">{item.label}</span>
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggle(); }}
          className="p-0.5 rounded hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${
              isOpen ? "" : "-rotate-90"
            }`}
          />
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? "max-h-64 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
        }`}
      >
        <div className="space-y-px pl-3 pt-0.5">
          {item.subItems!.map((sub) => (
            <NavLink
              key={sub.to}
              to={sub.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all min-h-[36px] ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:text-white hover:bg-white/5"
                }`
              }
            >
              <sub.icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="overflow-hidden whitespace-nowrap">{sub.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── View switcher ────────────────────────────────────────────────────────────

type ViewOption = { key: string; label: string; path: string };

const ALL_VIEWS: ViewOption[] = [
  { key: "admin", label: "Admin", path: "/" },
  { key: "seller", label: "Myynti", path: "/myyja" },
  { key: "installer", label: "Asennus", path: "/tyontekija" },
];

function ViewSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { employee } = useUserRole();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const availableViews = ALL_VIEWS.filter((v) => {
    if (!employee) return v.key === "admin";
    return employee.roles.includes(v.key as "admin" | "seller" | "installer");
  });

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  if (availableViews.length <= 1) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className={`flex items-center gap-1.5 rounded-md border border-white/15 hover:border-white/25 bg-white/5 hover:bg-white/10 transition-all ${
          collapsed ? "p-1.5" : "px-2.5 py-1"
        }`}
      >
        {!collapsed && (
          <span className="text-[10px] font-bold tracking-widest text-white/80 uppercase">Admin</span>
        )}
        <AlignJustify className="w-3 h-3 text-white/50" />
      </button>

      {dropdownOpen && (
        <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[160px] rounded-lg border border-white/15 bg-white/10 backdrop-blur-xl shadow-2xl shadow-black/30 overflow-hidden">
          <p className="px-3 pt-2.5 pb-1.5 text-[10px] font-bold tracking-widest text-white/40 uppercase">
            Näkymä
          </p>
          <div className="pb-1.5">
            {availableViews.map((view) => (
              <button
                key={view.key}
                onClick={() => { setDropdownOpen(false); navigate(view.path); }}
                className={`w-full text-left px-3 py-2 text-xs font-medium transition-all ${
                  view.key === "admin"
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

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; }
    catch { return false; }
  });

  // Initialize with groups already open for the current page — no flicker on refresh
  const [openCollapsibles, setOpenCollapsibles] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("sidebar-collapsibles");
      const saved: Record<string, boolean> = stored ? JSON.parse(stored) : {};
      return { ...saved, ...computeAutoOpen(window.location.pathname) };
    } catch {
      return computeAutoOpen(window.location.pathname);
    }
  });

  // Close mobile drawer on navigation
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Auto-open parent group for current page, close groups that aren't active
  useEffect(() => {
    const auto = computeAutoOpen(location.pathname);
    setOpenCollapsibles((prev) => {
      const next: Record<string, boolean> = {};
      // Keep open only groups that are active for the current path
      for (const key of Object.keys(prev)) {
        next[key] = !!auto[key];
      }
      // Also open any groups that should be open for this path
      for (const key of Object.keys(auto)) {
        next[key] = true;
      }
      try { localStorage.setItem("sidebar-collapsibles", JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }, [location.pathname]);

  function handleCollapsibleClick(to: string) {
    setOpenCollapsibles((prev) => {
      const next = { ...prev, [to]: !prev[to] };
      try { localStorage.setItem("sidebar-collapsibles", JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("sidebar-collapsed", String(next)); } catch { /* */ }
  }

  // ── Shared renderers ──────────────────────────────────────────────────────

  /** Renders nav items for mobile and expanded desktop. */
  function renderItems(items: NavItem[]) {
    return items.map((item) =>
      item.subItems ? (
        <ExpandableNavItem
          key={item.to}
          item={item}
          isOpen={openCollapsibles[item.to] ?? false}
          onToggle={() => handleCollapsibleClick(item.to)}
        />
      ) : (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all min-h-[36px] ${
              isActive
                ? "bg-accent text-white shadow-sm shadow-accent/20"
                : "text-white/50 hover:text-white hover:bg-white/5"
            }`
          }
        >
          <item.icon className="w-4 h-4 flex-shrink-0" />
          {item.label}
        </NavLink>
      )
    );
  }

  /** Renders nav items for collapsed desktop (icons + flyouts). */
  function renderCollapsedItems(items: NavItem[]) {
    return items.map((item) =>
      item.subItems ? (
        <CollapsedFlyout key={item.to} item={item} onNavigate={navigate} />
      ) : (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          title={item.label}
          className={({ isActive }) =>
            `flex items-center justify-center px-2.5 py-2 rounded-lg text-xs font-medium transition-all min-h-[36px] ${
              isActive
                ? "bg-accent text-white shadow-sm shadow-accent/20"
                : "text-white/50 hover:text-white hover:bg-white/5"
            }`
          }
        >
          <item.icon className="w-4 h-4 flex-shrink-0" />
        </NavLink>
      )
    );
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Mobile top bar ──────────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-brand flex items-center px-4 gap-3 h-[calc(2.75rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <img src="/logo-white.svg" alt="Lasikiilto" className="h-5 w-auto" />
      </div>

      {/* ── Mobile overlay ───────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile drawer ────────────────────────────────────────────────── */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-[min(16rem,85vw)] bg-brand text-white flex flex-col transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-4 py-3 flex items-center justify-between" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2.5">
            <img src="/logo-white.svg" alt="Lasikiilto" className="h-6 w-auto" />
            <ViewSwitcher />
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mx-3 mb-2 h-px bg-white/10" />

        <nav className="flex-1 px-2 overflow-y-auto">
          {navGroups.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && <div className="mx-1 my-2 h-px bg-white/10" />}
              <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold tracking-widest text-white/25">
                {group.label}
              </p>
              <div className="space-y-px">{renderItems(group.items)}</div>
            </div>
          ))}
        </nav>

        <div className="p-2 border-t border-white/10 space-y-px">
          <NavLink
            to="/asetukset"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-xs font-medium transition-all min-h-[44px] ${
                isActive
                  ? "bg-accent text-white shadow-sm shadow-accent/20"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              }`
            }
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            Asetukset
          </NavLink>
          <button
            onClick={logout}
            className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-xs font-medium text-white/40 hover:text-white hover:bg-white/5 transition-all w-full min-h-[44px]"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            Kirjaudu ulos
          </button>
        </div>
      </aside>

      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside
        className={`hidden md:flex bg-brand text-white flex-col h-screen sticky top-0 overflow-hidden transition-all duration-200 ${
          collapsed ? "w-[52px]" : "w-56"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center gap-1.5 transition-all duration-200 ${
            collapsed ? "flex-col p-2 pb-1.5" : "px-3 py-2.5"
          }`}
        >
          {collapsed && (
            <img
              src="/favicon-white.svg"
              alt="Lasikiilto"
              className="w-6 h-6 flex-shrink-0"
            />
          )}
          <div
            className={`overflow-hidden transition-all duration-200 ${
              collapsed ? "w-0 h-0 opacity-0" : "flex-1 min-w-0 opacity-100"
            }`}
          >
            <img src="/logo-white.svg" alt="Lasikiilto" className="h-6 w-auto max-w-full object-contain" />
          </div>

          {!collapsed ? (
            <div className="flex items-center gap-1 ml-auto">
              <ViewSwitcher />
              <button
                onClick={toggleCollapsed}
                className="p-1 rounded-md text-white/30 hover:text-white/70 hover:bg-white/10 transition-all flex-shrink-0"
                title="Pienennä"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={toggleCollapsed}
              className="p-1 rounded-md text-white/30 hover:text-white/70 hover:bg-white/10 transition-all mt-0.5"
              title="Laajenna"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div
          className={`${collapsed ? "mx-1.5" : "mx-3"} mb-2 h-px bg-white/10 transition-all duration-200`}
        />

        <nav
          className={`flex-1 ${collapsed ? "px-1.5" : "px-2"} overflow-y-auto transition-all duration-200`}
        >
          {navGroups.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && <div className="mx-1 my-2 h-px bg-white/10" />}
              <p
                className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${
                  collapsed
                    ? "h-0 opacity-0 py-0"
                    : "px-2.5 pt-1 pb-1.5 text-[10px] font-semibold tracking-widest text-white/25"
                }`}
              >
                {group.label}
              </p>
              <div className="space-y-px">
                {collapsed
                  ? renderCollapsedItems(group.items)
                  : renderItems(group.items)}
              </div>
            </div>
          ))}
        </nav>

        {/* Settings & logout */}
        <div className="p-2 border-t border-white/10 space-y-px">
          <NavLink
            to="/asetukset"
            title={collapsed ? "Asetukset" : undefined}
            className={({ isActive }) =>
              `flex items-center ${collapsed ? "justify-center" : "gap-2.5"} px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? "bg-accent text-white shadow-sm shadow-accent/20"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              }`
            }
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            <span
              className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${
                collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              }`}
            >
              Asetukset
            </span>
          </NavLink>
          <button
            onClick={logout}
            title={collapsed ? "Kirjaudu ulos" : undefined}
            className={`flex items-center ${collapsed ? "justify-center" : "gap-2.5"} px-2.5 py-1.5 rounded-lg text-xs font-medium text-white/40 hover:text-white hover:bg-white/5 transition-all w-full`}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span
              className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${
                collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              }`}
            >
              Kirjaudu ulos
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}

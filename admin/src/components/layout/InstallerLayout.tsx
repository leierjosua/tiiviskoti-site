import { Outlet, NavLink } from "react-router-dom";
import { InstallerSidebar } from "./InstallerSidebar";
import { Home, CalendarDays, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export function InstallerLayout() {
  const { user } = useAuth();
  usePushNotifications(user?.id);
  return (
    <div className="flex h-[100dvh] bg-surface-alt overflow-hidden">
      <InstallerSidebar />
      <main className="flex-1 min-w-0 p-4 pb-24 sm:p-6 sm:pb-6 md:p-8 md:pt-8 overflow-x-hidden overflow-y-auto overscroll-none" style={{ paddingTop: 'calc(2.75rem + env(safe-area-inset-top) + 0.75rem)' }}>
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border flex items-center justify-around pb-[env(safe-area-inset-bottom,0px)]" style={{ minHeight: '4rem' }}>
        <NavLink to="/tyontekija/kalenteri" className={({ isActive }) =>
          `flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[48px] px-4 py-2 transition-colors ${isActive ? "text-accent-dark" : "text-text-muted"}`
        }>
          <CalendarDays className="w-5 h-5" />
          <span className="text-[10px] font-medium">Kalenteri</span>
        </NavLink>
        <NavLink to="/tyontekija" end className={({ isActive }) =>
          `flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[48px] px-4 py-2 transition-colors ${isActive ? "text-accent-dark" : "text-text-muted"}`
        }>
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-medium">Etusivu</span>
        </NavLink>
        <NavLink to="/tyontekija/asetukset" className={({ isActive }) =>
          `flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[48px] px-4 py-2 transition-colors ${isActive ? "text-accent-dark" : "text-text-muted"}`
        }>
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-medium">Asetukset</span>
        </NavLink>
      </nav>
    </div>
  );
}

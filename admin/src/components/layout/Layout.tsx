import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export function Layout() {
  const { user } = useAuth();
  usePushNotifications(user?.id);
  return (
    <div className="flex h-[100dvh] bg-surface-alt overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-8 md:pt-8 overflow-x-hidden overflow-y-auto overscroll-none" style={{ paddingTop: 'calc(2.75rem + env(safe-area-inset-top) + 0.75rem)' }}>
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

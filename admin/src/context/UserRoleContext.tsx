import { createContext, useContext } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEmployeeByUserId } from "@/hooks/useEmployees";
import type { Employee } from "@/lib/types";

type UserRole = "admin" | "installer" | "seller";

interface UserRoleValue {
  /** Detected role based on employee record */
  role: UserRole;
  /** Which view is currently active (based on URL) */
  activeView: UserRole;
  /** The user's employee record if one exists */
  employee: Employee | null;
  /** True if user can switch between views */
  canSwitch: boolean;
  loading: boolean;
}

const UserRoleContext = createContext<UserRoleValue>({
  role: "admin",
  activeView: "admin",
  employee: null,
  canSwitch: false,
  loading: true,
});

export function UserRoleProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { data: employee, isLoading: empLoading } = useEmployeeByUserId(user?.id);
  const location = useLocation();

  const loading = authLoading || (!!user && empLoading);

  const role: UserRole = employee?.roles?.includes("admin")
    ? "admin"
    : employee?.roles?.includes("seller")
      ? "seller"
      : employee?.roles?.includes("installer")
        ? "installer"
        : "admin";

  const activeView: UserRole = location.pathname.startsWith("/myyja")
    ? "seller"
    : location.pathname.startsWith("/tyontekija")
      ? "installer"
      : "admin";

  // Can switch if user has an employee record (regardless of role)
  const canSwitch = !!employee;

  return (
    <UserRoleContext.Provider value={{ role, activeView, employee: employee ?? null, canSwitch, loading }}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  return useContext(UserRoleContext);
}

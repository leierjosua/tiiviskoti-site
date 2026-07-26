import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/context/UserRoleContext";
import { AccountDisabled } from "./AccountDisabled";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { employee, loading: roleLoading } = useUserRole();

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If user has no employee record, deny access
  if (!employee) {
    return <Navigate to="/login" replace />;
  }

  // Blocked accounts are denied access entirely
  if (employee.active === false) {
    return <AccountDisabled />;
  }

  // If user has an employee record, they need admin role to access admin panel
  if (employee && !employee.roles?.includes("admin")) {
    // Redirect to the appropriate portal based on role
    if (employee.roles?.includes("seller")) {
      return <Navigate to="/myyja" replace />;
    }
    return <Navigate to="/tyontekija" replace />;
  }

  return <>{children}</>;
}

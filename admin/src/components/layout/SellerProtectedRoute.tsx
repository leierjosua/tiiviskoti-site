import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/context/UserRoleContext";
import { AccountDisabled } from "./AccountDisabled";

export function SellerProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { employee, loading: roleLoading } = useUserRole();

  if (authLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/myyja/login" replace />;
  }

  // Must have an employee record with seller or admin role
  if (!employee || !(employee.roles?.includes("seller") || employee.roles?.includes("admin"))) {
    return <Navigate to="/" replace />;
  }

  // Blocked accounts are denied access entirely
  if (employee.active === false) {
    return <AccountDisabled />;
  }

  return <>{children}</>;
}

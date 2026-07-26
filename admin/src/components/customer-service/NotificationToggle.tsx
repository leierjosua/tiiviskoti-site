import { useEffect, useState, useCallback } from "react";
import { Bell, BellOff } from "lucide-react";
import { useUserRole } from "@/context/UserRoleContext";
import {
  csNotificationsEnabled,
  setCsNotificationsEnabled,
  requestCsNotificationPermission,
} from "@/hooks/customer-service/useNewTicketNotifications";

// Small toggle button for desktop notifications on new CS tickets.
// Three visible states: permission needed, on, off.
export function NotificationToggle() {
  const { employee } = useUserRole();
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );

  useEffect(() => {
    if (!employee?.id) return;
    setEnabled(csNotificationsEnabled(employee.id));
  }, [employee?.id, permission]);

  const onClick = useCallback(async () => {
    if (!employee?.id) return;
    if (permission === "unsupported") return;
    if (permission !== "granted") {
      const next = await requestCsNotificationPermission();
      setPermission(next);
      if (next === "granted") {
        setCsNotificationsEnabled(employee.id, true);
        setEnabled(true);
      }
      return;
    }
    // Already granted — toggle the per-agent preference
    const next = !enabled;
    setCsNotificationsEnabled(employee.id, next);
    setEnabled(next);
  }, [employee?.id, permission, enabled]);

  if (permission === "unsupported") return null;

  const title =
    permission !== "granted"
      ? "Ota selainilmoitukset käyttöön"
      : enabled
      ? "Ilmoitukset päällä — klikkaa poistaaksesi käytöstä"
      : "Ilmoitukset pois päältä — klikkaa ottaaksesi käyttöön";

  const Icon = permission === "granted" && enabled ? Bell : BellOff;
  const colorClass =
    permission === "granted" && enabled
      ? "text-accent"
      : "text-text-tertiary hover:text-text-primary";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-2 rounded hover:bg-accent/10 transition-colors ${colorClass}`}
      aria-label={title}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

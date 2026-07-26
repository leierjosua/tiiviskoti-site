import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useUserRole } from "@/context/UserRoleContext";

// Fires a browser desktop notification when a new ticket lands that is
// relevant to the current agent (either unassigned in the shared pool or
// explicitly assigned to them). Uses polling (30s) rather than Realtime
// because the rest of the CS hooks already poll at this cadence and it
// avoids adding a websocket subscription for a single signal.
//
// Opt-in: notifications only fire if the user has granted Notification
// permission AND not disabled the per-agent preference in localStorage.

const POLL_INTERVAL_MS = 30_000;
const PREF_KEY_PREFIX = "cs:notifications-enabled:";

type NewTicketRow = {
  id: string;
  ticket_number: number;
  subject: string | null;
  customer_name: string | null;
  customer_email: string | null;
  assigned_agent_id: string | null;
  created_at: string;
};

export function csNotificationsEnabled(employeeId: string | undefined): boolean {
  if (!employeeId) return false;
  if (typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") return false;
  const stored = localStorage.getItem(PREF_KEY_PREFIX + employeeId);
  return stored !== "false";
}

export function setCsNotificationsEnabled(
  employeeId: string,
  enabled: boolean
) {
  localStorage.setItem(PREF_KEY_PREFIX + employeeId, enabled ? "true" : "false");
}

export function useNewTicketNotifications() {
  const { employee } = useUserRole();
  // Baseline: highest created_at seen. Tickets older than this never notify.
  // Starts at "now" on first mount so existing tickets don't all fire at once.
  const baselineRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!employee?.id) return;
    if (typeof Notification === "undefined") return;

    // Establish baseline synchronously so the first poll doesn't notify
    // about tickets that existed before the page loaded.
    if (baselineRef.current === null) {
      baselineRef.current = new Date().toISOString();
    }

    let cancelled = false;

    async function poll() {
      if (!employee?.id) return;
      if (!csNotificationsEnabled(employee.id)) return;
      const since = baselineRef.current!;
      const { data, error } = await supabase
        .from("cs_tickets")
        .select(
          "id, ticket_number, subject, customer_name, customer_email, assigned_agent_id, created_at"
        )
        .eq("status", "new")
        .eq("is_merged", false)
        .gte("created_at", since)
        .or(`assigned_agent_id.is.null,assigned_agent_id.eq.${employee.id}`)
        .order("created_at", { ascending: true })
        .limit(20);

      if (cancelled || error || !data) return;

      for (const row of data as NewTicketRow[]) {
        if (seenIdsRef.current.has(row.id)) continue;
        seenIdsRef.current.add(row.id);

        const who = row.customer_name || row.customer_email || "Uusi asiakas";
        const body = row.subject || "Uusi asiakaspalvelupyyntö";
        const notif = new Notification(`Lasikiilto: #${row.ticket_number} — ${who}`, {
          body,
          tag: `cs-ticket-${row.id}`,
          icon: "/favicon.ico",
        });
        notif.onclick = () => {
          window.focus();
          window.location.href = `/asiakaspalvelu/${row.ticket_number}`;
          notif.close();
        };
      }

      // Advance baseline so future polls only look at strictly newer rows.
      if (data.length > 0) {
        const newest = data[data.length - 1].created_at;
        baselineRef.current = newest;
      }
    }

    // Fire immediately then poll.
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [employee?.id]);
}

export async function requestCsNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return await Notification.requestPermission();
}

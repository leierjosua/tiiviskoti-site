import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

export type TeamMember = {
  employee_id: string;
  first_name: string;
  last_name: string;
  active: boolean;
};

/**
 * Returns every employee that shares a team with the given employee (including
 * the employee themselves). Implemented as two simple queries — avoids
 * PostgREST self-embed quirks where the `employee_team_members!team_id` hint
 * doesn't always resolve.
 *
 * Returns an empty list if the employee isn't in any team.
 */
export function useEmployeeTeamMembers(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-team-members-of", employeeId],
    enabled: !!employeeId,
    queryFn: async (): Promise<TeamMember[]> => {
      if (!employeeId) return [];
      const { data: teamRow } = await supabase
        .from("employee_team_members")
        .select("team_id")
        .eq("employee_id", employeeId)
        .maybeSingle();
      if (!teamRow?.team_id) return [];
      const { data: rows, error } = await supabase
        .from("employee_team_members")
        .select("employee_id, employees!inner(id, first_name, last_name, active)")
        .eq("team_id", teamRow.team_id);
      if (error) throw error;
      type Row = { employee_id: string; employees: { id: string; first_name: string; last_name: string; active: boolean } };
      return ((rows || []) as unknown as Row[])
        .filter((r) => r.employees)
        .map((r) => ({
          employee_id: r.employee_id,
          first_name: r.employees.first_name,
          last_name: r.employees.last_name,
          active: r.employees.active,
        }));
    },
  });
}

type TeamMemberInput = {
  employee_id: string;
  calendar_id?: string | null;
  role?: "primary" | "secondary";
  commission_cents?: number;
};

function invalidateBookingCaches(qc: ReturnType<typeof useQueryClient>, bookingId: string, bookingNumber?: number) {
  qc.invalidateQueries({ queryKey: queryKeys.bookings.all });
  qc.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
  if (bookingNumber) {
    qc.invalidateQueries({ queryKey: queryKeys.bookings.byNumber(bookingNumber) });
  }
  qc.invalidateQueries({ queryKey: queryKeys.bookingEmployees.byBooking(bookingId) });
  qc.invalidateQueries({ queryKey: ["installer-bookings"] });
  qc.invalidateQueries({ queryKey: ["installer-dashboard-stats"] });
}

/**
 * Installer self-joins a teammate's booking as 'secondary'. Authz is enforced
 * server-side: caller's team must include the booking's current primary.
 */
export function useJoinBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { booking_id: string; booking_number?: number }) => {
      const { error } = await supabase.functions.invoke("reassign-booking-installer", {
        body: { booking_id: input.booking_id, mode: "self_join" },
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => invalidateBookingCaches(qc, vars.booking_id, vars.booking_number),
  });
}

/** Installer removes themselves from a booking. Only allowed for 'secondary'. */
export function useLeaveBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { booking_id: string; booking_number?: number }) => {
      const { error } = await supabase.functions.invoke("reassign-booking-installer", {
        body: { booking_id: input.booking_id, mode: "self_leave" },
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => invalidateBookingCaches(qc, vars.booking_id, vars.booking_number),
  });
}

/**
 * Admin / primary mutates the full booking team. The edge function's `team`
 * branch replaces all booking_employees rows in order; commission and primary
 * sync triggers fire automatically.
 */
export function useUpdateBookingTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { booking_id: string; booking_number?: number; team: TeamMemberInput[] }) => {
      const { error } = await supabase.functions.invoke("reassign-booking-installer", {
        body: { booking_id: input.booking_id, team: input.team },
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => invalidateBookingCaches(qc, vars.booking_id, vars.booking_number),
  });
}

export type ConflictRow = {
  id: string;
  booking_number?: number;
  time_slot: string;
  duration_minutes?: number | null;
  services?: { duration_minutes?: number | null } | null;
  customers?: { first_name?: string; last_name?: string } | null;
};

/**
 * Bookings that would overlap a candidate slot for the given employee.
 * Excludes excludeBookingId so re-adding doesn't conflict with itself.
 *
 * Overlap rule: same date, time ranges intersect. We pull a small candidate set
 * (date match for the employee) and filter client-side — booking volume per
 * employee per day is tiny.
 */
export async function fetchEmployeeConflicts(input: {
  employeeId: string;
  date: string;
  startTime: string;
  durationMin: number;
  excludeBookingId?: string;
}): Promise<ConflictRow[]> {
  const { employeeId, date, startTime, durationMin, excludeBookingId } = input;
  const candStart = toMinutes(startTime);
  const candEnd = candStart + durationMin;

  const [{ data: primaryRows }, { data: beRows }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, booking_number, time_slot, duration_minutes, services(duration_minutes), customers(first_name, last_name)")
      .is("deleted_at", null)
      .eq("employee_id", employeeId)
      .eq("booking_date", date)
      .neq("status", "cancelled"),
    supabase
      .from("booking_employees")
      .select("booking_id, bookings!inner(id, booking_number, time_slot, duration_minutes, booking_date, status, deleted_at, services(duration_minutes), customers(first_name, last_name))")
      .eq("employee_id", employeeId),
  ]);

  const seen = new Set<string>();
  const candidates: ConflictRow[] = [];
  for (const r of (primaryRows || []) as unknown as ConflictRow[]) {
    if (excludeBookingId && r.id === excludeBookingId) continue;
    if (!seen.has(r.id)) { seen.add(r.id); candidates.push(r); }
  }
  type BeRow = { bookings?: (ConflictRow & { booking_date: string; status: string; deleted_at: string | null }) | null };
  for (const be of (beRows || []) as unknown as BeRow[]) {
    const b = be.bookings;
    if (!b) continue;
    if (excludeBookingId && b.id === excludeBookingId) continue;
    if (b.deleted_at) continue;
    if (b.status === "cancelled") continue;
    if (b.booking_date !== date) continue;
    if (!seen.has(b.id)) { seen.add(b.id); candidates.push(b); }
  }

  return candidates.filter((b) => {
    const s = toMinutes(b.time_slot);
    const dur = b.duration_minutes || b.services?.duration_minutes || 60;
    const e = s + dur;
    return s < candEnd && e > candStart;
  });
}

/** React-query wrapper around fetchEmployeeConflicts. */
export function useEmployeeConflicts(
  employeeId: string | undefined,
  date: string | undefined,
  startTime: string | undefined,
  durationMin: number | undefined,
  excludeBookingId?: string,
) {
  return useQuery({
    queryKey: ["employee-conflicts", employeeId, date, startTime, durationMin, excludeBookingId],
    enabled: !!employeeId && !!date && !!startTime && !!durationMin,
    queryFn: () => fetchEmployeeConflicts({
      employeeId: employeeId!,
      date: date!,
      startTime: startTime!,
      durationMin: durationMin!,
      excludeBookingId,
    }),
  });
}

function toMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + (m || 0);
}

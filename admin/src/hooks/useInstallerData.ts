import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import { finnishNow, finnishToday } from "@/lib/utils";
import type { Booking } from "@/lib/types";

interface CommissionBooking {
  id: string;
  status?: string;
  booking_date?: string;
  booking_number?: number;
  customers?: { first_name: string; last_name: string } | null;
  booking_employees: { commission_cents: number }[];
}

export function useInstallerBookings(employeeId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.installer.bookings(employeeId),
    queryFn: async () => {
      if (!employeeId) return [];

      // Resolve the set of employee_ids whose bookings this user is allowed to
      // see: themselves + any teammates. RLS would also gate access, but using
      // the explicit list lets us also fetch all of them in one query.
      const { data: teamRow } = await supabase
        .from("employee_team_members")
        .select("team_id")
        .eq("employee_id", employeeId)
        .maybeSingle();

      let employeeIds: string[] = [employeeId];
      if (teamRow?.team_id) {
        const { data: teammates } = await supabase
          .from("employee_team_members")
          .select("employee_id")
          .eq("team_id", teamRow.team_id);
        if (teammates && teammates.length > 0) {
          employeeIds = teammates.map((t: { employee_id: string }) => t.employee_id);
        }
      }

      // bookings has two FKs to employees (employee_id + salesperson_id), so
      // the embed must be disambiguated with !bookings_employee_id_fkey.
      const bookingsSelect =
        "*, customers(*), services(*), employees!bookings_employee_id_fkey(*), booking_employees(*, employees(*))";

      const [directRes, teamRes] = await Promise.all([
        supabase
          .from("bookings")
          .select(bookingsSelect)
          .is("deleted_at", null)
          .in("employee_id", employeeIds)
          .neq("status", "cancelled")
          .order("booking_date", { ascending: true })
          .order("time_slot", { ascending: true }),
        supabase
          .from("booking_employees")
          .select("booking_id")
          .in("employee_id", employeeIds),
      ]);
      if (directRes.error) throw directRes.error;

      const directBookings = directRes.data as Booking[];
      const directIds = new Set(directBookings.map((b) => b.id));

      const teamBookingIds = (teamRes.data || [])
        .map((be: { booking_id: string }) => be.booking_id)
        .filter((id: string) => !directIds.has(id));

      if (teamBookingIds.length > 0) {
        const { data: teamBookings } = await supabase
          .from("bookings")
          .select(bookingsSelect)
          .is("deleted_at", null)
          .in("id", teamBookingIds)
          .neq("status", "cancelled")
          .order("booking_date", { ascending: true })
          .order("time_slot", { ascending: true });
        return [...directBookings, ...(teamBookings || [])] as Booking[];
      }

      return directBookings;
    },
    enabled: !!employeeId,
  });
}

export function useInstallerDashboardStats(employeeId: string | undefined, month?: { year: number; month: number }) {
  return useQuery({
    queryKey: [...queryKeys.installer.dashboardStats(employeeId), month?.year, month?.month],
    queryFn: async () => {
      if (!employeeId) return null;

      const today = finnishNow();
      const todayStr = finnishToday();

      const targetYear = month?.year ?? today.getFullYear();
      const targetMonth = month?.month ?? today.getMonth();

      const monthStart = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
      const monthEnd = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const [todayGigs, futureBookings, monthCompletedBookings, upcomingBookings, monthAllBookings, manualCommissions, salesCommissions, contractVisits] =
        await Promise.all([
          // Today's gigs (full data, sorted by time)
          supabase
            .from("bookings")
            .select("*, customers(*), services(*)")
            .is("deleted_at", null)
            .eq("employee_id", employeeId)
            .eq("booking_date", todayStr)
            .neq("status", "cancelled")
            .order("time_slot", { ascending: true }),

          // Future gigs (after today, not cancelled)
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
            .eq("employee_id", employeeId)
            .gt("booking_date", todayStr)
            .neq("status", "cancelled"),

          // Completed this month (with pre-calculated commissions from booking_employees)
          supabase
            .from("bookings")
            .select("id, booking_date, booking_employees!inner(commission_cents)")
            .is("deleted_at", null)
            .eq("booking_employees.employee_id", employeeId)
            .gte("booking_date", monthStart)
            .lte("booking_date", monthEnd)
            .gt("price_cents", 0)
            .eq("status", "completed"),

          // Upcoming bookings list (after today)
          supabase
            .from("bookings")
            .select("*, customers(*), services(*)")
            .is("deleted_at", null)
            .eq("employee_id", employeeId)
            .gt("booking_date", todayStr)
            .neq("status", "cancelled")
            .order("booking_date", { ascending: true })
            .order("time_slot", { ascending: true })
            .limit(10),

          // All non-cancelled bookings this month (for projected commission)
          supabase
            .from("bookings")
            .select("id, status, booking_date, booking_number, customers(first_name, last_name), booking_employees!inner(commission_cents)")
            .is("deleted_at", null)
            .eq("booking_employees.employee_id", employeeId)
            .gte("booking_date", monthStart)
            .lte("booking_date", monthEnd)
            .gt("price_cents", 0)
            .neq("status", "cancelled"),

          // Manual commissions this month
          supabase
            .from("manual_commissions")
            .select("amount_cents")
            .eq("employee_id", employeeId)
            .gte("commission_date", monthStart)
            .lte("commission_date", monthEnd),

          // Sales commissions this month
          supabase.rpc("get_seller_commissions_for_period", {
            p_date_from: `${monthStart}T00:00:00Z`,
            p_date_to: `${monthEnd}T23:59:59Z`,
          }),

          // Contract sales commissions this month (installer sold a contract on-site)
          supabase
            .from("contract_sales_commissions")
            .select("commission_cents")
            .eq("employee_id", employeeId)
            .gte("created_at", `${monthStart}T00:00:00Z`)
            .lte("created_at", `${monthEnd}T23:59:59Z`),
        ]);

      const todayGigsData = (todayGigs.data || []) as Booking[];

      // Sales commissions for this employee
      const salesRows = (salesCommissions.data ?? []) as Array<{
        salesperson_id: string;
        commission_eur: number;
        won_deals: number;
      }>;
      const myRow = salesRows.find((r) => r.salesperson_id === employeeId);

      // Contract sales commissions (installer sold contracts on-site)
      const cscRows = (contractVisits.data ?? []) as Array<{ commission_cents: number }>;
      const contractSalesCommissionCents = cscRows.reduce((sum, r) => sum + r.commission_cents, 0);

      return {
        todayCount: todayGigsData.length,
        todayGigs: todayGigsData,
        futureCount: futureBookings.count || 0,
        monthCompleted: (monthCompletedBookings.data || []).length,
        monthCompletedBookings: (monthCompletedBookings.data || []) as unknown as CommissionBooking[],
        monthAllBookings: (monthAllBookings.data || []) as unknown as CommissionBooking[],
        manualCommissionCents: (manualCommissions.data || []).reduce(
          (sum: number, mc: { amount_cents: number }) => sum + mc.amount_cents, 0
        ),
        upcomingBookings: (upcomingBookings.data || []) as Booking[],
        salesCommissionCents: myRow ? Math.round(myRow.commission_eur * 100) : 0,
        wonDeals: myRow?.won_deals ?? 0,
        contractSalesCommissionCents,
      };
    },
    enabled: !!employeeId,
    staleTime: 30_000,
  });
}

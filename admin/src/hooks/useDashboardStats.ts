import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import { finnishNow, finnishToday, finnishDayRange } from "@/lib/utils";

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: async () => {
      const now = finnishNow();
      const todayStr = finnishToday();
      const today = finnishDayRange(todayStr);

      // 30 days ago
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(thirtyDaysAgo.getDate()).padStart(2, "0")}`;

      const [
        todaySalesRes,
        todayNewBookingsRes,
        last30DaysBookingsRes,
        todayGigsRes,
        recentBookingsRes,
      ] = await Promise.all([
        // Sales today (all non-cancelled bookings created today, with ALV — includes pending)
        supabase
          .from("bookings")
          .select("price_cents")
          .is("deleted_at", null)
          .gte("created_at", today.start)
          .lt("created_at", today.end)
          .neq("status", "cancelled"),

        // New bookings today (any status, created today)
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .gte("created_at", today.start)
          .lt("created_at", today.end),

        // Bookings last 3 days (created in last 3 days)
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .gte("created_at", finnishDayRange(thirtyDaysAgoStr).start),

        // Today's gigs (bookings scheduled for today, not cancelled)
        supabase
          .from("bookings")
          .select("*, customers(*), services(*), employees!bookings_employee_id_fkey(*)")
          .is("deleted_at", null)
          .eq("booking_date", todayStr)
          .neq("status", "cancelled")
          .order("time_slot", { ascending: true }),

        // Recent bookings (latest 8, any date)
        supabase
          .from("bookings")
          .select("*, customers(*), services(*), employees!bookings_employee_id_fkey(*)")
          .is("deleted_at", null)
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      const todaySales = (todaySalesRes.data || []).reduce(
        (sum: number, b: { price_cents: number }) => sum + b.price_cents,
        0
      );

      return {
        todaySales,
        todayNewBookings: todayNewBookingsRes.count || 0,
        last30DaysBookings: last30DaysBookingsRes.count || 0,
        todayGigCount: todayGigsRes.data?.length || 0,
        todayGigs: todayGigsRes.data || [],
        recentBookings: recentBookingsRes.data || [],
      };
    },
    staleTime: 30_000,
  });
}

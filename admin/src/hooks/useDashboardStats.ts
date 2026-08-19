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
        todayNewBookingsRes,
        last30DaysBookingsRes,
        todayGigsRes,
        recentBookingsRes,
      ] = await Promise.all([
        // New bookings today (non-cancelled, created today) — price_cents for value
        supabase
          .from("bookings")
          .select("price_cents")
          .is("deleted_at", null)
          .gte("created_at", today.start)
          .lt("created_at", today.end)
          .neq("status", "cancelled"),

        // Bookings last 30 days (non-cancelled, created in last 30 days) — price_cents for value
        supabase
          .from("bookings")
          .select("price_cents")
          .is("deleted_at", null)
          .gte("created_at", finnishDayRange(thirtyDaysAgoStr).start)
          .neq("status", "cancelled"),

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

      const sumCents = (rows: { price_cents: number }[] | null) =>
        (rows || []).reduce((sum, b) => sum + (b.price_cents || 0), 0);

      const todayNewBookingsRows = todayNewBookingsRes.data || [];
      const last30DaysBookingsRows = last30DaysBookingsRes.data || [];
      const todayGigs = todayGigsRes.data || [];

      return {
        todayNewBookings: todayNewBookingsRows.length,
        todayNewBookingsValue: sumCents(todayNewBookingsRows),
        last30DaysBookings: last30DaysBookingsRows.length,
        last30DaysBookingsValue: sumCents(last30DaysBookingsRows),
        todayGigCount: todayGigs.length,
        todayGigsValue: sumCents(todayGigs as { price_cents: number }[]),
        todayGigs,
        recentBookings: recentBookingsRes.data || [],
      };
    },
    staleTime: 30_000,
  });
}

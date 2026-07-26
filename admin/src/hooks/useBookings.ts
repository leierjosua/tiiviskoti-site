import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { Booking, BookingStatus, BookingStatusLog, BookingAuditLog, BookingNote } from "@/lib/types";

interface BookingFilters {
  status?: BookingStatus;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sortDir?: "newest" | "oldest";
  employeeId?: string;
  serviceId?: string;
  paymentStatus?: "paid" | "unpaid";
  kpiFilter?: "all" | "unpaid" | "not_finalized" | "paid" | null;
}

const PAGE_SIZE = 50;

export function useBookings(filters: BookingFilters = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.bookings.list(filters),
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from("bookings")
        .select("*, margin_cents, customers(*), services(*), employees!bookings_employee_id_fkey(*), booking_employees(*, employees(*))")
        .is("deleted_at", null)
        .order("booking_number", { ascending: filters.sortDir === "oldest" })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (filters.status) {
        query = query.eq("status", filters.status);
      }
      if (filters.dateFrom) {
        query = query.gte("booking_date", filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte("booking_date", filters.dateTo);
      }
      if (filters.employeeId) {
        query = query.eq("employee_id", filters.employeeId);
      }
      if (filters.serviceId) {
        query = query.eq("service_id", filters.serviceId);
      }
      if (filters.paymentStatus) {
        query = query.eq("payment_status", filters.paymentStatus);
      }
      // KPI card filters
      if (filters.kpiFilter === "all") {
        query = query.neq("status", "cancelled");
      } else if (filters.kpiFilter === "unpaid") {
        query = query.eq("status", "completed").eq("payment_status", "unpaid");
      } else if (filters.kpiFilter === "not_finalized") {
        query = query.eq("status", "confirmed").is("finalized_at", null);
      } else if (filters.kpiFilter === "paid") {
        query = query.eq("payment_status", "paid");
      }
      if (filters.search) {
        const trimmed = filters.search.replace("#", "").trim();
        const num = parseInt(trimmed, 10);
        const words = trimmed.split(/\s+/).filter(Boolean);

        // Find matching customer IDs — each word must match some field (AND between words)
        let customerQuery = supabase.from("customers").select("id");
        for (const word of words) {
          customerQuery = customerQuery.or(
            `first_name.ilike.%${word}%,last_name.ilike.%${word}%,email.ilike.%${word}%,phone.ilike.%${word}%`
          );
        }
        // Cap at 100 IDs to avoid exceeding URL length limits (~8 KB) and to
        // avoid pulling thousands of rows for a broad term. Limit in the query
        // (not just client-side) so the DB stops early.
        customerQuery = customerQuery.limit(100);
        const { data: matchingCustomers } = await customerQuery;
        const customerIds = (matchingCustomers || []).map((c) => c.id);

        if (!isNaN(num) && trimmed === String(num)) {
          const parts = [`booking_number.eq.${num}`, `address.ilike.%${trimmed}%`];
          if (customerIds.length > 0) parts.push(`customer_id.in.(${customerIds.join(",")})`);
          query = query.or(parts.join(","));
        } else {
          const parts = [`address.ilike.%${trimmed}%`];
          if (customerIds.length > 0) parts.push(`customer_id.in.(${customerIds.join(",")})`);
          query = query.or(parts.join(","));
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Booking[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length * PAGE_SIZE;
    },
    // Keep showing previous results while a new filter/search query loads,
    // so the list + KPI cards don't flicker/disappear between keystrokes.
    placeholderData: keepPreviousData,
  });
}

export function useAllBookings() {
  return useQuery({
    queryKey: [...queryKeys.bookings.all, "all-bookings"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, customers(*), services(*), employees!bookings_employee_id_fkey(*), booking_employees(*, employees(*))")
        .is("deleted_at", null)
        .order("booking_date", { ascending: false });
      if (error) throw error;
      return data as Booking[];
    },
  });
}

export function useBookingKpiStats(filters: BookingFilters = {}) {
  return useQuery({
    queryKey: [...queryKeys.bookings.list(filters), "kpi"] as const,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("booking_kpi_stats", {
        p_status: filters.status ?? null,
        p_date_from: filters.dateFrom ?? null,
        p_date_to: filters.dateTo ?? null,
      });
      if (error) throw error;
      const d = data as {
        total: number; totalRevenue: number;
        unpaid: number; unpaidRevenue: number;
        notFinalized: number; notFinalizedRevenue: number;
        paid: number; paidRevenue: number;
      };
      return d;
    },
    // Keep previous KPI values visible while the new query loads (no flicker).
    placeholderData: keepPreviousData,
  });
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.bookings.detail(id),
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("bookings")
        .select("*, customers(*), services(*), employees!bookings_employee_id_fkey(*), discount_codes(*)")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return data as Booking;
    },
    enabled: !!id,
  });
}

export function useBookingByNumber(bookingNumber: number | undefined) {
  return useQuery({
    queryKey: queryKeys.bookings.byNumber(bookingNumber),
    queryFn: async () => {
      if (!bookingNumber) return null;
      const { data, error } = await supabase
        .from("bookings")
        .select("*, customers(*), services(*), employees!bookings_employee_id_fkey(*), service_variants(*), booking_employees(*, employees(*)), discount_codes(*)")
        .eq("booking_number", bookingNumber)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return data as Booking;
    },
    enabled: !!bookingNumber,
  });
}

export function useBookingStatusLog(bookingId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.bookings.statusLog(bookingId),
    queryFn: async () => {
      if (!bookingId) return [];
      const { data, error } = await supabase
        .from("booking_status_log")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BookingStatusLog[];
    },
    enabled: !!bookingId,
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      customer_id: string;
      service_id: string | null;
      employee_id: string | null;
      calendar_id: string | null;
      price_cents: number;
      booking_date: string;
      time_slot: string;
      postal_code: string | null;
      address: string | null;
      notes: string | null;
      status: BookingStatus;
      discount_code_id?: string | null;
      discount_amount_cents?: number;
      lead_source: string;
    }) => {
      const { data, error } = await supabase
        .from("bookings")
        .insert(input)
        .select("id, booking_number")
        .single();
      if (error) throw error;
      return data as { id: string; booking_number: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
    },
  });
}

export function useUpdateBookingStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      notify_customer = true,
    }: {
      id: string;
      status: BookingStatus;
      notify_customer?: boolean;
    }) => {
      // Centralized Edge Function handles status update + all side effects
      // (emails, calendar events)
      const { error } = await supabase.functions.invoke("update-booking-status", {
        body: { booking_id: id, status, notify_customer },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: ["booking"] });
      queryClient.invalidateQueries({ queryKey: ["booking-by-number"] });
      queryClient.invalidateQueries({ queryKey: ["booking-status-log"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
    },
  });
}

export function useDeleteBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Delete Google Calendar event first — must complete before booking is deleted
      // because the edge function needs to read google_calendar_event_id from the booking.
      // silent: remove customer from attendees before delete so they don't get a cancellation notification
      const { error: calError } = await supabase.functions.invoke(
        "delete-booking-calendar-event",
        { body: { booking_id: id, silent: true } }
      );
      if (calError) {
        console.error("Failed to delete calendar event:", calError);
      }
      // Soft-delete: the BEFORE DELETE trigger sets deleted_at = now()
      // and cancels the actual DELETE. The row stays but is filtered out
      // by queries using .is("deleted_at", null).
      const { error } = await supabase.from("bookings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      // Remove deleted booking from cache immediately
      queryClient.setQueriesData(
        { queryKey: queryKeys.bookings.all },
        (old: { pages: Booking[][]; pageParams: number[] } | undefined) =>
          old?.pages ? { ...old, pages: old.pages.map((page) => page.filter((b) => b.id !== id)) } : old
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: ["booking"] });
      queryClient.invalidateQueries({ queryKey: ["booking-by-number"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
    },
  });
}

export function useUpdateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Booking> & { id: string }) => {
      const { error } = await supabase
        .from("bookings")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: ["booking"] });
      queryClient.invalidateQueries({ queryKey: ["booking-by-number"] });
      queryClient.invalidateQueries({ queryKey: ["booking-status-log"] });
      queryClient.invalidateQueries({ queryKey: ["booking-audit-log"] });
    },
  });
}

/* ─── Audit log ─── */

export function useBookingAuditLog(bookingId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.bookings.auditLog(bookingId),
    queryFn: async () => {
      if (!bookingId) return [];
      const { data, error } = await supabase
        .from("booking_audit_log")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BookingAuditLog[];
    },
    enabled: !!bookingId,
  });
}

/* ─── Booking notes ─── */

export function useBookingNotes(bookingId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.bookings.notes(bookingId),
    queryFn: async () => {
      if (!bookingId) return [];
      const { data, error } = await supabase
        .from("booking_notes")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BookingNote[];
    },
    enabled: !!bookingId,
  });
}

export function useAddBookingNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, content }: { bookingId: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("booking_notes")
        .insert({ booking_id: bookingId, content, created_by: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-notes"] });
    },
  });
}

export function useUpdateBookingNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from("booking_notes")
        .update({ content })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-notes"] });
    },
  });
}

export function useDeleteBookingNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase
        .from("booking_notes")
        .delete()
        .eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-notes"] });
    },
  });
}

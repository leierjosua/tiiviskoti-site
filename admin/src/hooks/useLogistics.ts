import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { BookingProductOrder, ProductOrderStatus, ProductOrderSource } from "@/lib/types";

// ─── Filters ────────────────────────────────────────────────────────────────

export interface BPOFilters {
  status?: ProductOrderStatus;
  source?: ProductOrderSource | "pending";
  brand?: string;
  from?: string;
  to?: string;
}

// ─── All booking product orders (admin logistics view) ──────────────────────

export function useBookingProductOrders(filters: BPOFilters = {}) {
  return useQuery({
    queryKey: queryKeys.logistics.bookingProductOrders.list(filters),
    queryFn: async () => {
      let query = supabase
        .from("booking_product_orders")
        .select(`
          *,
          products(id, name, brand, model, sku, images),
          bookings!inner(id, booking_number, booking_date, address, status,
            customers(id, first_name, last_name),
            employees!bookings_employee_id_fkey(id, first_name, last_name)
          ),
          manufacturer_orders(id, order_number, status, expected_delivery)
        `)
        .order("created_at", { ascending: false });

      if (filters.status) query = query.eq("status", filters.status);
      if (filters.source === "pending") {
        query = query.is("source", null);
      } else if (filters.source) {
        query = query.eq("source", filters.source);
      }
      if (filters.brand) query = query.eq("products.brand", filters.brand);
      if (filters.from) query = query.gte("created_at", filters.from);
      if (filters.to) query = query.lte("created_at", filters.to + "T23:59:59");

      const { data, error } = await query;
      if (error) throw error;
      return data as BookingProductOrder[];
    },
  });
}

// ─── BPOs for a single booking ──────────────────────────────────────────────

export function useBookingProductOrdersByBooking(bookingId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.logistics.bookingProductOrders.byBooking(bookingId),
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_product_orders")
        .select(`
          *,
          products(id, name, brand, model, sku, images),
          manufacturer_orders(id, order_number, status, expected_delivery)
        `)
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as BookingProductOrder[];
    },
  });
}

// ─── Update single BPO (status, source, notes) ─────────────────────────────

interface UpdateBPOInput {
  id: string;
  bookingId: string;
  updates: {
    status?: ProductOrderStatus;
    source?: ProductOrderSource;
    manufacturer_order_id?: string | null;
    notes?: string;
    // Timestamps set automatically by status, but can be overridden
    picked_up_by?: string;
  };
}

export function useUpdateBookingProductOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: UpdateBPOInput) => {
      // Auto-set timestamps based on status change
      const payload: Record<string, unknown> = { ...updates };
      if (updates.status) {
        const tsField = STATUS_TIMESTAMP_MAP[updates.status];
        if (tsField) payload[tsField] = new Date().toISOString();
      }
      if (updates.source && !payload.sourced_at) {
        payload.sourced_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("booking_product_orders")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { bookingId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.logistics.bookingProductOrders.all });
      qc.invalidateQueries({ queryKey: queryKeys.logistics.bookingProductOrders.byBooking(bookingId) });
    },
  });
}

const STATUS_TIMESTAMP_MAP: Partial<Record<ProductOrderStatus, string>> = {
  sourced_from_stock: "sourced_at",
  order_placed: "order_placed_at",
  order_confirmed: "order_confirmed_at",
  shipped: "shipped_at",
  received: "received_at",
  ready_for_pickup: "ready_for_pickup_at",
  picked_up: "picked_up_at",
  delivered: "delivered_at",
  cancelled: "cancelled_at",
};

// ─── Bulk status update ─────────────────────────────────────────────────────

interface BulkUpdateInput {
  ids: string[];
  status: ProductOrderStatus;
}

export function useBulkUpdateBPOStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, status }: BulkUpdateInput) => {
      const tsField = STATUS_TIMESTAMP_MAP[status];
      const payload: Record<string, unknown> = { status };
      if (tsField) payload[tsField] = new Date().toISOString();

      if (status === "picked_up") {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) payload.picked_up_by = user.id;
      }

      const { error } = await supabase
        .from("booking_product_orders")
        .update(payload)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.logistics.bookingProductOrders.all });
    },
  });
}

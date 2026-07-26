import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { ManufacturerOrder, ManufacturerOrderStatus } from "@/lib/types";

// ─── List all manufacturer orders ───────────────────────────────────────────

interface MOFilters {
  status?: ManufacturerOrderStatus;
  orderType?: "single" | "batch";
  brand?: string;
}

export function useManufacturerOrders(filters: MOFilters = {}) {
  return useQuery({
    queryKey: queryKeys.logistics.manufacturerOrders.list(filters),
    queryFn: async () => {
      let query = supabase
        .from("manufacturer_orders")
        .select(`
          *,
          manufacturer_order_lines(*, products(id, name, brand, model, sku, images)),
          bookings(id, booking_number, booking_date, address, status)
        `)
        .order("created_at", { ascending: false });

      if (filters.status) query = query.eq("status", filters.status);
      if (filters.orderType) query = query.eq("order_type", filters.orderType);
      if (filters.brand) query = query.eq("brand", filters.brand);

      const { data, error } = await query;
      if (error) throw error;
      return data as ManufacturerOrder[];
    },
  });
}

// ─── Single manufacturer order detail ───────────────────────────────────────

export function useManufacturerOrder(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.logistics.manufacturerOrders.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manufacturer_orders")
        .select(`
          *,
          manufacturer_order_lines(*, products(id, name, brand, model, sku, images)),
          bookings(id, booking_number, booking_date, address, status)
        `)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as ManufacturerOrder;
    },
  });
}

// ─── Create manufacturer order (batch) ──────────────────────────────────────

interface CreateMOInput {
  /** Supplier/brand, or null for a mixed ("sekalainen") order spanning brands. */
  brand: string | null;
  order_type: "single" | "batch";
  /** Defaults to "placed" — recording an order means it has already been placed. */
  status?: ManufacturerOrderStatus;
  notes?: string;
  expected_delivery?: string;
  lines: { product_id: string; quantity_ordered: number; cost_cents?: number }[];
}

export function useCreateManufacturerOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMOInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      const status = input.status ?? "placed";

      // Create the order
      const { data: order, error: orderErr } = await supabase
        .from("manufacturer_orders")
        .insert({
          brand: input.brand,
          order_type: input.order_type,
          status,
          // When already placed, stamp placed_at so it shows on the timeline.
          placed_at: status === "draft" ? null : new Date().toISOString(),
          notes: input.notes,
          expected_delivery: input.expected_delivery,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (orderErr) throw orderErr;

      // Create order lines
      const lines = input.lines.map((l) => ({
        manufacturer_order_id: order.id,
        product_id: l.product_id,
        quantity_ordered: l.quantity_ordered,
        cost_cents: l.cost_cents ?? null,
      }));

      const { error: linesErr } = await supabase
        .from("manufacturer_order_lines")
        .insert(lines);
      if (linesErr) throw linesErr;

      return order as ManufacturerOrder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.logistics.manufacturerOrders.all });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
    },
  });
}

// ─── Update manufacturer order status ───────────────────────────────────────

interface UpdateMOStatusInput {
  id: string;
  status: ManufacturerOrderStatus;
  notes?: string;
  expected_delivery?: string;
}

export function useUpdateManufacturerOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, notes, expected_delivery }: UpdateMOStatusInput) => {
      const payload: Record<string, unknown> = { status };
      if (notes !== undefined) payload.notes = notes;
      if (expected_delivery !== undefined) payload.expected_delivery = expected_delivery;

      const { data, error } = await supabase
        .from("manufacturer_orders")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ManufacturerOrder;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.logistics.manufacturerOrders.all });
      qc.invalidateQueries({ queryKey: queryKeys.logistics.manufacturerOrders.detail(data.id) });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
      // If received, inventory changed
      if (data.status === "received") {
        qc.invalidateQueries({ queryKey: queryKeys.inventory.summary });
        qc.invalidateQueries({ queryKey: queryKeys.products.all });
      }
    },
  });
}

// ─── Receive manufacturer order (record quantities received) ────────────────

interface ReceiveMOInput {
  id: string;
  lines: { line_id: string; quantity_received: number }[];
  markFullyReceived: boolean;
}

export function useReceiveManufacturerOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, lines, markFullyReceived }: ReceiveMOInput) => {
      // Update each line's quantity_received
      for (const line of lines) {
        const { error } = await supabase
          .from("manufacturer_order_lines")
          .update({ quantity_received: line.quantity_received })
          .eq("id", line.line_id);
        if (error) throw error;
      }

      // Update order status
      const newStatus = markFullyReceived ? "received" : "partially_received";
      const { data, error } = await supabase
        .from("manufacturer_orders")
        .update({ status: newStatus })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ManufacturerOrder;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.logistics.manufacturerOrders.all });
      qc.invalidateQueries({ queryKey: queryKeys.logistics.manufacturerOrders.detail(data.id) });
      qc.invalidateQueries({ queryKey: queryKeys.inventory.summary });
      qc.invalidateQueries({ queryKey: queryKeys.products.all });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
      qc.invalidateQueries({ queryKey: ["inventory-units"] });
      // Also refresh BPOs since linked orders may have updated
      qc.invalidateQueries({ queryKey: queryKeys.logistics.bookingProductOrders.all });
    },
  });
}

// ─── Send manufacturer order email ──────────────────────────────────────────

interface SendMOEmailInput {
  orderId: string;
  brand: string;
}

// DISABLED 2026-05-19: automated manufacturer order emails are no longer sent.
// Lasikiilto places orders manually (phone/portal). This hook is kept so existing
// imports still resolve, but it throws immediately. To revive the original
// implementation, see git history before this date.
export function useSendManufacturerOrderEmail() {
  return useMutation({
    mutationFn: async (_input: SendMOEmailInput) => {
      throw new Error(
        "Automaattinen tilaussähköposti valmistajille on poistettu käytöstä. Tee tilaus käsin.",
      );
    },
  });
}

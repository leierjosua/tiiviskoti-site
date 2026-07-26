import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { BookingLineItem, LineItemType } from "@/lib/types";

export function useBookingLineItems(bookingId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.bookingLineItems.byBooking(bookingId),
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_line_items")
        .select("*, addon_services(*), products(*)")
        .eq("booking_id", bookingId!)
        .order("sort_order");
      if (error) throw error;
      return data as BookingLineItem[];
    },
  });
}

export function useAddBookingLineItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      booking_id: string;
      line_type: LineItemType;
      addon_service_id?: string | null;
      product_id?: string | null;
      name: string;
      price_cents: number;
      quantity?: number;
      duration_minutes?: number;
      material_cost_cents?: number;
      cost_cents?: number;
      commission_cents?: number;
      notes?: string;
      sort_order?: number;
    }) => {
      const { data, error } = await supabase.from("booking_line_items").insert(input).select().single();
      if (error) throw error;
      return data as BookingLineItem;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingLineItems.byBooking(variables.booking_id) });
    },
  });
}

export function useUpdateBookingLineItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, booking_id, ...updates }: Partial<BookingLineItem> & { id: string; booking_id: string }) => {
      const { error } = await supabase.from("booking_line_items").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingLineItems.byBooking(variables.booking_id) });
    },
  });
}

export function useDeleteBookingLineItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; booking_id: string }) => {
      const { error } = await supabase.from("booking_line_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookingLineItems.byBooking(variables.booking_id) });
    },
  });
}

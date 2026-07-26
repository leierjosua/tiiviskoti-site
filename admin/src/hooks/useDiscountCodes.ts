import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { Booking, DiscountCode } from "@/lib/types";

export function useDiscountCodes() {
  return useQuery({
    queryKey: queryKeys.discountCodes.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discount_codes")
        .select("*, employees(first_name, last_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DiscountCode[];
    },
  });
}

export function useCreateDiscountCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      code: string;
      discount_type: "eur" | "percent";
      discount_value: number;
      max_uses?: number | null;
      expires_at?: string | null;
      active?: boolean;
      employee_id?: string | null;
      commission_cents?: number;
    }) => {
      const { data, error } = await supabase
        .from("discount_codes")
        .insert({ ...input, code: input.code.toLowerCase() })
        .select("*")
        .single();
      if (error) throw error;
      return data as DiscountCode;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.discountCodes.all });
    },
  });
}

export function useUpdateDiscountCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DiscountCode> & { id: string }) => {
      if (updates.code) updates.code = updates.code.toLowerCase();
      const { error } = await supabase
        .from("discount_codes")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.discountCodes.all });
    },
  });
}

export function useSellerDiscountCodes(employeeId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.discountCodes.byEmployee(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discount_codes")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("active", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DiscountCode[];
    },
    enabled: !!employeeId,
  });
}

export function useDiscountCodeBookings(discountCodeId: string | null) {
  return useQuery({
    queryKey: queryKeys.discountCodes.bookings(discountCodeId),
    queryFn: async () => {
      if (!discountCodeId) return [];
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_number, booking_date, created_at, opportunity_id, price_cents, discount_amount_cents, status, customers(first_name, last_name)")
        .is("deleted_at", null)
        .eq("discount_code_id", discountCodeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Booking[];
    },
    enabled: !!discountCodeId,
  });
}

export function useDeleteDiscountCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("discount_codes")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.discountCodes.all });
    },
  });
}

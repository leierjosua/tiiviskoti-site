import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { Customer, Booking } from "@/lib/types";

export function useCustomers(search?: string) {
  return useQuery({
    queryKey: queryKeys.customers.list(search),
    queryFn: async () => {
      let query = supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });

      if (search) {
        const terms = search.trim().split(/\s+/);
        for (const term of terms) {
          query = query.or(
            `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`
          );
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Customer[];
    },
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id),
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Customer;
    },
    enabled: !!id,
  });
}

export function useUpsertCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
      postal_code: string;
      address: string;
      notes?: string | null;
      company_name?: string | null;
      business_id?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("customers")
        .upsert(input, { onConflict: "email" })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...fields
    }: {
      id: string;
      first_name?: string;
      last_name?: string;
      email?: string;
      phone?: string | null;
      address?: string | null;
      postal_code?: string | null;
      notes?: string | null;
      do_not_contact?: boolean;
      company_name?: string | null;
      business_id?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("customers")
        .update(fields)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Customer;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.customers.detail(variables.id),
      });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
  });
}

export function useCustomerBookings(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.bookings(customerId),
    queryFn: async () => {
      if (!customerId) return [];
      const { data, error } = await supabase
        .from("bookings")
        .select("*, services(*)")
        .eq("customer_id", customerId)
        .is("deleted_at", null)
        .order("booking_date", { ascending: false });
      if (error) throw error;
      return data as Booking[];
    },
    enabled: !!customerId,
  });
}

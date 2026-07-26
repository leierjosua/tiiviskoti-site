import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { ContactForm } from "@/lib/types";

export function useContactForms() {
  return useQuery({
    queryKey: queryKeys.contactForms.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_forms")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ContactForm[];
    },
  });
}

export function useToggleContactFormActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("contact_forms")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contactForms.all });
    },
  });
}

export function useUpdateContactForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Pick<ContactForm, "notification_enabled" | "notification_emails" | "category">>) => {
      const { error } = await supabase
        .from("contact_forms")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contactForms.all });
    },
  });
}

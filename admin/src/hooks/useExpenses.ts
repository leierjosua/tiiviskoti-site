import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface Expense {
  id: string;
  name: string;
  amount_cents: number;
  expense_type: "recurring" | "one_time";
  category: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const EXPENSE_CATEGORIES: Record<string, string> = {
  rent: "Vuokra",
  software: "Ohjelmistot",
  insurance: "Vakuutukset",
  accounting: "Kirjanpito",
  phone: "Puhelin & internet",
  vehicle: "Ajoneuvot",
  equipment: "Kalusto & laitteet",
  office: "Toimistotarvikkeet",
  marketing_fixed: "Markkinointi (kiinteä)",
  salary_fixed: "Kiinteät palkat",
  other: "Muu",
};

export function useExpenses() {
  return useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("expense_type")
        .order("category")
        .order("name");
      if (error) throw error;
      return data as Expense[];
    },
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Expense, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase.from("expenses").insert(input).select().single();
      if (error) throw error;
      return data as Expense;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Expense> & { id: string }) => {
      const { error } = await supabase.from("expenses").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

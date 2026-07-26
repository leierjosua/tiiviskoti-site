import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type {
  Contract,
  ContractTemplate,
  ContractVisit,
  ContractStatusLog,
  ContractStatus,
} from "@/lib/types";
import { finnishToday } from "@/lib/utils";

// ─── Templates ───

export function useContractTemplates() {
  return useQuery({
    queryKey: queryKeys.contracts.templates.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_templates")
        .select("*, services(*)")
        .order("sort_order");
      if (error) throw error;
      return data as ContractTemplate[];
    },
  });
}

export function useContractTemplate(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.contracts.templates.detail(id),
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("contract_templates")
        .select("*, services(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as ContractTemplate;
    },
    enabled: !!id,
  });
}

export function useCreateContractTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ContractTemplate>) => {
      const { data, error } = await supabase
        .from("contract_templates")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as ContractTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.contracts.templates.all }),
  });
}

export function useUpdateContractTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ContractTemplate> & { id: string }) => {
      const { error } = await supabase
        .from("contract_templates")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.contracts.templates.all }),
  });
}

// ─── Contracts ───

interface ContractFilters {
  status?: ContractStatus;
  search?: string;
}

export function useContracts(filters: ContractFilters = {}) {
  return useQuery({
    queryKey: queryKeys.contracts.list(filters),
    queryFn: async () => {
      let query = supabase
        .from("contracts")
        .select("*, customers(*), services(*), employees!contracts_created_by_employee_id_fkey(*), contract_templates(*)")
        .order("created_at", { ascending: false });

      if (filters.status) {
        query = query.eq("status", filters.status);
      }
      if (filters.search) {
        query = query.or(
          `customers.first_name.ilike.%${filters.search}%,customers.last_name.ilike.%${filters.search}%,customers.email.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Contract[];
    },
  });
}

export function useContract(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.contracts.detail(id),
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("contracts")
        .select("*, customers(*), services(*), employees!contracts_created_by_employee_id_fkey(*), contract_templates(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Contract;
    },
    enabled: !!id,
  });
}

export function useContractByNumber(contractNumber: number | undefined) {
  return useQuery({
    queryKey: queryKeys.contracts.byNumber(contractNumber),
    queryFn: async () => {
      if (!contractNumber) return null;
      const { data, error } = await supabase
        .from("contracts")
        .select("*, customers(*), services(*), employees!contracts_created_by_employee_id_fkey(*), contract_templates(*)")
        .eq("contract_number", contractNumber)
        .single();
      if (error) throw error;
      return data as Contract;
    },
    enabled: !!contractNumber,
  });
}

export function useCustomerContracts(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.contracts.customerContracts(customerId),
    queryFn: async () => {
      if (!customerId) return [];
      const { data, error } = await supabase
        .from("contracts")
        .select("*, services(*), contract_templates(*)")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Contract[];
    },
    enabled: !!customerId,
  });
}

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Contract>) => {
      const { data, error } = await supabase
        .from("contracts")
        .insert(input)
        .select("id, contract_number")
        .single();
      if (error) throw error;
      return data as { id: string; contract_number: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.contracts.all });
      qc.invalidateQueries({ queryKey: ["customer-contracts"] });
    },
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Contract> & { id: string }) => {
      const { error } = await supabase
        .from("contracts")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.contracts.all });
      qc.invalidateQueries({ queryKey: ["contract"] });
      qc.invalidateQueries({ queryKey: ["customer-contracts"] });
    },
  });
}

export function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // All child tables (visits, status_log, commissions, tokens) use ON DELETE CASCADE
      const { error } = await supabase.from("contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.contracts.all });
      qc.invalidateQueries({ queryKey: ["contract"] });
      qc.invalidateQueries({ queryKey: ["customer-contracts"] });
      qc.invalidateQueries({ queryKey: ["contract-stats"] });
    },
  });
}

// ─── Visits ───

export function useContractVisits(contractId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.contracts.visits(contractId),
    queryFn: async () => {
      if (!contractId) return [];
      const { data, error } = await supabase
        .from("contract_visits")
        .select("*, bookings(id, booking_number, booking_date, status)")
        .eq("contract_id", contractId)
        .order("scheduled_year")
        .order("scheduled_month");
      if (error) throw error;
      return data as ContractVisit[];
    },
    enabled: !!contractId,
  });
}

export function useCreateContractVisits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (visits: Partial<ContractVisit>[]) => {
      const { error } = await supabase.from("contract_visits").insert(visits);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract-visits"] }),
  });
}

// ─── Status log ───

export function useContractStatusLog(contractId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.contracts.statusLog(contractId),
    queryFn: async () => {
      if (!contractId) return [];
      const { data, error } = await supabase
        .from("contract_status_log")
        .select("*")
        .eq("contract_id", contractId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ContractStatusLog[];
    },
    enabled: !!contractId,
  });
}

// ─── Stats ───

export function useContractStats() {
  return useQuery({
    queryKey: queryKeys.contracts.stats,
    queryFn: async () => {
      const { data: all, error } = await supabase
        .from("contracts")
        .select("status, contract_price_cents, billing_interval_months, end_date");
      if (error) throw error;

      const today = finnishToday();
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextMonthStr = nextMonth.toISOString().split("T")[0];

      const active = (all || []).filter((c: any) => c.status === "active" || c.status === "expiring");
      const expiringThisMonth = (all || []).filter(
        (c: any) => (c.status === "active" || c.status === "expiring") && c.end_date <= nextMonthStr && c.end_date >= today
      );
      // Annualized revenue: price × (12 / billing_interval_months)
      const annualRevenue = active.reduce((sum: number, c: any) => {
        const bim = c.billing_interval_months || 12;
        return sum + Math.round((c.contract_price_cents || 0) * (12 / bim));
      }, 0);

      return {
        activeCount: active.length,
        expiringCount: expiringThisMonth.length,
        totalCount: (all || []).length,
        annualRevenueCents: annualRevenue,
      };
    },
  });
}

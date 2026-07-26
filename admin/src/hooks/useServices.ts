import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { Service, ServiceArea, ServiceCategory, CompanySettings } from "@/lib/types";

export function useServices() {
  return useQuery({
    queryKey: queryKeys.services.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as Service[];
    },
  });
}

export function useServiceCategories() {
  return useQuery({
    queryKey: ["service-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_categories")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as ServiceCategory[];
    },
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Service, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase.from("services").insert(input).select().single();
      if (error) throw error;
      return data as Service;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.all });
    },
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Service> & { id: string }) => {
      const { error } = await supabase.from("services").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.all });
    },
  });
}

export function useServiceAreas(employeeId?: string) {
  return useQuery({
    queryKey: queryKeys.serviceAreas.list(employeeId),
    queryFn: async () => {
      let query = supabase
        .from("service_areas")
        .select("*")
        .order("name");
      if (employeeId) query = query.eq("employee_id", employeeId);
      const { data, error } = await query;
      if (error) throw error;
      return data as ServiceArea[];
    },
  });
}

export function useCreateServiceArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employee_id: string; name: string; description?: string; postal_codes: string[]; center_postal?: string | null; radius_km?: number | null }) => {
      const { data, error } = await supabase.from("service_areas").insert(input).select().single();
      if (error) throw error;
      return data as ServiceArea;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceAreas.all });
    },
  });
}

export function useUpdateServiceArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ServiceArea> & { id: string }) => {
      const { error } = await supabase.from("service_areas").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceAreas.all });
    },
  });
}

// Company settings
export function useCompanySettings() {
  return useQuery({
    queryKey: queryKeys.companySettings,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .single();
      if (error) throw error;
      return data as CompanySettings;
    },
  });
}

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<CompanySettings>) => {
      const { data: existing } = await supabase.from("company_settings").select("id").single();
      if (!existing) throw new Error("Settings not found");
      const { error } = await supabase
        .from("company_settings")
        .update(updates)
        .eq("id", existing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companySettings });
    },
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.all });
    },
  });
}

export function useDeleteServiceArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_areas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceAreas.all });
    },
  });
}

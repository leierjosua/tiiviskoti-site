import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { AddonService, AddonServiceLink } from "@/lib/types";

export function useAddonServices() {
  return useQuery({
    queryKey: queryKeys.addonServices.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addon_services")
        .select("*")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data as AddonService[];
    },
  });
}

export function useAddonsByService(serviceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.addonServices.byService(serviceId),
    enabled: !!serviceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addon_service_links")
        .select("*, addon_services(*)")
        .eq("service_id", serviceId!)
        .order("sort_order");
      if (error) throw error;
      return data as (AddonServiceLink & { addon_services: AddonService })[];
    },
  });
}

export function useAddonServiceLinks(addonServiceId: string | undefined) {
  return useQuery({
    queryKey: ["addon-service-links", addonServiceId],
    enabled: !!addonServiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addon_service_links")
        .select("*, services(*)")
        .eq("addon_service_id", addonServiceId!)
        .order("sort_order");
      if (error) throw error;
      return data as AddonServiceLink[];
    },
  });
}

export function useCreateAddonService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<AddonService, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase.from("addon_services").insert(input).select().single();
      if (error) throw error;
      return data as AddonService;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.addonServices.all });
    },
  });
}

export function useUpdateAddonService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AddonService> & { id: string }) => {
      const { error } = await supabase.from("addon_services").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.addonServices.all });
    },
  });
}

export function useLinkAddonToService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { addon_service_id: string; service_id: string; sort_order?: number }) => {
      const { error } = await supabase.from("addon_service_links").insert(input);
      if (error) throw error;
      return input;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.addonServices.all });
      queryClient.invalidateQueries({ queryKey: ["addon-service-links", variables.addon_service_id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.addonServices.byService(variables.service_id) });
    },
  });
}

export function useDeleteAddonService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("addon_services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.addonServices.all });
    },
  });
}

export function useUpdateAddonServiceLinkRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ addon_service_id, service_id, role }: { addon_service_id: string; service_id: string; role: "addon" | "upsell" }) => {
      const { error } = await supabase
        .from("addon_service_links")
        .update({ role })
        .eq("addon_service_id", addon_service_id)
        .eq("service_id", service_id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.addonServices.all });
      queryClient.invalidateQueries({ queryKey: ["addon-service-links", variables.addon_service_id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.addonServices.byService(variables.service_id) });
    },
  });
}

/** All addon_service_links — used to know which addons are linked to which services */
export function useAllAddonServiceLinks() {
  return useQuery({
    queryKey: ["addon-service-links-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addon_service_links")
        .select("addon_service_id, service_id");
      if (error) throw error;
      return data as { addon_service_id: string; service_id: string }[];
    },
  });
}

// ─── Employee addon exclusions ─────────────────────────────────────────────

export function useEmployeeAddonExclusions(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-addon-exclusions", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_addon_exclusions")
        .select("addon_service_id")
        .eq("employee_id", employeeId!);
      if (error) throw error;
      return new Set(data.map((r) => r.addon_service_id));
    },
  });
}

export function useAllAddonExclusions() {
  return useQuery({
    queryKey: ["employee-addon-exclusions-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_addon_exclusions")
        .select("employee_id, addon_service_id");
      if (error) throw error;
      const map = new Map<string, Set<string>>();
      for (const r of data) {
        if (!map.has(r.employee_id)) map.set(r.employee_id, new Set());
        map.get(r.employee_id)!.add(r.addon_service_id);
      }
      return map;
    },
  });
}

export function useSetAddonExclusions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, excludedAddonIds }: { employeeId: string; excludedAddonIds: string[] }) => {
      await supabase.from("employee_addon_exclusions").delete().eq("employee_id", employeeId);
      if (excludedAddonIds.length > 0) {
        const { error } = await supabase
          .from("employee_addon_exclusions")
          .insert(excludedAddonIds.map((aid) => ({ employee_id: employeeId, addon_service_id: aid })));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-addon-exclusions"] });
    },
  });
}

export function useUnlinkAddonFromService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ addon_service_id, service_id }: { addon_service_id: string; service_id: string }) => {
      const { error } = await supabase
        .from("addon_service_links")
        .delete()
        .eq("addon_service_id", addon_service_id)
        .eq("service_id", service_id);
      if (error) throw error;
      return { addon_service_id, service_id };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.addonServices.all });
      queryClient.invalidateQueries({ queryKey: ["addon-service-links", variables.addon_service_id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.addonServices.byService(variables.service_id) });
    },
  });
}

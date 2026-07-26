import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type {
  FormAutomation,
  FormAutomationQueueItem,
  FormAutomationLogEntry,
} from "@/lib/types";

// ─── Automations CRUD ────────────────────────────────────────────────────────

export function useFormAutomations(formId?: string) {
  return useQuery({
    queryKey: queryKeys.formAutomations.byForm(formId),
    queryFn: async () => {
      let query = supabase
        .from("form_automations")
        .select("*")
        .order("priority", { ascending: true });

      if (formId) {
        query = query.eq("form_id", formId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as FormAutomation[];
    },
    enabled: !!formId,
  });
}

export function useAllFormAutomations() {
  return useQuery({
    queryKey: queryKeys.formAutomations.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("form_automations")
        .select("*")
        .order("priority", { ascending: true });
      if (error) throw error;
      return data as FormAutomation[];
    },
  });
}

export function useCreateFormAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (automation: Omit<FormAutomation, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("form_automations")
        .insert(automation)
        .select()
        .single();
      if (error) throw error;
      return data as FormAutomation;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.formAutomations.byForm(data.form_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.formAutomations.all });
    },
  });
}

export function useUpdateFormAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FormAutomation> & { id: string }) => {
      const { data, error } = await supabase
        .from("form_automations")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as FormAutomation;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.formAutomations.byForm(data.form_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.formAutomations.all });
    },
  });
}

export function useDeleteFormAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("form_automations")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.formAutomations.all });
    },
  });
}

// ─── Queue ───────────────────────────────────────────────────────────────────

export function useAutomationQueue(status?: string) {
  return useQuery({
    queryKey: queryKeys.formAutomations.queue(status),
    queryFn: async () => {
      let query = supabase
        .from("form_automation_queue")
        .select("*, form_automations(name)")
        .order("scheduled_at", { ascending: false })
        .limit(100);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as FormAutomationQueueItem[];
    },
  });
}

// ─── Log ─────────────────────────────────────────────────────────────────────

const LOG_PAGE_SIZE = 50;

export interface AutomationLogFilters {
  status?: "success" | "failed" | "skipped";
  page?: number;
}

export function useAutomationLog(filters: AutomationLogFilters = {}) {
  const { status, page = 0 } = filters;

  return useQuery({
    queryKey: queryKeys.formAutomations.log(status, page),
    queryFn: async () => {
      let query = supabase
        .from("form_automation_log")
        .select("*, form_automations(name, form_id)", { count: "exact" })
        .order("executed_at", { ascending: false })
        .range(page * LOG_PAGE_SIZE, (page + 1) * LOG_PAGE_SIZE - 1);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      const total = count ?? 0;
      return {
        data: (data ?? []) as FormAutomationLogEntry[],
        count: total,
        page,
        pageSize: LOG_PAGE_SIZE,
        totalPages: Math.ceil(total / LOG_PAGE_SIZE),
      };
    },
    placeholderData: keepPreviousData,
  });
}

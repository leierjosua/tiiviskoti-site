import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { CSCannedResponse } from "@/lib/cs-types";

export function useCannedResponses() {
  return useQuery({
    queryKey: queryKeys.customerService.cannedResponses.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_canned_responses")
        .select("*")
        .eq("is_active", true)
        .order("position");
      if (error) throw error;
      return data as CSCannedResponse[];
    },
  });
}

export function useAllCannedResponses() {
  return useQuery({
    queryKey: [...queryKeys.customerService.cannedResponses.all, "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_canned_responses")
        .select("*")
        .order("position");
      if (error) throw error;
      return data as CSCannedResponse[];
    },
  });
}

export function useCreateCannedResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      response: Pick<CSCannedResponse, "name" | "body_html"> &
        Partial<Pick<CSCannedResponse, "category" | "subject" | "body_text" | "variables">> & {
          created_by?: string;
        }
    ) => {
      const { data, error } = await supabase
        .from("cs_canned_responses")
        .insert(response)
        .select()
        .single();
      if (error) throw error;
      return data as CSCannedResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: queryKeys.customerService.cannedResponses.all,
      });
    },
  });
}

export function useUpdateCannedResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<CSCannedResponse> & { id: string }) => {
      const { error } = await supabase
        .from("cs_canned_responses")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: queryKeys.customerService.cannedResponses.all,
      });
    },
  });
}

export function useDeleteCannedResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cs_canned_responses")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: queryKeys.customerService.cannedResponses.all,
      });
    },
  });
}

export function useIncrementCannedResponseUsage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await supabase
        .from("cs_canned_responses")
        .select("usage_count")
        .eq("id", id)
        .single();
      if (data) {
        await supabase
          .from("cs_canned_responses")
          .update({ usage_count: (data.usage_count || 0) + 1 })
          .eq("id", id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: queryKeys.customerService.cannedResponses.all,
      });
    },
  });
}

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { FormSubmission, FormSubmissionStatus } from "@/lib/types";

const PAGE_SIZE = 50;

export interface FormSubmissionFilters {
  status?: FormSubmissionStatus;
  formId?: string;
  search?: string;
  page?: number;
}

export interface PaginatedSubmissions {
  data: FormSubmission[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useFormSubmissions(filters: FormSubmissionFilters = {}) {
  const { status, formId, search, page = 0 } = filters;

  return useQuery({
    queryKey: queryKeys.formSubmissions.list({ status, formId, search, page }),
    queryFn: async (): Promise<PaginatedSubmissions> => {
      let query = supabase
        .from("form_submissions")
        .select("*, contact_forms(name, category)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (status) {
        query = query.eq("status", status);
      }
      if (formId) {
        query = query.eq("form_id", formId);
      }
      if (search) {
        query = query.or(
          `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,message.ilike.%${search}%`
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const total = count ?? 0;
      return {
        data: (data ?? []) as FormSubmission[],
        count: total,
        page,
        pageSize: PAGE_SIZE,
        totalPages: Math.ceil(total / PAGE_SIZE),
      };
    },
    placeholderData: keepPreviousData,
  });
}

/** Lightweight query for new submission count (no pagination overhead) */
export function useNewSubmissionCount() {
  return useQuery({
    queryKey: queryKeys.formSubmissions.count,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("form_submissions")
        .select("*", { count: "exact", head: true })
        .eq("status", "new");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useUpdateFormSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<FormSubmission> & { id: string }) => {
      const { error } = await supabase
        .from("form_submissions")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.formSubmissions.all });
    },
  });
}

export function useDeleteFormSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("form_submissions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.formSubmissions.all });
    },
  });
}

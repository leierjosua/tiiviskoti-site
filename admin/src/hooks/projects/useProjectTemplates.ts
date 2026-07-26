import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { ProjectTemplate } from "@/lib/project-types";

export function useProjectTemplates() {
  return useQuery({
    queryKey: queryKeys.projects.templates,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_templates")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as ProjectTemplate[];
    },
  });
}

export function useCreateProjectTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<ProjectTemplate, "id" | "created_at">) => {
      const { data, error } = await supabase.from("project_templates").insert(input).select().single();
      if (error) throw error;
      return data as ProjectTemplate;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.templates });
    },
  });
}

export function useUpdateProjectTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ProjectTemplate> & { id: string }) => {
      const { error } = await supabase.from("project_templates").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.templates });
    },
  });
}

export function useDeleteProjectTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.templates });
    },
  });
}

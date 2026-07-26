import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { Project } from "@/lib/project-types";

export function useProjectDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projects.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(
          `*, customers(id, first_name, last_name, email, phone),
           project_members(id, employee_id, role, employees(id, first_name, last_name, email)),
           projects_tags(tag_id, project_tags(id, name, color))`,
        )
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as Project;
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Project> & { id: string }) => {
      const { error } = await supabase.from("projects").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(vars.id) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
      qc.invalidateQueries({ queryKey: queryKeys.projects.activity(vars.id) });
    },
  });
}

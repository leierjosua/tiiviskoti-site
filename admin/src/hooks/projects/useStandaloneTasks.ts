import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { ProjectTask, TaskStatus } from "@/lib/project-types";

interface StandaloneTaskFilters {
  status?: TaskStatus;
  assigneeId?: string;
  search?: string;
}

export function useStandaloneTasks(filters?: StandaloneTaskFilters) {
  return useQuery({
    queryKey: queryKeys.projects.standaloneTasks(filters),
    queryFn: async () => {
      let query = supabase
        .from("project_tasks")
        .select(
          `*, assignee:employees!project_tasks_assignee_id_fkey(id, first_name, last_name),
           project_task_checklist(id, label, checked, sort_order)`,
        )
        .is("project_id", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(500);

      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.assigneeId) query = query.eq("assignee_id", filters.assigneeId);
      if (filters?.search) {
        query = query.ilike("title", `%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((t) => ({
        ...t,
        checklist: t.project_task_checklist,
      })) as ProjectTask[];
    },
  });
}

export function useCreateStandaloneTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Pick<ProjectTask, "title"> &
        Partial<Pick<ProjectTask, "description" | "assignee_id" | "priority" | "due_date" | "estimated_hours">>,
    ) => {
      const { data, error } = await supabase
        .from("project_tasks")
        .insert({ ...input, project_id: null })
        .select()
        .single();
      if (error) throw error;
      return data as ProjectTask;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["standalone-tasks"] });
    },
  });
}

export function useUpdateStandaloneTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ProjectTask> & { id: string }) => {
      const { error } = await supabase.from("project_tasks").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["standalone-tasks"] });
      qc.invalidateQueries({ queryKey: queryKeys.projects.taskDetail(vars.id) });
    },
  });
}

export function useDeleteStandaloneTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["standalone-tasks"] });
    },
  });
}

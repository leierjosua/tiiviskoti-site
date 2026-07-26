import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { ProjectTask, TaskComment } from "@/lib/project-types";

export function useProjectTasks(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projects.tasks(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_tasks")
        .select(
          `*, assignee:employees!project_tasks_assignee_id_fkey(id, first_name, last_name),
           project_task_checklist(id, label, checked, sort_order)`,
        )
        .eq("project_id", projectId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((t) => ({
        ...t,
        checklist: t.project_task_checklist,
      })) as ProjectTask[];
    },
  });
}

export function useTaskDetail(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projects.taskDetail(taskId),
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_tasks")
        .select(
          `*, assignee:employees!project_tasks_assignee_id_fkey(id, first_name, last_name),
           reporter:employees!project_tasks_reporter_id_fkey(id, first_name, last_name),
           project_task_checklist(id, label, checked, sort_order),
           project_task_comments(id, content, created_by, created_at)`,
        )
        .eq("id", taskId!)
        .single();
      if (error) throw error;
      return {
        ...data,
        checklist: data.project_task_checklist,
        comments: data.project_task_comments,
      } as ProjectTask;
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Pick<ProjectTask, "project_id" | "title"> &
        Partial<Pick<ProjectTask, "description" | "assignee_id" | "priority" | "due_date" | "estimated_hours" | "parent_task_id">>,
    ) => {
      const { data, error } = await supabase.from("project_tasks").insert(input).select().single();
      if (error) throw error;

      await supabase.from("project_activity_log").insert({
        project_id: input.project_id,
        task_id: data.id,
        action: "task_created",
        details: { title: input.title },
      });

      return data as ProjectTask;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.tasks(vars.project_id ?? undefined) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.activity(vars.project_id ?? undefined) });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      project_id,
      ...updates
    }: Partial<ProjectTask> & { id: string; project_id?: string | null }) => {
      const { error } = await supabase.from("project_tasks").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      if (vars.project_id) {
        qc.invalidateQueries({ queryKey: queryKeys.projects.tasks(vars.project_id) });
        qc.invalidateQueries({ queryKey: queryKeys.projects.activity(vars.project_id) });
      }
      qc.invalidateQueries({ queryKey: queryKeys.projects.taskDetail(vars.id) });
      qc.invalidateQueries({ queryKey: ["standalone-tasks"] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, project_id: _project_id }: { id: string; project_id: string }) => {
      const { error } = await supabase.from("project_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.tasks(vars.project_id) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.activity(vars.project_id) });
    },
  });
}

// ─── Checklist ──────────────────────────────────────────────────────────────

export function useToggleChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, checked, taskId }: { id: string; checked: boolean; taskId: string }) => {
      const { error } = await supabase
        .from("project_task_checklist")
        .update({ checked })
        .eq("id", id);
      if (error) throw error;
      return taskId;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.taskDetail(vars.taskId) });
    },
  });
}

export function useAddChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, label }: { taskId: string; label: string }) => {
      const { error } = await supabase
        .from("project_task_checklist")
        .insert({ task_id: taskId, label });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.taskDetail(vars.taskId) });
    },
  });
}

export function useDeleteChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, taskId }: { id: string; taskId: string }) => {
      const { error } = await supabase.from("project_task_checklist").delete().eq("id", id);
      if (error) throw error;
      return taskId;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.taskDetail(vars.taskId) });
    },
  });
}

// ─── Comments ───────────────────────────────────────────────────────────────

export function useTaskComments(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projects.taskComments(taskId),
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_task_comments")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as TaskComment[];
    },
  });
}

export function useAddTaskComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, content }: { taskId: string; content: string }) => {
      const { error } = await supabase
        .from("project_task_comments")
        .insert({ task_id: taskId, content });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.taskComments(vars.taskId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.taskDetail(vars.taskId) });
    },
  });
}

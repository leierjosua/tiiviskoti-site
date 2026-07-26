import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { Project, ProjectStatus, ProjectPriority, ProjectCategory } from "@/lib/project-types";

export interface ProjectFilters {
  status?: ProjectStatus;
  priority?: ProjectPriority;
  category?: ProjectCategory;
  memberId?: string;
  search?: string;
}

export function useProjects(filters?: ProjectFilters) {
  return useQuery({
    queryKey: queryKeys.projects.list(filters),
    queryFn: async () => {
      let query = supabase
        .from("projects")
        .select(
          `*, customers(id, first_name, last_name, email),
           project_members(id, employee_id, role, employees(id, first_name, last_name))`,
        )
        .order("created_at", { ascending: false })
        .limit(500);

      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.priority) query = query.eq("priority", filters.priority);
      if (filters?.category) query = query.eq("category", filters.category);
      if (filters?.search) {
        query = query.or(
          `title.ilike.%${filters.search}%,project_number::text.ilike.%${filters.search}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      let results = data as Project[];

      // Client-side filter for member (no direct join filter in supabase-js)
      if (filters?.memberId) {
        results = results.filter((p) =>
          p.project_members?.some((m) => m.employee_id === filters.memberId),
        );
      }

      return results;
    },
  });
}

export function useProjectStats() {
  const { data: projects } = useProjects();
  const now = new Date();

  const active = projects?.filter((p) => !["completed", "cancelled"].includes(p.status)).length ?? 0;
  const overdue =
    projects?.filter(
      (p) => p.due_date && new Date(p.due_date) < now && !["completed", "cancelled"].includes(p.status),
    ).length ?? 0;
  const completedThisWeek =
    projects?.filter((p) => {
      if (p.status !== "completed" || !p.completed_at) return false;
      const d = new Date(p.completed_at);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return d >= weekAgo;
    }).length ?? 0;

  return { active, overdue, completedThisWeek };
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<
        Pick<
          Project,
          | "title"
          | "description"
          | "customer_id"
          | "booking_id"
          | "opportunity_id"
          | "contract_id"
          | "status"
          | "priority"
          | "category"
          | "budget_cents"
          | "start_date"
          | "due_date"
        >
      > & { member_ids?: string[]; template_id?: string },
    ) => {
      const { member_ids, template_id, ...projectData } = input;

      // If template, load default tasks
      let templateTasks: { title: string; description?: string; checklist?: string[]; estimated_hours?: number }[] =
        [];
      if (template_id) {
        const { data: tmpl } = await supabase
          .from("project_templates")
          .select("default_tasks, category")
          .eq("id", template_id)
          .single();
        if (tmpl) {
          templateTasks = tmpl.default_tasks as typeof templateTasks;
          if (!projectData.category) projectData.category = tmpl.category;
        }
      }

      const { data, error } = await supabase.from("projects").insert(projectData).select().single();
      if (error) throw error;

      const project = data as Project;

      // Add members
      if (member_ids?.length) {
        const rows = member_ids.map((eid, i) => ({
          project_id: project.id,
          employee_id: eid,
          role: i === 0 ? "lead" : "member",
        }));
        await supabase.from("project_members").insert(rows);
      }

      // Create tasks from template
      if (templateTasks.length) {
        const taskRows = templateTasks.map((t, i) => ({
          project_id: project.id,
          title: t.title,
          description: t.description || null,
          estimated_hours: t.estimated_hours || null,
          sort_order: i,
        }));
        const { data: tasks } = await supabase.from("project_tasks").insert(taskRows).select();

        // Create checklist items
        if (tasks) {
          const checklistRows: { task_id: string; label: string; sort_order: number }[] = [];
          tasks.forEach((task, ti) => {
            const tmplTask = templateTasks[ti];
            tmplTask.checklist?.forEach((label, ci) => {
              checklistRows.push({ task_id: task.id, label, sort_order: ci });
            });
          });
          if (checklistRows.length) {
            await supabase.from("project_task_checklist").insert(checklistRows);
          }
        }
      }

      // Log creation
      await supabase.from("project_activity_log").insert({
        project_id: project.id,
        action: "created",
        details: { title: project.title },
      });

      return project;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

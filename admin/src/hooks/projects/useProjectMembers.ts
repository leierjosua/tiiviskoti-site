import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { ProjectMemberRole } from "@/lib/project-types";

export function useAddProjectMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      employeeId,
      role = "member",
    }: {
      projectId: string;
      employeeId: string;
      role?: ProjectMemberRole;
    }) => {
      const { error } = await supabase.from("project_members").insert({
        project_id: projectId,
        employee_id: employeeId,
        role,
      });
      if (error) throw error;

      await supabase.from("project_activity_log").insert({
        project_id: projectId,
        action: "member_added",
        details: { employee_id: employeeId, role },
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(vars.projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.members(vars.projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.activity(vars.projectId) });
    },
  });
}

export function useRemoveProjectMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId: _projectId }: { id: string; projectId: string }) => {
      const { error } = await supabase.from("project_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(vars.projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.members(vars.projectId) });
    },
  });
}

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      projectId: _projectId,
      role,
    }: {
      id: string;
      projectId: string;
      role: ProjectMemberRole;
    }) => {
      const { error } = await supabase.from("project_members").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(vars.projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.members(vars.projectId) });
    },
  });
}

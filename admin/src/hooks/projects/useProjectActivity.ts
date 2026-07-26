import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { ProjectActivityLog, ProjectNote } from "@/lib/project-types";

export function useProjectActivity(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projects.activity(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_activity_log")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as ProjectActivityLog[];
    },
  });
}

export function useProjectNotes(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projects.notes(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_notes")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProjectNote[];
    },
  });
}

export function useAddProjectNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, content }: { projectId: string; content: string }) => {
      const { error } = await supabase.from("project_notes").insert({
        project_id: projectId,
        content,
      });
      if (error) throw error;

      await supabase.from("project_activity_log").insert({
        project_id: projectId,
        action: "note_added",
        details: {},
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.notes(vars.projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.activity(vars.projectId) });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useStorageUrl } from "@/lib/storage";
import { queryKeys } from "@/lib/queryKeys";
import type { ProjectFile } from "@/lib/project-types";

export function useProjectFiles(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projects.files(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_files")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProjectFile[];
    },
  });
}

export function useUploadProjectFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      taskId,
      file,
    }: {
      projectId: string;
      taskId?: string;
      file: File;
    }) => {
      const path = `${projectId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("project-files")
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { error } = await supabase.from("project_files").insert({
        project_id: projectId,
        task_id: taskId || null,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type,
      });
      if (error) throw error;

      await supabase.from("project_activity_log").insert({
        project_id: projectId,
        task_id: taskId || null,
        action: "file_added",
        details: { file_name: file.name },
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.files(vars.projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.activity(vars.projectId) });
    },
  });
}

export function useDeleteProjectFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId: _projectId, filePath }: { id: string; projectId: string; filePath: string }) => {
      await supabase.storage.from("project-files").remove([filePath]);
      const { error } = await supabase.from("project_files").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.files(vars.projectId) });
    },
  });
}

export function useProjectFileUrl(filePath: string | undefined) {
  return useStorageUrl(filePath ? "project-files" : undefined, filePath);
}

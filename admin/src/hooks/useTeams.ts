import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { EmployeeTeam, EmployeeTeamMember } from "@/lib/types";

export function useTeams() {
  return useQuery({
    queryKey: queryKeys.teams.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_teams")
        .select("*, members:employee_team_members(team_id, employee_id, joined_at, employees(*))")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as EmployeeTeam[];
    },
  });
}

export function useTeam(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.teams.detail(id),
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("employee_teams")
        .select("*, members:employee_team_members(team_id, employee_id, joined_at, employees(*))")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as EmployeeTeam;
    },
    enabled: !!id,
  });
}

/**
 * Returns the current employee's team_id and the employee_ids of all members,
 * or null if they're not in a team. Consumers only need team_id + member ids.
 *
 * Implemented as two simple queries — the self-embed hint
 * `employee_team_members!team_id` doesn't reliably resolve in PostgREST and
 * intermittently 400s, which silently broke teammate-booking access for
 * installers (see useBookingTeam.ts for the same fix).
 */
export function useMyTeam(currentEmployeeId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.teams.myTeam(currentEmployeeId),
    queryFn: async (): Promise<{ team_id: string; members: { employee_id: string }[] } | null> => {
      if (!currentEmployeeId) return null;
      const { data: myRow, error: myErr } = await supabase
        .from("employee_team_members")
        .select("team_id")
        .eq("employee_id", currentEmployeeId)
        .maybeSingle();
      if (myErr) throw myErr;
      if (!myRow?.team_id) return null;
      const { data: rows, error } = await supabase
        .from("employee_team_members")
        .select("employee_id")
        .eq("team_id", myRow.team_id);
      if (error) throw error;
      return { team_id: myRow.team_id, members: (rows || []) as { employee_id: string }[] };
    },
    enabled: !!currentEmployeeId,
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; color?: string }) => {
      const { data, error } = await supabase
        .from("employee_teams")
        .insert({ name: input.name, color: input.color || "#6b7280" })
        .select()
        .single();
      if (error) throw error;
      return data as EmployeeTeam;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teams.all });
    },
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; color?: string; active?: boolean }) => {
      const { id, ...rest } = input;
      const { data, error } = await supabase
        .from("employee_teams")
        .update(rest)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as EmployeeTeam;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teams.all });
    },
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employee_teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teams.all });
    },
  });
}

export function useAddTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { team_id: string; employee_id: string }) => {
      const { data, error } = await supabase
        .from("employee_team_members")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as EmployeeTeamMember;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teams.all });
    },
  });
}

export function useRemoveTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { team_id: string; employee_id: string }) => {
      const { error } = await supabase
        .from("employee_team_members")
        .delete()
        .eq("team_id", input.team_id)
        .eq("employee_id", input.employee_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teams.all });
    },
  });
}

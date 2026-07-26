import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

export interface TimeEntry {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Get the currently open shift (clock_out IS NULL) */
export function useActiveShift(employeeId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.installer.activeShift(employeeId),
    queryFn: async () => {
      if (!employeeId) return null;
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .eq("employee_id", employeeId)
        .is("clock_out", null)
        .order("clock_in", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as TimeEntry | null;
    },
    enabled: !!employeeId,
    staleTime: 30_000,
  });
}

/** Get shift history for a given month (YYYY-MM) */
export function useShiftHistory(employeeId: string | undefined, month?: string) {
  const m = month || new Date().toISOString().slice(0, 7);
  const from = `${m}-01T00:00:00`;
  const to = `${m}-31T23:59:59`;

  return useQuery({
    queryKey: queryKeys.installer.shiftHistory(employeeId, m),
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .eq("employee_id", employeeId)
        .gte("clock_in", from)
        .lte("clock_in", to)
        .order("clock_in", { ascending: false });
      if (error) throw error;
      return data as TimeEntry[];
    },
    enabled: !!employeeId,
  });
}

/** Clock in — create a new time entry */
export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (employeeId: string) => {
      const { data, error } = await supabase
        .from("time_entries")
        .insert({ employee_id: employeeId })
        .select()
        .single();
      if (error) throw error;
      return data as TimeEntry;
    },
    onSuccess: (_data, employeeId) => {
      qc.invalidateQueries({ queryKey: queryKeys.installer.activeShift(employeeId) });
      qc.invalidateQueries({ queryKey: queryKeys.installer.shiftHistory(employeeId) });
    },
  });
}

/** Clock out — set clock_out on the active entry */
export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, breakMinutes, notes }: { entryId: string; employeeId: string; breakMinutes?: number; notes?: string }) => {
      const updates: Record<string, unknown> = { clock_out: new Date().toISOString() };
      if (breakMinutes !== undefined) updates.break_minutes = breakMinutes;
      if (notes !== undefined) updates.notes = notes;
      const { error } = await supabase
        .from("time_entries")
        .update(updates)
        .eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.installer.activeShift(vars.employeeId) });
      qc.invalidateQueries({ queryKey: queryKeys.installer.shiftHistory(vars.employeeId) });
    },
  });
}

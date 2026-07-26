import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { PalkallinenInternalCost, BookingEmployeeInternalCost } from "@/lib/types";

// All service/variant/addon defaults (employee_id IS NULL rows).
export function usePalkallinenDefaults() {
  return useQuery({
    queryKey: queryKeys.palkallinenInternalCosts.defaults,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("palkallinen_internal_costs")
        .select("*")
        .is("employee_id", null);
      if (error) throw error;
      return data as PalkallinenInternalCost[];
    },
  });
}

// Per-employee overrides.
export function usePalkallinenOverrides(employeeId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.palkallinenInternalCosts.byEmployee(employeeId),
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("palkallinen_internal_costs")
        .select("*")
        .eq("employee_id", employeeId!);
      if (error) throw error;
      return data as PalkallinenInternalCost[];
    },
  });
}

// Snapshotted cost for a booking (one row per booking_employee).
export function useBookingInternalCosts(bookingId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.palkallinenInternalCosts.bookingSnapshots(bookingId),
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_employee_internal_costs")
        .select("*")
        .eq("booking_id", bookingId!);
      if (error) throw error;
      return data as BookingEmployeeInternalCost[];
    },
  });
}

type Scope =
  | { kind: "service"; service_id: string }
  | { kind: "variant"; service_variant_id: string }
  | { kind: "addon"; addon_service_id: string };

// Upsert a default or override. Pass employeeId = null for service-level defaults.
// Writing 0 deletes the row (so "unset" doesn't create noise).
export async function savePalkallinenInternalCost(
  scope: Scope,
  employeeId: string | null,
  internal_cost_cents: number,
  secondary_internal_cost_cents?: number,
) {
  const base: Record<string, unknown> = {
    employee_id: employeeId,
    service_id: null,
    service_variant_id: null,
    addon_service_id: null,
  };
  if (scope.kind === "service") base.service_id = scope.service_id;
  if (scope.kind === "variant") base.service_variant_id = scope.service_variant_id;
  if (scope.kind === "addon") base.addon_service_id = scope.addon_service_id;

  // Find existing row
  let q = supabase.from("palkallinen_internal_costs").select("id").limit(1);
  if (employeeId) q = q.eq("employee_id", employeeId);
  else q = q.is("employee_id", null);
  if (scope.kind === "service") q = q.eq("service_id", scope.service_id);
  if (scope.kind === "variant") q = q.eq("service_variant_id", scope.service_variant_id);
  if (scope.kind === "addon") q = q.eq("addon_service_id", scope.addon_service_id);

  const { data: existing, error: selErr } = await q;
  if (selErr) throw selErr;

  const shouldDelete =
    internal_cost_cents === 0 && (secondary_internal_cost_cents ?? 0) === 0;

  if (existing && existing.length > 0) {
    const id = (existing[0] as { id: string }).id;
    if (shouldDelete) {
      const { error } = await supabase.from("palkallinen_internal_costs").delete().eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("palkallinen_internal_costs")
        .update({
          internal_cost_cents,
          secondary_internal_cost_cents: secondary_internal_cost_cents ?? 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    }
  } else if (!shouldDelete) {
    const { error } = await supabase.from("palkallinen_internal_costs").insert({
      ...base,
      internal_cost_cents,
      secondary_internal_cost_cents: secondary_internal_cost_cents ?? 0,
    });
    if (error) throw error;
  }
}

export function useInvalidatePalkallinenCosts() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.palkallinenInternalCosts.all });
  };
}

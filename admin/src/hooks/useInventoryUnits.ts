import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { InventoryUnit, InventoryUnitStatus } from "@/lib/types";

const UNIT_SELECT =
  "*, products(id, name, sku, brand, model, images, indoor_component_id, outdoor_component_id)";

// ─── List units (filterable) ────────────────────────────────────────────────

interface UnitFilters {
  productId?: string;
  status?: InventoryUnitStatus;
  pairId?: string;
  bookingId?: string;
  search?: string;
  limit?: number;
}

export function useInventoryUnits(filters: UnitFilters = {}) {
  return useQuery({
    queryKey: queryKeys.inventory.units(filters),
    queryFn: async () => {
      let query = supabase
        .from("inventory_units")
        .select(UNIT_SELECT)
        .order("received_at", { ascending: false });

      if (filters.productId) query = query.eq("product_id", filters.productId);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.pairId) query = query.eq("pair_id", filters.pairId);
      if (filters.bookingId) query = query.eq("assigned_booking_id", filters.bookingId);
      if (filters.search) query = query.ilike("serial_number", `%${filters.search}%`);
      if (filters.limit) query = query.limit(filters.limit);

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as InventoryUnit[];
    },
  });
}

// ─── Units for a single booking ─────────────────────────────────────────────

export function useUnitsByBooking(bookingId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inventory.unitsByBooking(bookingId),
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_units")
        .select(UNIT_SELECT)
        .eq("assigned_booking_id", bookingId!)
        .order("created_at");
      if (error) throw error;
      return data as unknown as InventoryUnit[];
    },
  });
}

// ─── Receive a batch of units ───────────────────────────────────────────────

export interface ReceiveUnitsInput {
  product_id: string;
  serial_numbers: string[]; // empty strings allowed → null serial
  notes?: string;
}

export function useReceiveUnits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReceiveUnitsInput) => {
      if (input.serial_numbers.length === 0) {
        throw new Error("Vähintään yksi yksikkö vaaditaan");
      }
      const rows = input.serial_numbers.map((sn) => ({
        product_id: input.product_id,
        serial_number: sn.trim() || null,
        status: "in_stock" as const,
        notes: input.notes?.trim() || null,
      }));
      const { data, error } = await supabase
        .from("inventory_units")
        .insert(rows)
        .select(UNIT_SELECT);
      if (error) throw error;
      return data as unknown as InventoryUnit[];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-units"] });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
    },
  });
}

// ─── Update a single unit (mainly to edit SN / notes / status) ──────────────

export interface UpdateUnitInput {
  id: string;
  serial_number?: string | null;
  notes?: string | null;
  status?: InventoryUnitStatus;
}

export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateUnitInput) => {
      const { id, ...patch } = input;
      const { data, error } = await supabase
        .from("inventory_units")
        .update(patch)
        .eq("id", id)
        .select(UNIT_SELECT)
        .single();
      if (error) throw error;
      return data as unknown as InventoryUnit;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-units"] });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
    },
  });
}

// ─── Delete a unit (e.g. mistyped, returned to supplier) ────────────────────

export function useDeleteUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-units"] });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
    },
  });
}

// ─── Assign single unit (no pair) to booking ────────────────────────────────

export interface AssignSingleInput {
  unit_id: string;
  booking_id: string;
  installer_id?: string | null;
  installation_date?: string | null;
}

export function useAssignSingleUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AssignSingleInput) => {
      const { data, error } = await supabase
        .from("inventory_units")
        .update({
          assigned_booking_id: input.booking_id,
          assigned_installer_id: input.installer_id ?? null,
          installation_date: input.installation_date ?? null,
          status: "reserved",
        })
        .eq("id", input.unit_id)
        .select(UNIT_SELECT)
        .single();
      if (error) throw error;
      return data as unknown as InventoryUnit;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-units"] });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
    },
  });
}

// ─── Assign indoor + outdoor as a pair to booking ───────────────────────────

export interface AssignPairInput {
  indoor_unit_id: string;
  outdoor_unit_id: string;
  booking_id: string;
  installer_id?: string | null;
  installation_date?: string | null;
}

export function useAssignPair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AssignPairInput) => {
      const pairId = crypto.randomUUID();
      const patch = {
        pair_id: pairId,
        assigned_booking_id: input.booking_id,
        assigned_installer_id: input.installer_id ?? null,
        installation_date: input.installation_date ?? null,
        status: "reserved" as const,
      };
      const { data, error } = await supabase
        .from("inventory_units")
        .update(patch)
        .in("id", [input.indoor_unit_id, input.outdoor_unit_id])
        .select(UNIT_SELECT);
      if (error) throw error;
      return data as unknown as InventoryUnit[];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-units"] });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
    },
  });
}

// ─── Unassign (return to in_stock, clear pair + booking) ────────────────────

export function useUnassignUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (unitId: string) => {
      // First fetch the unit to see if it has a pair — if so, unassign both
      const { data: unit, error: fetchErr } = await supabase
        .from("inventory_units")
        .select("id, pair_id")
        .eq("id", unitId)
        .single();
      if (fetchErr) throw fetchErr;

      const patch = {
        pair_id: null,
        assigned_booking_id: null,
        assigned_installer_id: null,
        installation_date: null,
        status: "in_stock" as const,
      };

      if (unit.pair_id) {
        const { error } = await supabase
          .from("inventory_units")
          .update(patch)
          .eq("pair_id", unit.pair_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("inventory_units")
          .update(patch)
          .eq("id", unitId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-units"] });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
    },
  });
}

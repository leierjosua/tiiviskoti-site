import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";

// One product line on a booking that still needs (or could need) stock allocation.
export interface AllocationLine {
  lineId: string;
  product: Product; // the bundle/standalone product the booking line references
  isSplit: boolean;
  needed: number;
  assigned: number; // sets/units already reserved for this product on this booking
  remaining: number; // needed - assigned
  availableSets: number; // full sets/units currently in stock (split: min indoor/outdoor)
  fulfillable: number; // min(remaining, availableSets) — how many we can allocate now
}

export interface BookingNeed {
  bookingId: string;
  bookingNumber: number | null;
  bookingDate: string;
  timeSlot: string | null;
  employeeId: string | null;
  installerName: string | null;
  customerName: string;
  address: string | null;
  postalCode: string | null;
  lines: AllocationLine[];
  fullyAssigned: boolean; // every line has remaining === 0
  anyFulfillable: boolean; // at least one line can be allocated from stock now
}

const ACTIVE_BOOKING_STATUSES = ["confirmed", "pending"];

interface NameRel {
  first_name: string | null;
  last_name: string | null;
}

interface LineRow {
  id: string;
  product_id: string;
  quantity: number;
  bookings: {
    id: string;
    booking_number: number | null;
    booking_date: string;
    time_slot: string | null;
    employee_id: string | null;
    address: string | null;
    postal_code: string | null;
    customers: NameRel | NameRel[] | null;
    employees: NameRel | NameRel[] | null;
  } | null;
}

function first<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function fullName(rel: NameRel | null): string | null {
  if (!rel) return null;
  return [rel.first_name, rel.last_name].filter(Boolean).join(" ").trim() || null;
}

/**
 * Allocation board: upcoming bookings (date asc) that need products, annotated with
 * how many sets are already reserved and how many can be allocated from current stock.
 */
export function useAllocationBoard() {
  return useQuery({
    queryKey: ["allocation-board"],
    queryFn: async (): Promise<BookingNeed[]> => {
      const today = new Date().toISOString().slice(0, 10);

      const [linesRes, productsRes, stockRes] = await Promise.all([
        supabase
          .from("booking_line_items")
          .select(
            "id, product_id, quantity, bookings!inner(id, booking_number, booking_date, time_slot, employee_id, address, postal_code, status, customers(first_name, last_name), employees!bookings_employee_id_fkey(first_name, last_name))",
          )
          .eq("line_type", "product")
          .gte("bookings.booking_date", today)
          .in("bookings.status", ACTIVE_BOOKING_STATUSES)
          .not("product_id", "is", null),
        supabase
          .from("products")
          .select("id, name, sku, barcode, brand, model, images, indoor_component_id, outdoor_component_id, active"),
        supabase.from("inventory_units").select("product_id").eq("status", "in_stock"),
      ]);

      if (linesRes.error) throw linesRes.error;
      if (productsRes.error) throw productsRes.error;
      if (stockRes.error) throw stockRes.error;

      const productsById = new Map<string, Product>();
      for (const p of (productsRes.data || []) as unknown as Product[]) {
        productsById.set(p.id, p);
      }

      const stockByProduct = new Map<string, number>();
      for (const u of stockRes.data || []) {
        stockByProduct.set(u.product_id, (stockByProduct.get(u.product_id) || 0) + 1);
      }

      const lines = (linesRes.data || []) as unknown as LineRow[];
      const bookingIds = [
        ...new Set(lines.map((l) => l.bookings?.id).filter((x): x is string => !!x)),
      ];

      // Units already assigned to these bookings (to compute filled slots)
      const assignedByBooking = new Map<string, { product_id: string; pair_id: string | null }[]>();
      if (bookingIds.length > 0) {
        const assignedRes = await supabase
          .from("inventory_units")
          .select("product_id, pair_id, assigned_booking_id")
          .in("assigned_booking_id", bookingIds);
        if (assignedRes.error) throw assignedRes.error;
        for (const u of assignedRes.data || []) {
          const arr = assignedByBooking.get(u.assigned_booking_id!) || [];
          arr.push({ product_id: u.product_id, pair_id: u.pair_id });
          assignedByBooking.set(u.assigned_booking_id!, arr);
        }
      }

      const slotsAssigned = (bookingId: string, product: Product): number => {
        const units = assignedByBooking.get(bookingId) || [];
        const isSplit = !!(product.indoor_component_id && product.outdoor_component_id);
        if (isSplit) {
          const ids = [product.indoor_component_id!, product.outdoor_component_id!];
          const pairs = new Set<string>();
          for (const u of units) {
            if (ids.includes(u.product_id)) pairs.add(u.pair_id || `${u.product_id}`);
          }
          return pairs.size;
        }
        return units.filter((u) => u.product_id === product.id).length;
      };

      const availableSets = (product: Product): number => {
        if (product.indoor_component_id && product.outdoor_component_id) {
          return Math.min(
            stockByProduct.get(product.indoor_component_id) || 0,
            stockByProduct.get(product.outdoor_component_id) || 0,
          );
        }
        return stockByProduct.get(product.id) || 0;
      };

      // Group lines by booking
      const byBooking = new Map<string, BookingNeed>();
      for (const l of lines) {
        const b = l.bookings;
        if (!b) continue;
        const product = productsById.get(l.product_id);
        if (!product) continue;

        const isSplit = !!(product.indoor_component_id && product.outdoor_component_id);
        const needed = l.quantity || 0;
        const assigned = slotsAssigned(b.id, product);
        const remaining = Math.max(0, needed - assigned);
        const avail = availableSets(product);
        const fulfillable = Math.min(remaining, avail);

        const line: AllocationLine = {
          lineId: l.id,
          product,
          isSplit,
          needed,
          assigned,
          remaining,
          availableSets: avail,
          fulfillable,
        };

        let need = byBooking.get(b.id);
        if (!need) {
          need = {
            bookingId: b.id,
            bookingNumber: b.booking_number,
            bookingDate: b.booking_date,
            timeSlot: b.time_slot,
            employeeId: b.employee_id,
            installerName: fullName(first(b.employees)),
            customerName: fullName(first(b.customers)) || "—",
            address: b.address,
            postalCode: b.postal_code,
            lines: [],
            fullyAssigned: true,
            anyFulfillable: false,
          };
          byBooking.set(b.id, need);
        }
        need.lines.push(line);
      }

      const result = [...byBooking.values()].map((need) => {
        need.fullyAssigned = need.lines.every((l) => l.remaining === 0);
        need.anyFulfillable = need.lines.some((l) => l.fulfillable > 0);
        return need;
      });

      // Only bookings that still need something; soonest first.
      return result
        .filter((n) => n.lines.some((l) => l.remaining > 0))
        .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));
    },
    staleTime: 15_000,
  });
}

// ─── Allocate from stock (FIFO) ────────────────────────────────────────────────

export interface AllocateInput {
  bookingId: string;
  employeeId: string | null;
  bookingDate: string; // YYYY-MM-DD → installation_date
  product: Product;
  count: number; // how many sets/units to allocate
}

/** Picks the oldest in-stock units (and pairs split components), reserves them to the booking. */
export function useAllocateFromStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AllocateInput): Promise<number> => {
      const { bookingId, employeeId, bookingDate, product, count } = input;
      if (count <= 0) return 0;
      const isSplit = !!(product.indoor_component_id && product.outdoor_component_id);

      const oldestInStock = async (productId: string) => {
        const { data, error } = await supabase
          .from("inventory_units")
          .select("id")
          .eq("product_id", productId)
          .eq("status", "in_stock")
          .order("received_at", { ascending: true })
          .limit(count);
        if (error) throw error;
        return (data || []).map((u) => u.id as string);
      };

      const patch = {
        assigned_booking_id: bookingId,
        assigned_installer_id: employeeId ?? null,
        installation_date: bookingDate,
        status: "reserved" as const,
      };

      let allocated = 0;
      if (isSplit) {
        const indoor = await oldestInStock(product.indoor_component_id!);
        const outdoor = await oldestInStock(product.outdoor_component_id!);
        const k = Math.min(indoor.length, outdoor.length, count);
        for (let i = 0; i < k; i++) {
          const pairId = crypto.randomUUID();
          const { error } = await supabase
            .from("inventory_units")
            .update({ ...patch, pair_id: pairId })
            .in("id", [indoor[i], outdoor[i]]);
          if (error) throw error;
          allocated++;
        }
      } else {
        const ids = await oldestInStock(product.id);
        if (ids.length > 0) {
          const { error } = await supabase.from("inventory_units").update(patch).in("id", ids);
          if (error) throw error;
          allocated = ids.length;
        }
      }
      return allocated;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allocation-board"] });
      qc.invalidateQueries({ queryKey: ["inventory-units"] });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
    },
  });
}

// ─── Scan-to-allocate: look up one in-stock unit by serial ─────────────────────

export interface ScannedUnit {
  id: string;
  productId: string;
  serial: string | null;
  productName: string;
  /** The bundle product to match against booking needs (self for singles, parent for split components). */
  bundle: Product;
  isSplitComponent: boolean;
  role: "indoor" | "outdoor" | null;
}

/**
 * Finds an in-stock unit by exact serial number and resolves which bundle product
 * it belongs to (so we can match it against booking needs). Returns null if no
 * in-stock unit matches.
 */
export async function findInStockUnitBySerial(serial: string): Promise<ScannedUnit | null> {
  const code = serial.trim();
  if (!code) return null;

  const { data: unit, error } = await supabase
    .from("inventory_units")
    .select("id, product_id, serial_number, products(id, name, sku, barcode, brand, model, images, indoor_component_id, outdoor_component_id, active)")
    .eq("serial_number", code)
    .eq("status", "in_stock")
    .order("received_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!unit) return null;

  const product = first(unit.products as unknown as Product | Product[]) as Product;

  // Is this product a component of a split bundle? If so, resolve the parent bundle.
  const { data: bundles } = await supabase
    .from("products")
    .select("id, name, sku, barcode, brand, model, images, indoor_component_id, outdoor_component_id, active")
    .or(`indoor_component_id.eq.${unit.product_id},outdoor_component_id.eq.${unit.product_id}`)
    .limit(1);
  const bundle = (bundles && bundles[0]) as Product | undefined;

  return {
    id: unit.id,
    productId: unit.product_id,
    serial: unit.serial_number,
    productName: product?.name || "—",
    bundle: bundle ?? product,
    isSplitComponent: !!bundle,
    role: bundle
      ? bundle.indoor_component_id === unit.product_id
        ? "indoor"
        : "outdoor"
      : null,
  };
}

// ─── Scan-to-allocate: assign one scanned unit to a booking ────────────────────

export interface AllocateScannedInput {
  unit: ScannedUnit;
  bookingId: string;
  employeeId: string | null;
  bookingDate: string; // YYYY-MM-DD → installation_date
}

/**
 * Reserves a single scanned unit to a booking. For split components, joins the
 * complementary box already assigned to the same booking into one pair_id (so the
 * set is counted once), otherwise starts a fresh pair_id.
 */
export function useAllocateScannedUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AllocateScannedInput): Promise<void> => {
      const { unit, bookingId, employeeId, bookingDate } = input;

      let pairId: string | null = null;
      if (unit.isSplitComponent && unit.role) {
        const otherComponentId =
          unit.role === "indoor" ? unit.bundle.outdoor_component_id : unit.bundle.indoor_component_id;

        // Find an incomplete pair on this booking: a complementary box already
        // assigned whose pair_id does not yet contain this role.
        const { data: others, error: othersErr } = await supabase
          .from("inventory_units")
          .select("pair_id")
          .eq("assigned_booking_id", bookingId)
          .eq("product_id", otherComponentId!)
          .not("pair_id", "is", null);
        if (othersErr) throw othersErr;

        for (const o of others || []) {
          const { count, error: cErr } = await supabase
            .from("inventory_units")
            .select("id", { count: "exact", head: true })
            .eq("pair_id", o.pair_id!)
            .eq("product_id", unit.productId);
          if (cErr) throw cErr;
          if (!count) {
            pairId = o.pair_id as string;
            break;
          }
        }
        if (!pairId) pairId = crypto.randomUUID();
      }

      const patch: Record<string, unknown> = {
        assigned_booking_id: bookingId,
        assigned_installer_id: employeeId ?? null,
        installation_date: bookingDate,
        status: "reserved",
      };
      if (pairId) patch.pair_id = pairId;

      const { error } = await supabase
        .from("inventory_units")
        .update(patch)
        .eq("id", unit.id)
        .eq("status", "in_stock"); // guard against double-allocation
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allocation-board"] });
      qc.invalidateQueries({ queryKey: ["inventory-units"] });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
    },
  });
}

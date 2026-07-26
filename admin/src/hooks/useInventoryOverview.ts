import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";

export interface InventoryOverviewRow extends Product {
  stock: number;            // in_stock unit count (for bundles: min of component stock)
  ordered: number;          // unreceived qty (for bundles: min of component qty)
  needed: number;           // sum of qty needed across ALL upcoming bookings (no time cap)
  /** Final shortfall after stock + ordered (max(0, needed - stock - ordered)). */
  shortage: number;
  /** Date when PHYSICAL stock (ignoring ordered) runs out — i.e. when next delivery must arrive. */
  stockRunsOutDate: string | null;
  /** How many bookings the physical stock alone covers. */
  coversByStock: number;
  /** Date when stock + ordered combined runs out — null if covers everything. */
  fullRunsOutDate: string | null;
  /** How many bookings stock + ordered combined covers. */
  coversByStockAndOrdered: number;
  urgency: "ok" | "low" | "out" | "ordered";
  /** True if this product is referenced as indoor/outdoor of another product (i.e. is a component). */
  isComponentOf: string | null;
  /** For bundles: breakdown of component stock counts (raw, not min). */
  componentBreakdown: {
    indoorStock: number;
    outdoorStock: number;
    indoorOrdered: number;
    outdoorOrdered: number;
  } | null;
}

const ACTIVE_BOOKING_STATUSES = ["confirmed", "pending"];
const ACTIVE_MO_STATUSES = ["draft", "placed", "confirmed", "shipped", "partially_received"];

export function useInventoryOverview() {
  return useQuery({
    queryKey: ["inventory-overview"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);

      const [productsRes, unitsRes, assignedRes, moLinesRes, bookingLinesRes] = await Promise.all([
        supabase.from("products").select("*, product_categories(name, slug)").eq("active", true),
        supabase.from("inventory_units").select("product_id").eq("status", "in_stock"),
        // Units already committed to a booking (reserved or installed). Used to net
        // out demand already fulfilled, so a consumed booking that lingers in
        // 'confirmed' (installer didn't mark it 'completed') no longer inflates "tarve".
        supabase
          .from("inventory_units")
          .select("assigned_booking_id, product_id, pair_id")
          .not("assigned_booking_id", "is", null)
          .in("status", ["reserved", "installed"]),
        supabase
          .from("manufacturer_order_lines")
          .select("product_id, quantity_ordered, quantity_received, manufacturer_orders!inner(status)")
          .in("manufacturer_orders.status", ACTIVE_MO_STATUSES),
        supabase
          .from("booking_line_items")
          .select("product_id, quantity, bookings!inner(id, booking_date, status)")
          .eq("line_type", "product")
          .gte("bookings.booking_date", today)
          .in("bookings.status", ACTIVE_BOOKING_STATUSES)
          .not("product_id", "is", null),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (unitsRes.error) throw unitsRes.error;
      if (assignedRes.error) throw assignedRes.error;
      if (moLinesRes.error) throw moLinesRes.error;
      if (bookingLinesRes.error) throw bookingLinesRes.error;

      // ─── Products (needed early to resolve split components when netting) ─
      const products = (productsRes.data || []) as (Product & {
        product_categories?: { name: string; slug: string };
      })[];
      const productsById = new Map(products.map((p) => [p.id, p]));

      // ─── Aggregate stock per product ──────────────────────────────────────
      const stockByProduct = new Map<string, number>();
      for (const u of unitsRes.data || []) {
        stockByProduct.set(u.product_id, (stockByProduct.get(u.product_id) || 0) + 1);
      }

      // ─── Units already assigned to each booking ───────────────────────────
      const assignedByBooking = new Map<string, { product_id: string; pair_id: string | null }[]>();
      for (const u of (assignedRes.data || []) as Array<{
        assigned_booking_id: string;
        product_id: string;
        pair_id: string | null;
      }>) {
        const arr = assignedByBooking.get(u.assigned_booking_id) || [];
        arr.push({ product_id: u.product_id, pair_id: u.pair_id });
        assignedByBooking.set(u.assigned_booking_id, arr);
      }

      // How many SETS of `sold` are already committed to `bookingId` (split: distinct
      // pair_id across the two components; single: unit count). Mirrors useAllocation.
      const fulfilledSets = (bookingId: string, sold: Product): number => {
        const units = assignedByBooking.get(bookingId) || [];
        if (sold.indoor_component_id && sold.outdoor_component_id) {
          const ids = [sold.indoor_component_id, sold.outdoor_component_id];
          const pairs = new Set<string>();
          for (const u of units) if (ids.includes(u.product_id)) pairs.add(u.pair_id || u.product_id);
          return pairs.size;
        }
        return units.filter((u) => u.product_id === sold.id).length;
      };

      // ─── Aggregate ordered (unreceived) per product ───────────────────────
      const orderedByProduct = new Map<string, number>();
      for (const l of moLinesRes.data as Array<{
        product_id: string;
        quantity_ordered: number | null;
        quantity_received: number | null;
      }>) {
        const remaining = (l.quantity_ordered || 0) - (l.quantity_received || 0);
        if (remaining > 0) {
          orderedByProduct.set(l.product_id, (orderedByProduct.get(l.product_id) || 0) + remaining);
        }
      }

      // ─── Group booking lines per product, sorted by date ─────────────────
      // Supabase typing returns the joined `bookings` relation as an array.
      // Cast via unknown so we can read the first row uniformly.
      const bookingLines = (bookingLinesRes.data || []) as unknown as Array<{
        product_id: string;
        quantity: number;
        bookings: { id: string; booking_date: string } | Array<{ id: string; booking_date: string }>;
      }>;
      // First collapse to one entry per (booking, product) so a booking's already-
      // committed units are netted once even if it has multiple lines of the product.
      const byBookingProduct = new Map<
        string,
        { bookingId: string; productId: string; date: string; qty: number }
      >();
      for (const li of bookingLines) {
        const rel = Array.isArray(li.bookings) ? li.bookings[0] : li.bookings;
        if (!rel?.booking_date) continue;
        const key = `${rel.id}|${li.product_id}`;
        const ex = byBookingProduct.get(key);
        if (ex) ex.qty += li.quantity;
        else
          byBookingProduct.set(key, {
            bookingId: rel.id,
            productId: li.product_id,
            date: rel.booking_date,
            qty: li.quantity,
          });
      }
      // Net out units already committed to that booking → unfulfilled demand only.
      const bookingsByProduct = new Map<string, Array<{ date: string; quantity: number }>>();
      for (const r of byBookingProduct.values()) {
        const sold = productsById.get(r.productId);
        const net = Math.max(0, r.qty - (sold ? fulfilledSets(r.bookingId, sold) : 0));
        if (net <= 0) continue;
        const arr = bookingsByProduct.get(r.productId) || [];
        arr.push({ date: r.date, quantity: net });
        bookingsByProduct.set(r.productId, arr);
      }
      // Sort each per-product list ascending by date
      for (const arr of bookingsByProduct.values()) {
        arr.sort((a, b) => a.date.localeCompare(b.date));
      }

      // ─── Aggregate needed per product (all upcoming bookings, no time cap) ─
      const neededByProduct = new Map<string, number>();
      for (const [pid, arr] of bookingsByProduct) {
        let qty = 0;
        for (const b of arr) qty += b.quantity;
        neededByProduct.set(pid, qty);
      }

      // ─── Build rows ──────────────────────────────────────────────────────
      // Build reverse-lookup: component product id → parent bundle id
      const componentParentMap = new Map<string, string>();
      for (const p of products) {
        if (p.indoor_component_id) componentParentMap.set(p.indoor_component_id, p.id);
        if (p.outdoor_component_id) componentParentMap.set(p.outdoor_component_id, p.id);
      }

      const rows: InventoryOverviewRow[] = products.map((p) => {
        let stock = stockByProduct.get(p.id) || 0;
        let ordered = orderedByProduct.get(p.id) || 0;
        let componentBreakdown: InventoryOverviewRow["componentBreakdown"] = null;
        if (p.indoor_component_id && p.outdoor_component_id) {
          const indoorStock = stockByProduct.get(p.indoor_component_id) || 0;
          const outdoorStock = stockByProduct.get(p.outdoor_component_id) || 0;
          const indoorOrdered = orderedByProduct.get(p.indoor_component_id) || 0;
          const outdoorOrdered = orderedByProduct.get(p.outdoor_component_id) || 0;
          stock = Math.min(indoorStock, outdoorStock);
          // Sets that arriving orders will complete, on top of what's already in
          // stock. Plain min(indoorOrdered, outdoorOrdered) undercounts when one
          // component arrived early (surplus stock) and only the other is still
          // on order — those incoming units pair with the surplus to finish sets.
          const setsWhenOrdersLand = Math.min(indoorStock + indoorOrdered, outdoorStock + outdoorOrdered);
          ordered = ordered + Math.max(0, setsWhenOrdersLand - stock);
          componentBreakdown = { indoorStock, outdoorStock, indoorOrdered, outdoorOrdered };
        }

        const isComponentOf = componentParentMap.get(p.id) || null;
        const needed = neededByProduct.get(p.id) || 0;

        // ─── Walk bookings to find when stock alone runs out ────────────
        const bookings = bookingsByProduct.get(p.id) || [];
        let stockAvail = stock;
        let stockRunsOutDate: string | null = null;
        let coversByStock = 0;
        for (const b of bookings) {
          if (stockAvail >= b.quantity) {
            stockAvail -= b.quantity;
            coversByStock++;
          } else {
            stockRunsOutDate = b.date;
            break;
          }
        }

        // ─── Walk again with ordered added — final shortage date ───────
        let combinedAvail = stock + ordered;
        let fullRunsOutDate: string | null = null;
        let coversByStockAndOrdered = 0;
        for (const b of bookings) {
          if (combinedAvail >= b.quantity) {
            combinedAvail -= b.quantity;
            coversByStockAndOrdered++;
          } else {
            fullRunsOutDate = b.date;
            break;
          }
        }

        const shortage = Math.max(0, needed - (stock + ordered));

        // Urgency
        let urgency: InventoryOverviewRow["urgency"];
        if (stockRunsOutDate !== null) {
          // Physical stock will run out at some point
          const daysUntilOut = Math.round(
            (new Date(stockRunsOutDate + "T00:00:00").getTime() -
              new Date(today + "T00:00:00").getTime()) /
              86_400_000,
          );
          const orderedCoversIt = ordered > 0 && fullRunsOutDate === null;
          if (stock === 0 && ordered === 0) urgency = "out";
          else if (daysUntilOut < 14 && !orderedCoversIt) urgency = "out";
          else if (daysUntilOut < 30 && !orderedCoversIt) urgency = "low";
          else if (shortage > 0) urgency = "low";
          else if (orderedCoversIt) urgency = "ordered";
          else urgency = "ok";
        } else if (stock === 0 && ordered > 0 && bookings.length > 0) {
          urgency = "ordered";
        } else {
          urgency = "ok";
        }

        return {
          ...p,
          stock,
          ordered,
          needed,
          shortage,
          stockRunsOutDate,
          coversByStock,
          fullRunsOutDate,
          coversByStockAndOrdered,
          urgency,
          isComponentOf,
          componentBreakdown,
        };
      });

      // Show: any product with stock, ordered, needed, OR stock_quantity tracked,
      // OR that is a bundle (has components). Both bundle and components are shown —
      // bundle row aggregates min(component stocks), component rows show their own.
      return rows.filter(
        (r) =>
          r.stock > 0 ||
          r.ordered > 0 ||
          r.needed > 0 ||
          r.stock_quantity != null ||
          (r.indoor_component_id && r.outdoor_component_id),
      );
    },
    staleTime: 30_000,
  });
}

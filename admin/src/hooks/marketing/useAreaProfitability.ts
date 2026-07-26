import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface RegionProfit {
  region_id: string;
  region_name: string;
  revenue_cents: number;
  revenue_ex_vat_cents: number;
  installer_cost_cents: number;
  device_cost_cents: number;
  sales_commission_cents: number;
  marketing_spend_cents: number;
  net_profit_cents: number;
  margin_percent: number;
  booking_count: number;
  avg_cpa_cents: number;
}

export interface MarketingRegion {
  id: string;
  name: string;
  postal_prefixes: string[];
  active: boolean;
  position: number;
}

export function useAreaProfitability(from: string, to: string) {
  return useQuery<RegionProfit[]>({
    queryKey: ["marketing-region-profitability", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_region_profitability", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data || []) as RegionProfit[];
    },
  });
}

export interface RegionServiceProfit extends RegionProfit {
  service_id: string;
  service_name: string;
}

export function useRegionServiceProfitability(from: string, to: string) {
  return useQuery<RegionServiceProfit[]>({
    queryKey: ["marketing-region-service-profitability", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_region_service_profitability", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data || []) as RegionServiceProfit[];
    },
  });
}

export interface RegionServiceLineItem {
  name: string;
  line_type: string;
  total_quantity: number;
  total_revenue_cents: number;
  total_installer_cost_cents: number;
  total_device_cost_cents: number;
}

/** Fetch line item breakdown for bookings in a region+service combo */
export function useRegionServiceLineItems(regionId: string | null, serviceId: string | null, from: string, to: string) {
  return useQuery<RegionServiceLineItem[]>({
    queryKey: ["region-service-line-items", regionId, serviceId, from, to],
    enabled: !!regionId && !!serviceId,
    queryFn: async () => {
      // 1. Get region postal prefixes
      const { data: region } = await supabase
        .from("marketing_regions")
        .select("postal_prefixes")
        .eq("id", regionId!)
        .single();
      if (!region) return [];

      // 2. Get bookings matching region + service + date range (with employee tier)
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, postal_code, employee_id, price_cents, employees!bookings_employee_id_fkey(tier), services(commission_alihankkija_cents, commission_yrittaja_cents)")
        .eq("service_id", serviceId!)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .gte("created_at", from + "T00:00:00")
        .lte("created_at", to + "T23:59:59");
      if (!bookings || bookings.length === 0) return [];

      // Filter by postal prefix
      const prefixes = region.postal_prefixes as string[];
      const matching = bookings.filter((b: any) => b.postal_code && prefixes.includes(b.postal_code.slice(0, 2)));
      if (matching.length === 0) return [];
      const matchingIds = matching.map((b: any) => b.id);

      // 3. Get line items with addon_service_id for commission lookup
      const { data: lineItems } = await supabase
        .from("booking_line_items")
        .select("booking_id, name, line_type, quantity, price_cents, material_cost_cents, cost_cents, product_id, addon_service_id")
        .in("booking_id", matchingIds);

      // Product cost fallback
      const productIds = new Set<string>();
      for (const li of lineItems || []) {
        if (li.product_id && !(li.material_cost_cents as number)) productIds.add(li.product_id as string);
      }
      const prodCostMap = new Map<string, number>();
      if (productIds.size > 0) {
        const { data: prods } = await supabase.from("products").select("id, cost_cents").in("id", [...productIds]);
        for (const p of prods || []) if (p.cost_cents) prodCostMap.set(p.id, p.cost_cents as number);
      }

      // Addon service commissions
      const addonIds = new Set<string>();
      for (const li of lineItems || []) {
        if (li.addon_service_id) addonIds.add(li.addon_service_id as string);
      }
      const addonCommMap = new Map<string, { ali: number; yri: number; mat: number }>();
      if (addonIds.size > 0) {
        const { data: addons } = await supabase
          .from("addon_services")
          .select("id, commission_alihankkija_cents, commission_yrittaja_cents, material_cost_cents")
          .in("id", [...addonIds]);
        for (const a of addons || []) {
          addonCommMap.set(a.id, {
            ali: (a.commission_alihankkija_cents as number) || 0,
            yri: (a.commission_yrittaja_cents as number) || 0,
            mat: (a.material_cost_cents as number) || 0,
          });
        }
      }

      // Booking → tier map
      const bookingTierMap = new Map<string, string>();
      for (const b of matching) {
        const tier = (b as any).employees?.tier;
        if (tier) bookingTierMap.set((b as any).id, tier);
      }

      // 4. Build entries
      const map = new Map<string, RegionServiceLineItem>();

      // Build a bookingId map for fast lookup
      const bookingMap = new Map<string, any>();
      for (const b of matching) bookingMap.set((b as any).id, b);

      // All line items — service type uses actual booking price & per-booking commission
      for (const li of lineItems || []) {
        const key = `${li.line_type}:${li.name}`;
        const existing = map.get(key) || { name: li.name as string, line_type: li.line_type as string, total_quantity: 0, total_revenue_cents: 0, total_installer_cost_cents: 0, total_device_cost_cents: 0 };
        const qty = (li.quantity as number) || 1;
        const tier = bookingTierMap.get(li.booking_id as string);

        if (li.line_type === "service") {
          // Revenue = actual booking price (aligns with parent row which uses b.price_cents)
          // Installer cost = commission per booking visit (not per qty)
          const booking = bookingMap.get(li.booking_id as string);
          existing.total_quantity += qty;
          existing.total_revenue_cents += Math.round(((booking as any)?.price_cents || 0) / 1.255);
          const svc = (booking as any)?.services;
          if (svc) {
            const tekija = tier === "alihankkija" ? (svc.commission_alihankkija_cents || 0)
              : tier === "yrittaja" ? (svc.commission_yrittaja_cents || 0) : 0;
            existing.total_installer_cost_cents += tekija * qty; // qty = number of service units
          }
        } else {
          existing.total_quantity += qty;
          existing.total_revenue_cents += ((li.price_cents as number) || 0) * qty;
        }

        if (li.line_type === "product") {
          const purchaseCost = (li.cost_cents as number) || 0;
          const matCost = (li.material_cost_cents as number) || 0;
          const costPerUnit = purchaseCost > 0 ? purchaseCost : matCost > 0 ? matCost : (li.product_id ? (prodCostMap.get(li.product_id as string) || 0) : 0);
          existing.total_device_cost_cents += costPerUnit * qty;
        } else if (li.line_type === "addon_service" && li.addon_service_id) {
          const comm = addonCommMap.get(li.addon_service_id as string);
          if (comm) {
            const tekija = tier === "alihankkija" ? comm.ali : tier === "yrittaja" ? comm.yri : 0;
            existing.total_installer_cost_cents += tekija * qty;
            if (comm.mat > 0) existing.total_device_cost_cents += comm.mat * qty;
          }
        } else if (li.line_type === "custom") {
          const purchaseCost = (li.cost_cents as number) || 0;
          const matCost = (li.material_cost_cents as number) || 0;
          const cost = purchaseCost > 0 ? purchaseCost : matCost;
          if (cost > 0) existing.total_device_cost_cents += cost * qty;
        }

        map.set(key, existing);
      }

      return [...map.values()].sort((a, b) => b.total_revenue_cents - a.total_revenue_cents);
    },
  });
}

export function useMarketingRegions() {
  return useQuery<MarketingRegion[]>({
    queryKey: ["marketing-regions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_regions")
        .select("*")
        .eq("active", true)
        .order("position");
      if (error) throw error;
      return data as MarketingRegion[];
    },
  });
}

export function useCreateRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (region: { name: string; postal_prefixes: string[] }) => {
      const { error } = await supabase.from("marketing_regions").insert(region);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-regions"] });
      qc.invalidateQueries({ queryKey: ["marketing-region-profitability"] });
    },
  });
}

export function useUpdateRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; name?: string; postal_prefixes?: string[]; active?: boolean }) => {
      const { id, ...updates } = params;
      const { error } = await supabase.from("marketing_regions").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-regions"] });
      qc.invalidateQueries({ queryKey: ["marketing-region-profitability"] });
    },
  });
}

export function useDeleteRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_regions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-regions"] });
      qc.invalidateQueries({ queryKey: ["marketing-region-profitability"] });
    },
  });
}

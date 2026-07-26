import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { SalesOffer, SalesOfferLineItem } from "@/lib/sales-types";

export function useOffersByOpportunity(oppId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.offers.byOpportunity(oppId),
    enabled: !!oppId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_offers")
        .select("*, sales_offer_line_items(*)")
        .eq("opportunity_id", oppId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SalesOffer[];
    },
  });
}

export function useSalesOffer(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.offers.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_offers")
        .select("*, sales_offer_line_items(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as SalesOffer;
    },
  });
}

export function useCreateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      opportunity_id: string;
      title?: string;
      customer_name?: string;
      customer_email?: string;
      customer_phone?: string;
      customer_address?: string;
      customer_postcode?: string;
      customer_city?: string;
      service_category_id?: string;
      created_by_salesperson_id?: string;
    }) => {
      const { data, error } = await supabase
        .from("sales_offers")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as SalesOffer;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.offers.byOpportunity(data.opportunity_id) });
    },
  });
}

export function useUpdateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SalesOffer> & { id: string }) => {
      const { error } = await supabase
        .from("sales_offers")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.offers.all });
      qc.invalidateQueries({ queryKey: queryKeys.sales.offers.detail(vars.id) });
    },
  });
}

// ─── Line Items ──────────────────────────────────────────────────────────────

export function useOfferLineItems(offerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.offers.lineItems(offerId),
    enabled: !!offerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_offer_line_items")
        .select("*")
        .eq("offer_id", offerId!)
        .order("sort_order");
      if (error) throw error;
      return data as SalesOfferLineItem[];
    },
  });
}

export function useCreateOfferLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      offer_id: string;
      line_type: string;
      item_id?: string;
      name: string;
      unit_price: number;
      quantity?: number;
      description?: string;
      sort_order?: number;
      labor_portion?: number;
      duration_minutes?: number;
      option_group?: string | null;
      is_upsell?: boolean;
      sales_commission_cents?: number;
    }) => {
      const { error } = await supabase
        .from("sales_offer_line_items")
        .insert(input);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.offers.lineItems(vars.offer_id) });
      qc.invalidateQueries({ queryKey: queryKeys.sales.offers.detail(vars.offer_id) });
    },
  });
}

export function useUpdateOfferLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, offer_id, ...updates }: Partial<SalesOfferLineItem> & { id: string; offer_id: string }) => {
      const { error } = await supabase
        .from("sales_offer_line_items")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.offers.lineItems(vars.offer_id) });
      qc.invalidateQueries({ queryKey: queryKeys.sales.offers.detail(vars.offer_id) });
    },
  });
}

export function useDeleteOfferLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, offer_id: _offer_id }: { id: string; offer_id: string }) => {
      const { error } = await supabase
        .from("sales_offer_line_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.offers.lineItems(vars.offer_id) });
      qc.invalidateQueries({ queryKey: queryKeys.sales.offers.detail(vars.offer_id) });
    },
  });
}

/** Offers expiring within the next 7 days (sent, not consumed) */
export function useExpiringOffers() {
  const now = new Date();
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return useQuery({
    queryKey: [...queryKeys.sales.offers.all, "expiring"],
    queryFn: async () => {
      const { data: tokens, error: tErr } = await supabase
        .from("sales_offer_tokens")
        .select("offer_id, expires_at")
        .is("consumed_at", null)
        .eq("is_revoked", false)
        .gte("expires_at", now.toISOString())
        .lte("expires_at", in7days.toISOString());
      if (tErr) throw tErr;
      if (!tokens || tokens.length === 0) return [];

      const offerIds = tokens.map((t: { offer_id: string }) => t.offer_id);
      const expiryMap = new Map(tokens.map((t: { offer_id: string; expires_at: string }) => [t.offer_id, t.expires_at]));

      const { data: offers, error: oErr } = await supabase
        .from("sales_offers")
        .select("id, offer_number, title, customer_name, total, status, opportunity_id")
        .in("id", offerIds)
        .eq("status", "sent");
      if (oErr) throw oErr;

      return (offers || []).map((o: { id: string; offer_number: string | null; title: string | null; customer_name: string | null; total: number; opportunity_id: string | null }) => ({
        ...o,
        expiresAt: expiryMap.get(o.id) as string,
        daysLeft: Math.ceil((new Date(expiryMap.get(o.id) as string).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      }));
    },
  });
}

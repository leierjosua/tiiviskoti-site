import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { SalesOpportunity, SalesOpportunityNote, SalesOpportunityEvent } from "@/lib/sales-types";

interface OpportunityFilters {
  status?: string;
  salespersonId?: string;
  search?: string;
  isArchived?: boolean;
}

export function useSalesOpportunities(filters?: OpportunityFilters) {
  return useQuery({
    queryKey: queryKeys.sales.opportunities.list(filters),
    queryFn: async () => {
      let query = supabase
        .from("sales_opportunities")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.salespersonId) query = query.eq("assigned_salesperson_id", filters.salespersonId);
      if (filters?.isArchived !== undefined) query = query.eq("is_archived", filters.isArchived);
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SalesOpportunity[];
    },
  });
}

export function useSalesOpportunity(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.opportunities.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_opportunities")
        .select("*, sales_offers(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as SalesOpportunity;
    },
  });
}

function normalizePhone(phone: string | undefined): string | null {
  if (!phone) return null;
  return phone.replace(/[\s\-()]/g, "").replace(/^0/, "+358") || null;
}

export function useCheckDuplicateOpportunity(email?: string, phone?: string) {
  const emailNorm = email?.trim().toLowerCase() || "";
  const phoneNorm = normalizePhone(phone) || "";
  const hasInput = emailNorm.length > 3 || phoneNorm.length > 5;

  return useQuery({
    queryKey: ["opportunity-dedup", emailNorm, phoneNorm],
    enabled: hasInput,
    queryFn: async () => {
      const conditions: string[] = [];
      if (emailNorm) conditions.push(`email_norm.eq.${emailNorm}`);
      if (phoneNorm) conditions.push(`phone_norm.eq.${phoneNorm}`);
      if (conditions.length === 0) return null;

      const { data } = await supabase
        .from("sales_opportunities")
        .select("id, name, email, phone, status, assigned_salesperson_id")
        .eq("is_archived", false)
        .or(conditions.join(","))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return data as SalesOpportunity | null;
    },
    staleTime: 5000,
  });
}

export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name?: string;
      phone?: string;
      email?: string;
      address?: string;
      postcode?: string;
      city?: string;
      channel?: string;
      status?: string;
      assigned_salesperson_id?: string;
    }) => {
      const emailNorm = input.email?.trim().toLowerCase() || null;
      const phoneNorm = normalizePhone(input.phone);

      const { data, error } = await supabase
        .from("sales_opportunities")
        .insert({
          ...input,
          email_norm: emailNorm,
          phone_norm: phoneNorm,
          external_source: "manual",
          external_id: `manual-${Date.now()}`,
        })
        .select()
        .single();
      if (error) throw error;
      return data as SalesOpportunity;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.all }),
  });
}

export function useUpdateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SalesOpportunity> & { id: string }) => {
      const { error } = await supabase
        .from("sales_opportunities")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.all });
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.detail(vars.id) });
    },
  });
}

export function useDeleteOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("sales_opportunities")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.all });
    },
  });
}

// ─── Duplicate Detection ────────────────────────────────────────────────────

export function useDuplicateOpportunities(
  oppId: string | undefined,
  emailNorm?: string | null,
  phoneNorm?: string | null,
) {
  const hasInput = !!emailNorm || !!phoneNorm;
  return useQuery({
    queryKey: ["opportunity-duplicates", oppId, emailNorm, phoneNorm],
    enabled: !!oppId && hasInput,
    queryFn: async () => {
      const conditions: string[] = [];
      if (emailNorm) conditions.push(`email_norm.eq.${emailNorm}`);
      if (phoneNorm) conditions.push(`phone_norm.eq.${phoneNorm}`);
      if (conditions.length === 0) return [];

      const { data, error } = await supabase
        .from("sales_opportunities")
        .select("id, name, email, phone, status, assigned_salesperson_id, created_at")
        .eq("is_archived", false)
        .neq("id", oppId!)
        .or(conditions.join(","))
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as SalesOpportunity[];
    },
    staleTime: 30_000,
  });
}

// ─── Merge ──────────────────────────────────────────────────────────────────

export function useMergeOpportunities() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ targetId, sourceId }: { targetId: string; sourceId: string }) => {
      // Move notes
      await supabase
        .from("sales_opportunity_notes")
        .update({ opportunity_id: targetId })
        .eq("opportunity_id", sourceId);

      // Move events
      await supabase
        .from("sales_opportunity_events")
        .update({ opportunity_id: targetId })
        .eq("opportunity_id", sourceId);

      // Move files
      await supabase
        .from("sales_opportunity_files")
        .update({ opportunity_id: targetId })
        .eq("opportunity_id", sourceId);

      // Move offers
      await supabase
        .from("sales_offers")
        .update({ opportunity_id: targetId })
        .eq("opportunity_id", sourceId);

      // Move emails
      await supabase
        .from("sales_emails")
        .update({ opportunity_id: targetId })
        .eq("opportunity_id", sourceId);

      // Move bookings
      await supabase
        .from("bookings")
        .update({ opportunity_id: targetId })
        .eq("opportunity_id", sourceId);

      // Move tags
      const { data: sourceTags } = await supabase
        .from("sales_opportunity_tags")
        .select("tag_name")
        .eq("opportunity_id", sourceId);
      if (sourceTags?.length) {
        const { data: existingTags } = await supabase
          .from("sales_opportunity_tags")
          .select("tag_name")
          .eq("opportunity_id", targetId);
        const existingNames = new Set((existingTags || []).map((t) => t.tag_name));
        const newTags = sourceTags.filter((t) => !existingNames.has(t.tag_name));
        if (newTags.length) {
          await supabase.from("sales_opportunity_tags").insert(
            newTags.map((t) => ({ opportunity_id: targetId, tag_name: t.tag_name })),
          );
        }
      }

      // Fill missing fields on target from source
      const { data: source } = await supabase
        .from("sales_opportunities")
        .select("name, phone, phone_norm, email, email_norm, address, postcode, city")
        .eq("id", sourceId)
        .single();

      const { data: target } = await supabase
        .from("sales_opportunities")
        .select("name, phone, email, address, postcode, city")
        .eq("id", targetId)
        .single();

      if (source && target) {
        const fill: Record<string, unknown> = {};
        if (!target.name && source.name) fill.name = source.name;
        if (!target.phone && source.phone) { fill.phone = source.phone; fill.phone_norm = source.phone_norm; }
        if (!target.email && source.email) { fill.email = source.email; fill.email_norm = source.email_norm; }
        if (!target.address && source.address) fill.address = source.address;
        if (!target.postcode && source.postcode) fill.postcode = source.postcode;
        if (!target.city && source.city) fill.city = source.city;
        if (Object.keys(fill).length > 0) {
          await supabase.from("sales_opportunities").update({ ...fill, updated_at: new Date().toISOString() }).eq("id", targetId);
        }
      }

      // Archive source
      await supabase.from("sales_opportunities").update({
        is_archived: true,
        archived_reason: `Yhdistetty diiliin ${targetId}`,
        updated_at: new Date().toISOString(),
      }).eq("id", sourceId);

      // Log merge event on target
      await supabase.from("sales_opportunity_events").insert({
        opportunity_id: targetId,
        type: "merged",
        payload: { merged_from_id: sourceId },
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.all });
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.detail(vars.targetId) });
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.detail(vars.sourceId) });
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.notes(vars.targetId) });
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.events(vars.targetId) });
    },
  });
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export function useOpportunityNotes(oppId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.opportunities.notes(oppId),
    enabled: !!oppId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_opportunity_notes")
        .select("*")
        .eq("opportunity_id", oppId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SalesOpportunityNote[];
    },
  });
}

export function useCreateOpportunityNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { opportunity_id: string; body: string }) => {
      const { error } = await supabase.from("sales_opportunity_notes").insert(input);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.notes(vars.opportunity_id) });
    },
  });
}

export function useUpdateOpportunityNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      oppId,
      body,
      show_to_installer,
    }: {
      id: string;
      oppId: string;
      body?: string;
      show_to_installer?: boolean;
    }) => {
      const patch: Record<string, unknown> = {};
      if (body !== undefined) patch.body = body;
      if (show_to_installer !== undefined) patch.show_to_installer = show_to_installer;
      const { error } = await supabase.from("sales_opportunity_notes").update(patch).eq("id", id);
      if (error) throw error;
      return oppId;
    },
    onSuccess: (oppId) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.notes(oppId) });
    },
  });
}

export function useDeleteOpportunityNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, oppId }: { id: string; oppId: string }) => {
      const { error } = await supabase.from("sales_opportunity_notes").delete().eq("id", id);
      if (error) throw error;
      return oppId;
    },
    onSuccess: (oppId) => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.notes(oppId) });
    },
  });
}

// ─── Events ──────────────────────────────────────────────────────────────────

export function useOpportunityEvents(oppId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.opportunities.events(oppId),
    enabled: !!oppId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_opportunity_events")
        .select("*")
        .eq("opportunity_id", oppId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SalesOpportunityEvent[];
    },
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Hooks for the CS AI rework: pricing reference, FAQs, brand voice prompt,
// and the AI quality feedback dashboard.

// ── Pricing reference ─────────────────────────────────────────────────────

export interface PricingRow {
  id: string;
  label: string;
  service_area: string | null;
  product_category: string | null;
  base_price_cents: number | null;
  price_display: string;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
}

export function useCSPricing() {
  return useQuery({
    queryKey: ["cs-pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_pricing_reference")
        .select("*")
        .order("label");
      if (error) throw error;
      return (data ?? []) as PricingRow[];
    },
  });
}

export function useUpsertCSPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PricingRow> & { label: string; price_display: string }) => {
      const payload = {
        ...row,
        updated_at: new Date().toISOString(),
      };
      const { error } = row.id
        ? await supabase.from("cs_pricing_reference").update(payload).eq("id", row.id)
        : await supabase.from("cs_pricing_reference").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cs-pricing"] }),
  });
}

export function useDeleteCSPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cs_pricing_reference").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cs-pricing"] }),
  });
}

// ── FAQs ──────────────────────────────────────────────────────────────────

export interface FAQRow {
  id: string;
  question: string;
  answer: string;
  topic: string | null;
  tags: string[];
  is_published: boolean;
  use_count: number;
  updated_at: string;
}

export function useCSFaqs() {
  return useQuery({
    queryKey: ["cs-faqs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_faqs")
        .select("id, question, answer, topic, tags, is_published, use_count, updated_at")
        .order("topic", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as FAQRow[];
    },
  });
}

export function useUpsertCSFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      row: Partial<FAQRow> & { question: string; answer: string }
    ) => {
      const payload = {
        ...row,
        updated_at: new Date().toISOString(),
      };
      const { error } = row.id
        ? await supabase.from("cs_faqs").update(payload).eq("id", row.id)
        : await supabase.from("cs_faqs").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cs-faqs"] }),
  });
}

export function useDeleteCSFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cs_faqs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cs-faqs"] }),
  });
}

// ── Brand voice prompt (stored in company_settings.cs_ai_brand_voice) ─────

export function useCSBrandVoice() {
  return useQuery({
    queryKey: ["cs-brand-voice"],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("cs_ai_brand_voice")
        .maybeSingle();
      return ((data as any)?.cs_ai_brand_voice ?? "") as string;
    },
  });
}

export function useUpdateCSBrandVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: string) => {
      const { data: existing } = await supabase
        .from("company_settings")
        .select("id")
        .maybeSingle();
      if (existing?.id) {
        const { error } = await supabase
          .from("company_settings")
          .update({ cs_ai_brand_voice: value })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_settings")
          .insert({ cs_ai_brand_voice: value });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cs-brand-voice"] }),
  });
}

// ── AI feedback quality dashboard ────────────────────────────────────────

export interface IntentStats {
  intent: string;
  approved: number;
  edited: number;
  discarded: number;
  total: number;
}

export function useAIFeedbackStats() {
  return useQuery({
    queryKey: ["cs-ai-feedback-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cs_ai_feedback")
        .select("intent, action")
        .gte(
          "created_at",
          new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
        )
        .limit(1000);
      if (error) throw error;

      const map = new Map<string, IntentStats>();
      for (const row of (data ?? []) as { intent: string | null; action: string }[]) {
        const intent = row.intent ?? "unknown";
        const entry =
          map.get(intent) ??
          ({ intent, approved: 0, edited: 0, discarded: 0, total: 0 } as IntentStats);
        if (row.action === "approved") entry.approved++;
        if (row.action === "edited") entry.edited++;
        if (row.action === "discarded") entry.discarded++;
        entry.total++;
        map.set(intent, entry);
      }
      return Array.from(map.values()).sort((a, b) => b.total - a.total);
    },
  });
}

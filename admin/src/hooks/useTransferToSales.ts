import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

interface TransferInput {
  submissionId: string;
  name: string;
  email: string;
  phone?: string;
  postalCode?: string;
  message?: string;
  formSlug: string;
  /** If provided, skip round-robin and assign directly to this salesperson */
  salespersonId?: string;
}

function normalizePhone(phone: string | undefined): string | null {
  if (!phone) return null;
  return phone.replace(/[\s\-()]/g, "").replace(/^0/, "+358") || null;
}

/**
 * Picks the next salesperson using round-robin with postal code awareness.
 * Mirrors the server-side pickNextSeller logic from automation-helpers.ts
 */
async function pickNextSeller(postalCode?: string): Promise<string | null> {
  // 1. Get active assignment settings
  const { data: settings, error: settingsErr } = await supabase
    .from("sales_inbound_assignment_settings")
    .select("*, employees(id, first_name, last_name, email)")
    .eq("is_active", true)
    .order("priority");

  if (settingsErr || !settings?.length) return null;

  // 2. Count this week's assignments per seller
  const sellerIds = settings.map((s) => s.salesperson_id);
  const monday = getMonday();

  const { data: counts } = await supabase.rpc("count_seller_assignments", {
    p_seller_ids: sellerIds,
    p_since: monday.toISOString(),
  });

  const countMap = new Map<string, number>();
  (counts ?? []).forEach((c: { salesperson_id: string; cnt: number }) => {
    countMap.set(c.salesperson_id, Number(c.cnt));
  });

  // 3. Postal code area matching (optional)
  let areaSellerIds: Set<string> | null = null;
  if (postalCode) {
    const { data: calendars } = await supabase
      .from("installer_calendars")
      .select("employee_id, calendar_service_areas(service_areas(postal_codes))")
      .eq("active", true);

    if (calendars?.length) {
      const matched = new Set<string>();
      for (const cal of calendars) {
        const areas = (cal as any).calendar_service_areas ?? [];
        for (const csa of areas) {
          const codes: string[] = csa.service_areas?.postal_codes ?? [];
          if (codes.includes(postalCode)) {
            matched.add(cal.employee_id);
            break;
          }
        }
      }
      if (matched.size > 0) areaSellerIds = matched;
    }
  }

  // 4. Pick best seller
  function pickFrom(candidateIds: Set<string> | null): string | null {
    let bestUnderLimit: string | null = null;
    let bestOverall: string | null = null;

    for (const s of settings!) {
      if (candidateIds && !candidateIds.has(s.salesperson_id)) continue;
      if (!bestOverall) bestOverall = s.salesperson_id;

      const cnt = countMap.get(s.salesperson_id) ?? 0;
      if (s.weekly_limit === 0 || cnt < s.weekly_limit) {
        if (!bestUnderLimit) bestUnderLimit = s.salesperson_id;
      }
    }

    return bestUnderLimit ?? bestOverall;
  }

  // Try area-matched first, then fallback to all
  if (areaSellerIds) {
    const areaPick = pickFrom(areaSellerIds);
    if (areaPick) return areaPick;
  }

  return pickFrom(null);
}

function getMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff, 0, 0, 0, 0);
}

export function useTransferToSales() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: TransferInput) => {
      const emailNorm = input.email.trim().toLowerCase();
      const phoneNorm = normalizePhone(input.phone);

      // Check for existing opportunity (dedup)
      const conditions: string[] = [];
      if (emailNorm) conditions.push(`email_norm.eq.${emailNorm}`);
      if (phoneNorm) conditions.push(`phone_norm.eq.${phoneNorm}`);

      if (conditions.length > 0) {
        const { data: existing } = await supabase
          .from("sales_opportunities")
          .select("id")
          .eq("is_archived", false)
          .or(conditions.join(","))
          .limit(1)
          .maybeSingle();

        if (existing) {
          throw new Error("Tälle asiakkaalle on jo olemassa myyntimahdollisuus.");
        }
      }

      // Pick seller: manual selection or round-robin
      const sellerId = input.salespersonId || await pickNextSeller(input.postalCode);

      // Create opportunity
      const { data: opp, error } = await supabase
        .from("sales_opportunities")
        .insert({
          name: input.name,
          email: input.email,
          email_norm: emailNorm,
          phone: input.phone || null,
          phone_norm: phoneNorm,
          postcode: input.postalCode || null,
          channel: "form",
          status: "new_inbound",
          assigned_salesperson_id: sellerId,
          external_source: "form",
          external_id: `form-submission-${input.submissionId}`,
          source_payload: {
            form_slug: input.formSlug,
            submission_id: input.submissionId,
            message: input.message,
            transferred_from_submission: true,
          },
        })
        .select()
        .single();

      if (error) throw error;

      // Log event
      await supabase.from("sales_opportunity_events").insert({
        opportunity_id: opp.id,
        type: "created",
        payload: {
          source: "form_submission",
          form_slug: input.formSlug,
          submission_id: input.submissionId,
          description: `Siirretty lomakevastauksesta myyntiin (${input.formSlug})`,
        },
      });

      return opp;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.all });
      qc.invalidateQueries({ queryKey: queryKeys.formSubmissions.all });
      qc.invalidateQueries({ queryKey: ["linked-opportunities"] });
    },
  });
}

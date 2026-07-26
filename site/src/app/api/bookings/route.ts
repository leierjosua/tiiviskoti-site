import { NextRequest, after } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { findAvailableTeam } from "@/lib/find-installer";
import { trackServerConversions } from "@/lib/tracking";
import { apiError, handleApiError, assertSupabaseResult } from "@/lib/api-utils";
import { rateLimit } from "@/lib/rate-limit";
import { queueBrandOrderEmails } from "@/lib/queue-order-emails";
import { postalCity } from "@/lib/postal";

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const addonSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  priceCents: z.number().int().nonnegative().default(0),
  durationMinutes: z.number().int().nonnegative().optional(),
});

const bookingBodySchema = z.object({
  serviceId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  postalCode: z.string().regex(/^\d{5}$/, "Virheellinen postinumero."),
  date: z.string().date(),
  timeSlot: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  address: z.string().min(1),
  notes: z.string().optional(),
  discountCode: z.string().optional(),
  sessionToken: z.string().optional(),
  leadSource: z.string().optional(),
  pageUrl: z.string().url().optional().or(z.literal("")),
  deviceCount: z.number().int().positive().optional(),
  addons: z.array(addonSchema).optional(),
  // Offer acceptance
  offerToken: z.string().optional(),
  offerSelections: z.object({
    selectedGroup: z.string().nullable(),
    selectedUpsellIds: z.array(z.string()),
  }).optional(),
  // Preferred employee (from prefill token)
  preferredEmployeeId: z.string().uuid().optional(),
  // Tracking fields
  eventId: z.string().optional(),
  fbc: z.string().optional(),
  fbp: z.string().optional(),
  gclid: z.string().optional(),
  fbclid: z.string().optional(),
  sellerRef: z.string().optional(),
  // Lead attribution
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
  referrer: z.string().optional(),
  landingPage: z.string().optional(),
});

type BookingBody = z.infer<typeof bookingBodySchema>;

/* ------------------------------------------------------------------ */
/*  POST handler                                                      */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const rateLimited = rateLimit(request, 5, 60_000);
    if (rateLimited) return rateLimited;

    const raw: unknown = await request.json();
    const parsed = bookingBodySchema.safeParse(raw);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return apiError(
        firstIssue?.message ?? "Virheellinen pyyntö.",
        400
      );
    }

    const {
      serviceId,
      variantId,
      postalCode,
      date,
      timeSlot,
      firstName,
      lastName,
      email,
      phone,
      address,
      notes,
      discountCode,
      sessionToken,
      leadSource,
      pageUrl,
      deviceCount,
      addons,
      offerToken,
      offerSelections,
      eventId,
      fbc,
      fbp,
      gclid,
      fbclid,
      sellerRef,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      referrer,
      landingPage,
      preferredEmployeeId,
    }: BookingBody = parsed.data;

    // Validate date is in the future (Finnish timezone)
    const finnishToday = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Helsinki" }));
    finnishToday.setHours(0, 0, 0, 0);
    const bookingDate = new Date(date + "T00:00:00");
    if (bookingDate < finnishToday) {
      return apiError("Virheellinen päivämäärä.", 400);
    }

    const supabase = createServiceClient();

    // 1. Look up the service
    const service = assertSupabaseResult(
      await supabase
        .from("services")
        .select("id, name, base_price_cents, duration_minutes, extra_duration_per_unit_minutes, min_scheduling_notice_hours, max_advance_days, required_employees, volume_pricing, payment_note, material_cost_cents, commission_yrittaja_cents, commission_alihankkija_cents, secondary_commission_yrittaja_cents, secondary_commission_alihankkija_cents, sales_commission_cents")
        .eq("id", serviceId)
        .eq("active", true)
        .single(),
      "Palvelua ei löytynyt"
    );

    // 1b. Validate scheduling notice (all times in Finnish timezone)
    const noticeHours = service.min_scheduling_notice_hours ?? 18;
    const finnishNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Helsinki" }));
    const earliestFI = new Date(finnishNow.getTime() + noticeHours * 60 * 60 * 1000);
    // date + timeSlot are Finnish local time — parse in same frame as earliestFI
    const slotDateTime = new Date(`${date}T${timeSlot}`);
    if (slotDateTime < earliestFI) {
      return apiError(
        "Valitsemasi aika on liian lähellä. Varaus on tehtävä vähintään " + noticeHours + " tuntia etukäteen.",
        400
      );
    }

    // 1b2. Validate max advance days
    const maxAdvanceDays = service.max_advance_days ?? null;
    if (maxAdvanceDays != null) {
      const latestFI = new Date(finnishNow.getTime() + maxAdvanceDays * 24 * 60 * 60 * 1000);
      if (slotDateTime > latestFI) {
        return apiError(
          `Varauksen voi tehdä enintään ${maxAdvanceDays} päivää etukäteen.`,
          400
        );
      }
    }

    // 1c. If variant specified, override price, duration and commissions from variant
    let effectivePriceCents = service.base_price_cents;
    let effectiveDuration = service.duration_minutes || 60;
    let variantCommissions: {
      commission_yrittaja_cents: number | null;
      commission_alihankkija_cents: number | null;
      secondary_commission_yrittaja_cents: number | null;
      secondary_commission_alihankkija_cents: number | null;
    } | null = null;
    let variantLabel: string | null = null;
    if (variantId) {
      const variant = assertSupabaseResult(
        await supabase
          .from("service_variants")
          .select("label, price_cents, duration_minutes, commission_yrittaja_cents, commission_alihankkija_cents, secondary_commission_yrittaja_cents, secondary_commission_alihankkija_cents")
          .eq("id", variantId)
          .eq("active", true)
          .single(),
        "Palvelun varianttia ei löytynyt"
      );
      effectivePriceCents = variant.price_cents;
      effectiveDuration = variant.duration_minutes;
      variantLabel = variant.label || null;
      // Only use variant commissions if they are explicitly set (non-null)
      if (variant.commission_yrittaja_cents != null || variant.commission_alihankkija_cents != null) {
        variantCommissions = variant;
      }
    }

    // 1d. If booking originates from an offer, fetch offer data early
    let offerData: {
      id: string;
      total: number;
      lineItems: { name: string; description: string | null; line_type: string; quantity: number; unit_price: number; total_price: number; labor_portion: number; duration_minutes: number | null; item_id: string | null; sort_order: number }[];
    } | null = null;

    if (offerToken) {
      let tokenRow: { offer_id: string } | null = null;
      const { data: directToken } = await supabase
        .from("sales_offer_tokens")
        .select("offer_id")
        .eq("token", offerToken)
        .eq("is_revoked", false)
        .is("consumed_booking_id", null)
        .maybeSingle();
      if (directToken) {
        tokenRow = directToken;
      } else if (/^\d+$/.test(offerToken) && parseInt(offerToken, 10) <= 1308) {
        // Legacy numeric link — resolve via offer_number to the latest usable token
        const { data: offerByNumber } = await supabase
          .from("sales_offers")
          .select("id")
          .eq("offer_number", offerToken)
          .maybeSingle();
        if (offerByNumber) {
          const { data: legacyToken } = await supabase
            .from("sales_offer_tokens")
            .select("offer_id")
            .eq("offer_id", offerByNumber.id)
            .eq("is_revoked", false)
            .is("consumed_booking_id", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (legacyToken) tokenRow = legacyToken;
        }
      }

      if (tokenRow) {
        const { data: offer } = await supabase
          .from("sales_offers")
          .select("id, total, discount, sales_offer_line_items(*)")
          .eq("id", tokenRow.offer_id)
          .single();

        if (offer) {
          // Filter line items based on customer selections (packages + upsells)
          let items = (offer.sales_offer_line_items || []).sort(
            (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
          );

          if (offerSelections) {
            items = items.filter((li: { option_group: string | null; is_upsell: boolean; id: string }) => {
              if (li.option_group) return li.option_group === offerSelections.selectedGroup;
              if (li.is_upsell) return offerSelections.selectedUpsellIds.includes(li.id);
              return true; // base items always included
            });
          }

          const selectedTotal = items.reduce(
            (sum: number, li: { total_price: number }) => sum + Number(li.total_price), 0
          );

          offerData = {
            id: offer.id,
            total: offerSelections ? selectedTotal - Number(offer.discount || 0) : Number(offer.total),
            lineItems: items,
          };
        }
      }
    }

    // 1e. Apply device count and selected addons
    const qty = typeof deviceCount === "number" && deviceCount > 0 ? deviceCount : 1;

    // Apply volume pricing if available (e.g. 2+ units at 250€ instead of 280€)
    if (qty > 1 && Array.isArray(service.volume_pricing) && service.volume_pricing.length > 0) {
      const sortedTiers = [...service.volume_pricing]
        .sort((a: { min_qty: number }, b: { min_qty: number }) => b.min_qty - a.min_qty);
      const tier = sortedTiers.find((t: { min_qty: number }) => qty >= t.min_qty);
      if (tier) {
        effectivePriceCents = (tier as { min_qty: number; price_cents: number }).price_cents;
      }
    }

    // Single-unit duration BEFORE qty/addon scaling — this is the slot-grid step
    // /api/availability used, and findAvailableTeam must validate on the same grid.
    const slotBaseDuration = effectiveDuration;

    // Adjust duration for multiple devices
    if (qty > 1) {
      const extraPerUnit = service.extra_duration_per_unit_minutes;
      if (extraPerUnit != null) {
        // duration_minutes + (qty - 1) * extra_duration_per_unit_minutes
        effectiveDuration = effectiveDuration + (qty - 1) * extraPerUnit;
      } else {
        // Full duration per unit if extra_duration not configured
        effectiveDuration = effectiveDuration * qty;
      }
    }

    // 1f. Resolve selected addons from DB — prices/durations are authoritative
    // server-side; client-sent values are used only for non-UUID custom addons.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const selectedAddonIds = (addons || [])
      .map((a) => a.id)
      .filter((id): id is string => UUID_RE.test(id || ""));
    const addonRowMap = new Map<string, { name: string; price_cents: number; duration_minutes: number }>();
    if (selectedAddonIds.length > 0) {
      const { data: addonRows, error: addonErr } = await supabase
        .from("addon_services")
        .select("id, name, price_cents, duration_minutes")
        .in("id", selectedAddonIds)
        .eq("active", true);
      if (addonErr) throw new Error(`Lisäpalvelujen haku epäonnistui: ${addonErr.message}`);
      for (const a of addonRows || []) addonRowMap.set(a.id, a);
      if (selectedAddonIds.some((id) => !addonRowMap.has(id))) {
        return apiError("Valittu lisäpalvelu ei ole enää saatavilla.", 400);
      }
    }

    // Addon minutes extend the booking's footprint on the installer's calendar
    // (kept separate from effectiveDuration so the service line item stays clean)
    const addonExtraMinutes = (addons || []).reduce((sum, a) => {
      const dbRow = a.id ? addonRowMap.get(a.id) : undefined;
      return sum + (dbRow ? dbRow.duration_minutes : a.durationMinutes || 0);
    }, 0);
    const totalDuration = effectiveDuration + addonExtraMinutes;

    // Capture unit price before qty multiplication (for emails/receipts)
    const unitPriceCents = effectivePriceCents;

    // For offer-based bookings, use the offer total instead of computed price
    if (offerData) {
      effectivePriceCents = Math.round(offerData.total * 100);
    } else {
      // price_cents = service price only; mount addons & selected addons are stored as line items
      effectivePriceCents = unitPriceCents * qty;
    }

    // Build service label for emails/calendar (computed once, stored on booking)
    const baseServiceName = variantLabel ? `${service.name} — ${variantLabel}` : service.name;
    const serviceLabel = qty > 1 ? `${baseServiceName} × ${qty}` : baseServiceName;

    // 2. Find available installers (team) for this date/time/postal code
    const requiredEmployees = service.required_employees || 1;
    const team = await findAvailableTeam(
      supabase,
      serviceId,
      postalCode,
      date,
      timeSlot,
      { duration: totalDuration, requiredCount: requiredEmployees, sessionToken, preferredEmployeeId, slotBaseDuration, addonIds: selectedAddonIds }
    );

    if (!team) {
      return apiError("Valitsemasi aika ei ole saatavilla.", 409);
    }

    const assignResult = team[0]; // primary installer

    // 2b. Validate and apply discount code
    let discountCodeId: string | null = null;
    let discountAmountCents = 0;
    let finalPriceCents = effectivePriceCents;

    if (discountCode) {
      const { data: dc, error: dcError } = await supabase
        .from("discount_codes")
        .select("id, discount_type, discount_value, max_uses, times_used, expires_at, active, commission_cents, employee_id")
        .ilike("code", discountCode.trim().toLowerCase())
        .eq("active", true)
        .single();

      if (dcError || !dc) {
        return apiError("Alennuskoodi ei ole voimassa.", 400);
      }

      if (dc.max_uses != null && dc.times_used >= dc.max_uses) {
        return apiError("Alennuskoodi on käytetty loppuun.", 400);
      }

      if (dc.expires_at && new Date(dc.expires_at) < new Date()) {
        return apiError("Alennuskoodi on vanhentunut.", 400);
      }

      if (dc.discount_type === "eur") {
        discountAmountCents = Math.min(dc.discount_value, effectivePriceCents);
      } else {
        discountAmountCents = Math.round(effectivePriceCents * dc.discount_value / 100);
      }

      finalPriceCents = effectivePriceCents - discountAmountCents;
      discountCodeId = dc.id;
    }

    // 3. Find or create customer (safe merge — never overwrite admin-added fields with nulls)
    const normalizedCustomerEmail = email.trim().toLowerCase();
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("email", normalizedCustomerEmail)
      .maybeSingle();

    let customer: { id: string };

    if (existingCustomer) {
      // Only update fields the booking form actually provides (non-empty values)
      const updates: Record<string, string> = {};
      if (firstName.trim()) updates.first_name = firstName.trim();
      if (lastName.trim()) updates.last_name = lastName.trim();
      if (phone.trim()) updates.phone = phone.trim();
      if (address.trim()) updates.address = address.trim();
      if (postalCode) updates.postal_code = postalCode;

      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await supabase
          .from("customers")
          .update(updates)
          .eq("id", existingCustomer.id);
        if (updateErr) throw new Error(`Asiakastietojen päivitys epäonnistui: ${updateErr.message}`);
      }
      customer = existingCustomer;
    } else {
      customer = assertSupabaseResult(
        await supabase
          .from("customers")
          .insert({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: normalizedCustomerEmail,
            phone: phone.trim(),
            address: address.trim(),
            postal_code: postalCode,
            notes: notes?.trim() || null,
          })
          .select("id")
          .single(),
        "Virhe asiakastietojen tallentamisessa"
      );
    }

    // 3b. Find or create site for this address
    let siteId: string | null = null;
    if (address?.trim() && postalCode) {
      const { data: existingSite } = await supabase
        .from("customer_sites")
        .select("id")
        .eq("customer_id", customer.id)
        .eq("address", address.trim())
        .eq("postal_code", postalCode)
        .maybeSingle();

      if (existingSite) {
        siteId = existingSite.id;
      } else {
        const { data: newSite } = await supabase
          .from("customer_sites")
          .insert({ customer_id: customer.id, address: address.trim(), postal_code: postalCode, city: postalCity(postalCode) || null })
          .select("id")
          .single();
        siteId = newSite?.id || null;
      }
    }

    // 4. Insert booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        customer_id: customer.id,
        service_id: service.id,
        variant_id: variantId || null,
        employee_id: assignResult.employeeId,
        calendar_id: assignResult.calendarId,
        plan: null,
        price_cents: 0, // trigger recalculates from line items
        discount_code_id: discountCodeId,
        discount_amount_cents: discountAmountCents,
        booking_date: date,
        time_slot: timeSlot,
        postal_code: postalCode,
        address: address.trim(),
        notes: notes?.trim() || null,
        device_count: qty,
        duration_minutes: totalDuration,
        service_label: serviceLabel,
        unit_price_cents: unitPriceCents,
        payment_note: service.payment_note || null,
        status: "confirmed",
        lead_source: leadSource || null,
        seller_ref: sellerRef || null,
        page_url: pageUrl || null,
        utm_source: utmSource || null,
        utm_medium: utmMedium || null,
        utm_campaign: utmCampaign || null,
        utm_term: utmTerm || null,
        utm_content: utmContent || null,
        // gclid/fbclid intentionally not stored — used only for server-side
        // conversion tracking (trackServerConversions) and not needed afterwards.
        referrer: referrer || null,
        landing_page: landingPage || null,
        site_id: siteId,
      })
      .select("id, booking_number")
      .single();

    if (bookingError) {
      if (bookingError.code === "23505") {
        return apiError("Valitsemasi aika on jo varattu.", 409);
      }
      throw new Error(`Booking insert failed: ${bookingError.message}`);
    }

    if (!booking) {
      throw new Error("Booking insert returned null data");
    }

    // 4b + 4c. Insert booking_employees + booking_line_items.
    // Wrapped in try/catch so that if either step fails, we roll back the
    // parent booking row (FK cascade removes any partial child rows). Without
    // this, a failed line_items insert would leave a 0 € ghost booking behind
    // (bookings.price_cents defaults to 0 and the trigger can only recalc from
    // existing line items).
    try {
      // 4b. Insert booking_employees for the team
      {
        // Fetch employee tiers + employee-specific commission overrides
        const empIds = team.map((t) => t.employeeId);
        const [empDataRes, empCommRes] = await Promise.all([
          supabase.from("employees").select("id, tier").in("id", empIds),
          supabase.from("employee_commissions").select("employee_id, service_id, commission_cents, secondary_commission_cents").in("employee_id", empIds).eq("service_id", serviceId),
        ]);
        const empData = empDataRes.data ?? [];
        const empComm = empCommRes.data ?? [];
        const tierMap = new Map(empData.map((e) => [e.id, e.tier]));
        const empCommMap = new Map(empComm.map((c) => [c.employee_id, c]));

        // Use variant commissions if available, otherwise fall back to service
        const commSource = variantCommissions || service;

        const beRows = team.map((member, i) => {
          const role = i === 0 ? "primary" : "secondary";
          const tier = tierMap.get(member.employeeId);
          const empOverride = empCommMap.get(member.employeeId);
          let commission = 0;

          if (tier === "alihankkija" && empOverride) {
            // Employee-specific override exists
            commission = role === "primary" ? empOverride.commission_cents : empOverride.secondary_commission_cents;
          } else if (role === "primary") {
            if (tier === "yrittaja") commission = commSource.commission_yrittaja_cents || 0;
            else if (tier === "alihankkija") commission = commSource.commission_alihankkija_cents || 0;
          } else {
            if (tier === "yrittaja") commission = commSource.secondary_commission_yrittaja_cents || 0;
            else if (tier === "alihankkija") commission = commSource.secondary_commission_alihankkija_cents || 0;
          }
          return {
            booking_id: booking.id,
            employee_id: member.employeeId,
            calendar_id: member.calendarId,
            role,
            commission_cents: commission,
            sort_order: i,
          };
        });
        const beResult = await supabase.from("booking_employees").insert(beRows);
        if (beResult.error) {
          throw new Error(`Tiimin linkitys varaukseen epäonnistui: ${beResult.error.message}`);
        }
      }

      // 4c. Insert booking_line_items.
      //
      // CRITICAL: Every row MUST share the same key set. PostgREST builds a
      // multi-row INSERT with columns = union of keys across all rows, and any
      // row that omits a key gets NULL injected for it — NOT the column's
      // DEFAULT. Mixing e.g. a product row (with cost_cents) and a service row
      // (without) therefore produces a NOT-NULL violation on cost_cents.
      // Keep all keys present with explicit null/0 fallbacks.
      type LineItemRow = {
        booking_id: string;
        line_type: string;
        addon_service_id: string | null;
        product_id: string | null;
        service_id: string | null;
        variant_id: string | null;
        name: string;
        notes: string | null;
        price_cents: number;
        quantity: number;
        duration_minutes: number;
        material_cost_cents: number;
        cost_cents: number;
        sort_order: number;
      };
      const lineItems: LineItemRow[] = [];
      let sortIdx = 0;

      if (offerData) {
        // Pre-fetch product cost prices for snapshotting
        const productIds = offerData.lineItems
          .filter((li: Record<string, unknown>) => (li.line_type === "device" || li.line_type === "product") && li.item_id)
          .map((li: Record<string, unknown>) => li.item_id as string);
        const productCostMap = new Map<string, number>();
        if (productIds.length > 0) {
          const { data: prods } = await supabase.from("products").select("id, cost_cents").in("id", productIds);
          for (const p of prods || []) productCostMap.set(p.id, p.cost_cents || 0);
        }

        // Copy ALL offer line items including service
        for (const li of offerData.lineItems) {
          // Map offer line_type → booking_line_items enum
          let mappedType: string;
          let addonServiceId: string | null = null;
          let productId: string | null = null;
          if (li.line_type === "service") {
            mappedType = "service";
          } else if (li.line_type === "device" || li.line_type === "product") {
            mappedType = "product";
            if (li.item_id) productId = li.item_id;
          } else if (li.line_type === "additional_service") {
            mappedType = "addon_service";
            if (li.item_id) addonServiceId = li.item_id;
          } else {
            mappedType = "custom";
          }
          lineItems.push({
            booking_id: booking.id,
            line_type: mappedType,
            addon_service_id: addonServiceId,
            product_id: productId,
            service_id: mappedType === "service" ? service.id : null,
            variant_id: mappedType === "service" ? (variantId || null) : null,
            name: li.name,
            notes: li.description || null,
            price_cents: Math.round(Number(li.unit_price) * 100),
            quantity: li.quantity,
            duration_minutes: li.duration_minutes || 0,
            material_cost_cents: 0,
            cost_cents: productId ? (productCostMap.get(productId) ?? 0) : 0,
            sort_order: sortIdx++,
          });
        }
      } else {
        // Standard booking: service + selected addons
        // Always add main service as a line item (single source of truth)
        lineItems.push({
          booking_id: booking.id,
          line_type: "service",
          addon_service_id: null,
          product_id: null,
          service_id: service.id,
          variant_id: variantId || null,
          name: variantLabel ? `${service.name} — ${variantLabel}` : service.name,
          notes: null,
          price_cents: unitPriceCents,
          quantity: qty,
          duration_minutes: effectiveDuration,
          material_cost_cents: service.material_cost_cents || 0,
          cost_cents: 0,
          sort_order: sortIdx++,
        });

        if (Array.isArray(addons)) {
          for (const addon of addons) {
            // DB row exists for every UUID addon (validated in step 1f) — its
            // price/duration/name win over whatever the client sent.
            const dbRow = addon.id ? addonRowMap.get(addon.id) : undefined;
            lineItems.push({
              booking_id: booking.id,
              line_type: dbRow ? "addon_service" : "custom",
              addon_service_id: dbRow ? (addon.id as string) : null,
              product_id: null,
              service_id: null,
              variant_id: null,
              name: dbRow ? dbRow.name : addon.name,
              notes: null,
              price_cents: dbRow ? dbRow.price_cents : addon.priceCents || 0,
              quantity: 1,
              duration_minutes: dbRow ? dbRow.duration_minutes : addon.durationMinutes || 0,
              material_cost_cents: 0,
              cost_cents: 0,
              sort_order: sortIdx++,
            });
          }
        }
      }

      if (lineItems.length > 0) {
        const liResult = await supabase.from("booking_line_items").insert(lineItems);
        if (liResult.error) {
          throw new Error(`Varauksen rivien tallennus epäonnistui: ${liResult.error.message}`);
        }
      }
    } catch (err) {
      // Roll back the parent booking. FK CASCADE wipes booking_employees and
      // booking_line_items (if any landed), releasing the slot for retry and
      // preventing 0 € ghost rows in admin.
      await supabase.from("bookings").delete().eq("id", booking.id);
      throw err;
    }

    // Mark offer as accepted if booking came from an offer token
    if (offerToken) {
      let tokenRow: { id: string; offer_id: string } | null = null;
      const { data: directToken } = await supabase
        .from("sales_offer_tokens")
        .select("id, offer_id")
        .eq("token", offerToken)
        .eq("is_revoked", false)
        .is("consumed_booking_id", null)
        .maybeSingle();
      if (directToken) {
        tokenRow = directToken;
      } else if (/^\d+$/.test(offerToken) && parseInt(offerToken, 10) <= 1308) {
        const { data: offerByNumber } = await supabase
          .from("sales_offers")
          .select("id")
          .eq("offer_number", offerToken)
          .maybeSingle();
        if (offerByNumber) {
          const { data: legacyToken } = await supabase
            .from("sales_offer_tokens")
            .select("id, offer_id")
            .eq("offer_id", offerByNumber.id)
            .eq("is_revoked", false)
            .is("consumed_booking_id", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (legacyToken) tokenRow = legacyToken;
        }
      }

      if (tokenRow) {
        // Mark token as consumed (with customer selections if present)
        const { error: tokenUpdateErr } = await supabase
          .from("sales_offer_tokens")
          .update({
            consumed_at: new Date().toISOString(),
            consumed_booking_id: booking.id,
            ...(offerSelections ? { customer_selections: offerSelections } : {}),
          })
          .eq("id", tokenRow.id);
        if (tokenUpdateErr) console.error("Tarjoustokenin päivitys epäonnistui:", tokenUpdateErr.message);

        // Recalculate offer total based on customer selections
        const offerUpdate: Record<string, unknown> = {
          status: "accepted",
          accepted_at: new Date().toISOString(),
        };

        if (offerSelections && (offerSelections.selectedGroup || offerSelections.selectedUpsellIds.length > 0)) {
          // Fetch all line items to recalculate
          const { data: allItems } = await supabase
            .from("sales_offer_line_items")
            .select("total_price, option_group, is_upsell, id")
            .eq("offer_id", tokenRow.offer_id);

          if (allItems) {
            const { data: offerRow } = await supabase
              .from("sales_offers")
              .select("discount")
              .eq("id", tokenRow.offer_id)
              .single();

            const activeItems = allItems.filter((li: { option_group: string | null; is_upsell: boolean; id: string }) => {
              if (li.option_group) return li.option_group === offerSelections.selectedGroup;
              if (li.is_upsell) return offerSelections.selectedUpsellIds.includes(li.id);
              return true;
            });

            const newSubtotal = activeItems.reduce((s: number, li: { total_price: number }) => s + Number(li.total_price), 0);
            const discount = Number(offerRow?.discount || 0);
            offerUpdate.subtotal = newSubtotal;
            offerUpdate.total = newSubtotal - discount;
          }
        }

        // Mark offer as accepted (with recalculated total if applicable)
        const { error: offerUpdateErr } = await supabase
          .from("sales_offers")
          .update(offerUpdate)
          .eq("id", tokenRow.offer_id);
        if (offerUpdateErr) console.error("Tarjouksen tilan päivitys epäonnistui:", offerUpdateErr.message);

        // Queue automatic order emails to brand suppliers
        try {
          await queueBrandOrderEmails(supabase, tokenRow.offer_id, offerSelections);
        } catch (e) {
          console.error("Order email queueing failed:", e);
        }

        // Update opportunity status if linked
        const { data: offer } = await supabase
          .from("sales_offers")
          .select("opportunity_id")
          .eq("id", tokenRow.offer_id)
          .single();

        if (offer?.opportunity_id) {
          const { error: oppErr } = await supabase
            .from("sales_opportunities")
            .update({ status: "voitettu", updated_at: new Date().toISOString() })
            .eq("id", offer.opportunity_id);
          if (oppErr) console.error("Myyntimahdollisuuden päivitys epäonnistui:", oppErr.message);

          // Link booking to the opportunity
          await supabase.from("bookings").update({ opportunity_id: offer.opportunity_id }).eq("id", booking.id);
        }
      }
    }

    // Auto-create sales commission for seller ref bookings
    if (sellerRef) {
      try {
        const { data: refEmployee } = await supabase
          .from("employees")
          .select("id, first_name, last_name")
          .eq("ref_code", sellerRef)
          .eq("active", true)
          .single();

        if (refEmployee) {
          // Use the service's sales_commission_cents (same rate as offer-based sales)
          const commissionCents = service.sales_commission_cents || 0;
          if (commissionCents > 0) {
            await supabase.from("manual_commissions").insert({
              employee_id: refEmployee.id,
              booking_id: booking.id,
              amount_cents: commissionCents * qty,
              description: `Viitekoodi-provisio: ${serviceLabel} (ref=${sellerRef})`,
              commission_date: date,
            });
          }
        }
      } catch (e) {
        console.error("Seller ref commission creation failed:", e);
      }
    }

    // Increment discount code usage
    if (discountCodeId) {
      const { error: discountErr } = await supabase.rpc("increment_discount_usage", { code_id: discountCodeId });
      if (discountErr) console.error("Alennuskoodin käyttökerran päivitys epäonnistui:", discountErr.message);
    }

    // Server-side conversion tracking (fire-and-forget)
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    const conversionData = {
      eventId: eventId || `booking_${booking.id}`,
      email,
      phone,
      firstName,
      lastName,
      postalCode,
      value: finalPriceCents / 100,
      currency: "EUR",
      serviceName: service.name,
      clientIp,
      userAgent,
      fbc,
      fbp,
      gclid,
      pageUrl,
    };

    trackServerConversions(conversionData);

    // Clean up temp reservation
    if (sessionToken) {
      await supabase
        .from("temp_reservations")
        .delete()
        .eq("session_token", sessionToken);
    }

    // Send emails via outbox (reliable DB inserts)
    const emailErrors: string[] = [];

    // Customer confirmation email
    {
      const { error: custErr } = await supabase.from("email_outbox").insert({
        type: "booking",
        payload: { booking_id: booking.id, email_type: "confirmation" },
        sender_email: "info@lasikiilto.fi",
        status: "pending",
        scheduled_at: new Date().toISOString(),
        reference_type: "booking",
        reference_id: booking.id,
      });
      if (custErr) emailErrors.push(`Vahvistussähköposti: ${custErr.message}`);
    }

    // Installer new job emails — skip employees who opted out of new-job emails
    const teamEmpIds = team.map((m) => m.employeeId);
    let emailEmpIds: string[] = teamEmpIds;
    if (teamEmpIds.length > 0) {
      const { data: prefs } = await supabase
        .from("employees")
        .select("id, notify_new_job")
        .in("id", teamEmpIds);
      const optedIn = new Set((prefs || []).filter((e: { notify_new_job: boolean | null }) => e.notify_new_job !== false).map((e: { id: string }) => e.id));
      emailEmpIds = teamEmpIds.filter((id) => optedIn.has(id));
    }
    for (const empId of emailEmpIds) {
      const { error: instErr } = await supabase.from("email_outbox").insert({
        type: "booking",
        payload: { booking_id: booking.id, email_type: "installer_new_job", employee_id: empId },
        sender_email: "info@lasikiilto.fi",
        status: "pending",
        scheduled_at: new Date().toISOString(),
        reference_type: "booking",
        reference_id: booking.id,
      });
      if (instErr) emailErrors.push(`Asentajan sähköposti (${empId}): ${instErr.message}`);
    }

    // Persist email errors to booking for admin visibility
    if (emailErrors.length > 0) {
      console.error("Sähköpostivirheet varaukselle", booking.id, emailErrors);
      await supabase.from("bookings")
        .update({ email_error: emailErrors.join("; ").slice(0, 500) })
        .eq("id", booking.id);
    }

    // Create Google Calendar event — runs after the response is sent.
    // Must use after() so Vercel keeps the runtime alive until the fetch completes;
    // bare fire-and-forget gets killed when the response returns and the call never reaches the edge function.
    after(async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-booking-calendar-event`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ booking_id: booking.id }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          console.error("Calendar event creation failed for booking", booking.id, res.status, txt);
        }
      } catch (err) {
        console.error("Calendar event creation failed for booking", booking.id, err);
      }
    });

    // Push notifications (fire-and-forget)
    const pushHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    };
    const pushUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-notification`;
    const customerName = `${firstName} ${lastName}`.trim();
    const priceStr = `${Math.round(finalPriceCents / 100)} €`;
    const primaryEmpId = team[0]?.employeeId || assignResult.employeeId;

    // Resolve installer name for admin notification
    const { data: empRow } = await supabase.from("employees").select("first_name").eq("id", primaryEmpId).single();
    const installerName = empRow?.first_name || "";

    // Admin push (after() — see calendar event note above)
    after(async () => {
      try {
        await fetch(pushUrl, {
          method: "POST",
          headers: pushHeaders,
          body: JSON.stringify({
            roles: ["admin"],
            title: "Uusi varaus",
            body: `${customerName} – ${priceStr}${installerName ? ` – ${installerName}` : ""}`,
            data: { booking_number: String(booking.booking_number), type: "new_booking" },
          }),
        });
      } catch (err) {
        console.error("Push notification (admin) failed:", err);
      }
    });

    // Installer push
    const installerEmpIds = team.map((t) => t.employeeId);
    if (installerEmpIds.length > 0) {
      after(async () => {
        try {
          await fetch(pushUrl, {
            method: "POST",
            headers: pushHeaders,
            body: JSON.stringify({
              employee_ids: installerEmpIds,
              title: "Uusi varaus sinulle",
              body: `${customerName} – ${priceStr}`,
              data: { booking_number: String(booking.booking_number), type: "booking_assigned" },
            }),
          });
        } catch (err) {
          console.error("Push notification (installer) failed:", err);
        }
      });
    }

    return Response.json({
      success: true,
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      discountAmountCents,
      finalPriceCents,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

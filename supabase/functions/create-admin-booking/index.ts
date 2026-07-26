import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/fetch-retry.ts";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { postalCity } from "../_shared/formatting.ts";

const log = createLogger("create-admin-booking");

interface LineItemInput {
  line_type: "service" | "addon_service" | "product" | "custom";
  addon_service_id?: string;
  product_id?: string;
  service_id?: string;
  variant_id?: string;
  name: string;
  price_cents: number;
  quantity: number;
  duration_minutes: number;
  material_cost_cents: number;
  cost_cents?: number;
}

interface CustomerInput {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  postal_code?: string;
  address?: string;
  company_name?: string | null;
  business_id?: string | null;
}

/**
 * POST /functions/v1/create-admin-booking
 *
 * Centralized booking creation for admin panel.
 * Handles: customer upsert → booking insert → line items → discount →
 *          calendar event → email notifications.
 *
 * Input: {
 *   customer: CustomerInput | { id: string },
 *   booking: { service_id, employee_id, calendar_id, price_cents,
 *              booking_date, time_slot, postal_code, address, notes,
 *              discount_code_id, discount_amount_cents, lead_source },
 *   line_items?: LineItemInput[]
 * }
 */
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // Verify caller is authenticated
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json();
    const { customer, booking, line_items, skip_notifications, skip_customer_email } = body;

    if (!customer || !booking) {
      return new Response(
        JSON.stringify({ error: "customer and booking required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Resolve customer (upsert or use existing ID)
    let customerId: string;

    if (customer.id) {
      customerId = customer.id;
    } else {
      const email = customer.email?.trim().toLowerCase() || null;
      const row = {
        first_name: customer.first_name?.trim() || null,
        last_name: customer.last_name?.trim() || null,
        email,
        phone: customer.phone?.trim() || null,
        postal_code: customer.postal_code || null,
        address: customer.address || null,
        company_name: customer.company_name || null,
        business_id: customer.business_id || null,
      };

      // Require at least one way to identify the customer
      if (!row.email && !row.phone && !row.company_name) {
        return new Response(
          JSON.stringify({ error: "Customer must have email, phone, or company name" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }

      // Upsert by email when present (NULL emails can't dedupe via onConflict)
      const query = email
        ? supabase.from("customers").upsert(row, { onConflict: "email" })
        : supabase.from("customers").insert(row);
      const { data: cust, error: custErr } = await query.select("id").single();

      if (custErr || !cust) {
        return new Response(
          JSON.stringify({ error: "Failed to create/find customer" }),
          { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }
      customerId = cust.id;
    }

    // 1b. Find or create site for this address
    let siteId: string | null = null;
    const bookingAddress = booking.address?.trim();
    const bookingPostalCode = booking.postal_code?.trim();
    if (customerId && bookingAddress && bookingPostalCode) {
      const { data: existingSite } = await supabase
        .from("customer_sites")
        .select("id")
        .eq("customer_id", customerId)
        .eq("address", bookingAddress)
        .eq("postal_code", bookingPostalCode)
        .maybeSingle();

      if (existingSite) {
        siteId = existingSite.id;
      } else {
        const { data: newSite } = await supabase
          .from("customer_sites")
          .insert({ customer_id: customerId, address: bookingAddress, postal_code: bookingPostalCode })
          .select("id")
          .single();
        siteId = newSite?.id || null;
      }
    }

    // 2. Insert booking
    const { data: newBooking, error: bookingErr } = await supabase
      .from("bookings")
      .insert({
        customer_id: customerId,
        service_id: booking.service_id || null,
        employee_id: booking.employee_id || null,
        calendar_id: booking.calendar_id || null,
        price_cents: booking.price_cents,
        booking_date: booking.booking_date,
        time_slot: booking.time_slot,
        postal_code: booking.postal_code || null,
        address: booking.address || null,
        notes: booking.notes || null,
        inside_notes: booking.inside_notes || null,
        device_count: booking.device_count || 1,
        duration_minutes: booking.duration_minutes || null,
        service_label: booking.service_label || null,
        unit_price_cents: booking.unit_price_cents || null,
        payment_note: booking.payment_note || null,
        status: booking.status || "confirmed",
        discount_code_id: booking.discount_code_id || null,
        discount_amount_cents: booking.discount_amount_cents || 0,
        lead_source: booking.lead_source || null,
        site_id: siteId,
        opportunity_id: booking.opportunity_id || null,
      })
      .select("id, booking_number")
      .single();

    if (bookingErr || !newBooking) {
      return new Response(
        JSON.stringify({ error: "Failed to create booking" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 2b. Insert booking_employees (team members)
    const teamMembers: { employee_id: string; calendar_id?: string; role: string }[] = booking.team || [];
    if (teamMembers.length > 0) {
      // Team explicitly provided
      const beRows = teamMembers.map((m: any, i: number) => ({
        booking_id: newBooking.id,
        employee_id: m.employee_id,
        calendar_id: m.calendar_id || null,
        role: m.role || (i === 0 ? "primary" : "secondary"),
        commission_cents: m.commission_cents || 0,
        sort_order: i,
      }));
      const { error: beErr } = await supabase.from("booking_employees").insert(beRows);
      if (beErr) throw new Error(`booking_employees insert failed: ${beErr.message}`);
    } else if (booking.employee_id) {
      // Single employee — create primary booking_employee
      const { error: beErr } = await supabase.from("booking_employees").insert({
        booking_id: newBooking.id,
        employee_id: booking.employee_id,
        calendar_id: booking.calendar_id || null,
        role: "primary",
        commission_cents: 0,
        sort_order: 0,
      });
      if (beErr) throw new Error(`booking_employees insert failed: ${beErr.message}`);
    }

    // 3. Insert line items
    if (line_items && line_items.length > 0) {
      const rows = line_items.map((item: LineItemInput, i: number) => ({
        booking_id: newBooking.id,
        line_type: item.line_type,
        addon_service_id: item.addon_service_id || null,
        product_id: item.product_id || null,
        service_id: item.line_type === "service"
          ? (item.service_id || booking.service_id || null)
          : null,
        variant_id: item.line_type === "service"
          ? (item.variant_id || booking.variant_id || null)
          : null,
        name: item.name,
        price_cents: item.price_cents,
        quantity: item.quantity || 1,
        duration_minutes: item.duration_minutes || 0,
        material_cost_cents: item.material_cost_cents || 0,
        cost_cents: item.cost_cents || 0,
        sort_order: i,
      }));
      const { error: liErr } = await supabase.from("booking_line_items").insert(rows);
      if (liErr) throw new Error(`booking_line_items insert failed: ${liErr.message}`);
    }

    // 4. Increment discount code usage
    if (booking.discount_code_id) {
      const { error: discErr } = await supabase.rpc("increment_discount_usage", { code_id: booking.discount_code_id });
      if (discErr) console.error("Discount usage increment failed:", discErr.message);
    }

    // 4a. Consume the sales offer token when booking was created from an existing offer.
    // Marks the token used so the customer link can no longer create a booking, and
    // flips the offer itself to "accepted" — editing is blocked after this point
    // (further changes happen on the booking instead).
    if (booking.offer_id) {
      const nowIso = new Date().toISOString();
      const { data: tokenRow } = await supabase
        .from("sales_offer_tokens")
        .select("id")
        .eq("offer_id", booking.offer_id)
        .is("consumed_at", null)
        .eq("is_revoked", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tokenRow?.id) {
        await supabase
          .from("sales_offer_tokens")
          .update({ consumed_at: nowIso, consumed_booking_id: newBooking.id })
          .eq("id", tokenRow.id);
      }

      const { data: offerRow } = await supabase
        .from("sales_offers")
        .select("id, opportunity_id, created_by_salesperson_id, customer_name")
        .eq("id", booking.offer_id)
        .single();

      await supabase
        .from("sales_offers")
        .update({ status: "accepted", accepted_at: nowIso })
        .eq("id", booking.offer_id);

      if (offerRow?.opportunity_id) {
        await supabase.from("sales_opportunity_events").insert({
          opportunity_id: offerRow.opportunity_id,
          salesperson_id: offerRow.created_by_salesperson_id || null,
          type: "offer_accepted",
          payload: {
            offer_id: offerRow.id,
            method: "admin_booking",
            booking_id: newBooking.id,
            booking_number: newBooking.booking_number,
            customer_name: offerRow.customer_name,
          },
        });
      }
    }

    // 5. Side effects
    const fnUrl = (name: string) => `${supabaseUrl}/functions/v1/${name}`;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceRoleKey;
    const fnHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
      "apikey": anonKey,
    };

    // Calendar event: create for every non-retroactive booking, even when the admin opted out of
    // customer notifications. send_notifications=false tells the calendar function to drop the
    // customer from attendees so the installer still sees the event but the customer gets nothing.
    // Completed-status bookings are retroactive (CompletedGig flow) and don't need a calendar entry.
    const isRetroactive = (booking.status || "confirmed") === "completed";
    if (!isRetroactive) {
      try {
        const calRes = await fetchWithRetry(fnUrl("create-booking-calendar-event"), {
          method: "POST", headers: fnHeaders,
          body: JSON.stringify({ booking_id: newBooking.id, send_notifications: !skip_notifications }),
        });
        if (!calRes.ok) {
          const errText = await calRes.text();
          console.error("Calendar event creation failed:", calRes.status, errText);
          await supabase.from("bookings")
            .update({ calendar_sync_error: `calendar: ${errText}`.slice(0, 500) })
            .eq("id", newBooking.id);
        }
      } catch (e) {
        console.error("Calendar event creation threw:", e);
        await supabase.from("bookings")
          .update({ calendar_sync_error: `calendar: ${String(e)}`.slice(0, 500) })
          .eq("id", newBooking.id);
      }
    }

    if (!skip_notifications) {
      // Build installer email outbox inserts for all team members
      const allTeamEmpIds: string[] = teamMembers.length > 0
        ? teamMembers.map((m: any) => m.employee_id)
        : booking.employee_id ? [booking.employee_id] : [];

      // Filter out employees who opted out of new-job email notifications
      let emailEmpIds: string[] = [];
      if (allTeamEmpIds.length > 0) {
        const { data: prefs } = await supabase
          .from("employees")
          .select("id, notify_new_job")
          .in("id", allTeamEmpIds);
        const optedIn = new Set((prefs || []).filter((e: any) => e.notify_new_job !== false).map((e: any) => e.id));
        emailEmpIds = allTeamEmpIds.filter((id) => optedIn.has(id));
      }

      const installerEmailInserts = emailEmpIds.map((empId: string) =>
        supabase.from("email_outbox").insert({
          type: "booking",
          sender_email: "info@tiiviskoti.fi",
          payload: { booking_id: newBooking.id, email_type: "installer_new_job", employee_id: empId },
          status: "pending",
          scheduled_at: new Date().toISOString(),
          reference_type: "booking",
          reference_id: newBooking.id,
        })
      );

      // Resolve names for push notification (fall back to company name)
      const customerName = `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
        || customer.company_name
        || "Asiakas";
      const priceCents = booking.unit_price_cents || 0;
      const priceStr = `${Math.round(priceCents / 100)} €`;
      let installerName = "";
      if (allTeamEmpIds.length > 0) {
        const { data: empRow } = await supabase.from("employees").select("first_name").eq("id", allTeamEmpIds[0]).single();
        installerName = empRow?.first_name || "";
      }

      const sideEffectLabels = [
        ...(skip_customer_email ? [] : ["confirmation_email"]),
        ...emailEmpIds.map(id => `installer_email_${id}`),
        "push_admin",
        "push_installer",
      ];
      const sideEffectResults = await Promise.allSettled([
        // Customer confirmation email (skipped when caller asks — e.g. pending
        // booking flow where a separate "vahvista aika" email is sent instead)
        ...(skip_customer_email
          ? []
          : [supabase.from("email_outbox").insert({
              type: "booking",
              sender_email: "info@tiiviskoti.fi",
              payload: { booking_id: newBooking.id, email_type: "confirmation" },
              status: "pending",
              scheduled_at: new Date().toISOString(),
              reference_type: "booking",
              reference_id: newBooking.id,
            })]),
        // Installer notification emails
        ...installerEmailInserts,
        // Push notification to admins
        fetchWithRetry(fnUrl("send-push-notification"), {
          method: "POST", headers: fnHeaders,
          body: JSON.stringify({
            roles: ["admin"],
            title: "Uusi varaus",
            body: `${customerName} – ${priceStr}${installerName ? ` – ${installerName}` : ""}`,
            data: { booking_number: String(newBooking.booking_number), type: "new_booking" },
          }),
        }),
        // Push notification to assigned installers
        allTeamEmpIds.length > 0
          ? fetchWithRetry(fnUrl("send-push-notification"), {
              method: "POST", headers: fnHeaders,
              body: JSON.stringify({
                employee_ids: allTeamEmpIds,
                title: "Uusi varaus sinulle",
                body: `${customerName} – ${priceStr}`,
                data: { booking_number: String(newBooking.booking_number), type: "booking_assigned" },
              }),
            })
          : Promise.resolve(),
      ]);

      // Log and persist any side effect failures
      const errors: string[] = [];
      sideEffectResults.forEach((r, i) => {
        if (r.status === "rejected") {
          const msg = `${sideEffectLabels[i]}: ${r.reason}`;
          console.error("Side effect failed:", msg);
          errors.push(msg);
        }
      });
      // Calendar errors are persisted earlier (in the dedicated calendar block) so we don't
      // touch calendar_sync_error here — that would clobber any error we already wrote.
      if (errors.length > 0) {
        await supabase.from("bookings")
          .update({
            email_error: errors.filter(e => e.includes("email")).join("; ").slice(0, 500) || null,
          })
          .eq("id", newBooking.id);
      }
    } else {
      log.info("Skipping customer/installer notifications", { booking_id: newBooking.id, retroactive: isRetroactive });
    }

    return new Response(
      JSON.stringify({
        success: true,
        bookingId: newBooking.id,
        bookingNumber: newBooking.booking_number,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    log.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});

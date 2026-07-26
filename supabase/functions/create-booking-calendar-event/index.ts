import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGoogleAccessToken } from "../_shared/google-auth.ts";

const CALENDAR_OWNER = "info@tiiviskoti.fi";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { booking_id } = await req.json();

    if (!booking_id) {
      return new Response(
        JSON.stringify({ error: "booking_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch booking with all relations
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        customers (*),
        services (*),
        employees!bookings_employee_id_fkey (*)
      `)
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customer = booking.customers;
    const service = booking.services;
    const employee = booking.employees;

    if (!customer || !service) {
      return new Response(
        JSON.stringify({ error: "Missing customer or service data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build event times — use raw date/time strings with Europe/Helsinki timezone
    // booking.duration_minutes is authoritative (variant + device count + addons);
    // service.duration_minutes is only a fallback for legacy rows without it.
    const durationMinutes = (booking.duration_minutes || service.duration_minutes || 60) + (service.transition_minutes || 0);
    const timeSlot = booking.time_slot.slice(0, 5); // "HH:MM"
    const [startH, startM] = timeSlot.split(":").map(Number);
    const totalEndMinutes = startH * 60 + startM + durationMinutes;
    const endH = Math.floor(totalEndMinutes / 60);
    const endM = totalEndMinutes % 60;
    const pad = (n: number) => String(n).padStart(2, "0");

    const startDateTimeStr = `${booking.booking_date}T${pad(startH)}:${pad(startM)}:00`;
    const endDateTimeStr = `${booking.booking_date}T${pad(endH)}:${pad(endM)}:00`;

    // Build description
    const address = booking.address || customer.address;
    const postalCode = booking.postal_code || customer.postal_code;
    const price = (booking.price_cents / 100).toFixed(2).replace(".", ",");
    const discount = booking.discount_amount_cents > 0
      ? (booking.discount_amount_cents / 100).toFixed(2).replace(".", ",")
      : null;

    const lines = [
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `📋  VARAUS #${booking.booking_number || booking.id}`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `🔧  ${service.name}`,
      `💰  ${price} € (sis. ALV)`,
      discount ? `🏷️  Alennus: -${discount} €` : null,
      ``,
      `───── Asiakas ─────`,
      `👤  ${customer.first_name} ${customer.last_name}`,
      `📞  ${customer.phone}`,
      `✉️  ${customer.email}`,
      `📍  ${address}${postalCode ? `, ${postalCode}` : ""}`,
      ``,
      employee ? `───── Tekijä ─────` : null,
      employee ? `👷  ${employee.first_name} ${employee.last_name}` : null,
      employee?.phone ? `📞  ${employee.phone}` : null,
      ``,
      booking.notes ? `───── Lisätiedot ─────` : null,
      booking.notes ? `📝  ${booking.notes}` : null,
    ].filter(Boolean).join("\n");

    // Build attendees
    const attendees: { email: string; displayName?: string; responseStatus?: string }[] = [];

    if (customer.email) {
      attendees.push({
        email: customer.email,
        displayName: `${customer.first_name} ${customer.last_name}`,
      });
    }

    if (employee?.email) {
      attendees.push({
        email: employee.email,
        displayName: `${employee.first_name} ${employee.last_name}`,
      });
    }


    const event = {
      summary: `${service.name} — ${customer.first_name} ${customer.last_name}`,
      description: lines,
      location: `${booking.address || customer.address}, ${booking.postal_code || customer.postal_code}`,
      start: {
        dateTime: startDateTimeStr,
        timeZone: "Europe/Helsinki",
      },
      end: {
        dateTime: endDateTimeStr,
        timeZone: "Europe/Helsinki",
      },
      attendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 60 },
          { method: "email", minutes: 1440 }, // 24h before
        ],
      },
    };

    // Create event via Google Calendar API
    // Impersonate the calendar owner (info@tiiviskoti.fi)
    const accessToken = await getGoogleAccessToken(
      "https://www.googleapis.com/auth/calendar",
      CALENDAR_OWNER
    );

    const existingEventId = booking.google_calendar_event_id;
    let calRes: Response;

    if (existingEventId) {
      // Update existing event (PUT)
      calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_OWNER)}/events/${encodeURIComponent(existingEventId)}?sendUpdates=none`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        }
      );
    } else {
      // Create new event (POST)
      calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_OWNER)}/events?sendUpdates=none`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        }
      );
    }

    if (!calRes.ok) {
      const errText = await calRes.text();
      console.error("Google Calendar API error:", calRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Failed to create/update calendar event", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const calEvent = await calRes.json();

    // Store the event ID on the booking
    if (!existingEventId) {
      await supabase
        .from("bookings")
        .update({ google_calendar_event_id: calEvent.id })
        .eq("id", booking_id);
    }

    return new Response(
      JSON.stringify({ success: true, eventId: calEvent.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-booking-calendar-event error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

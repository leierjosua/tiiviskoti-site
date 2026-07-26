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

    // Fetch the booking's Google Calendar event ID
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("google_calendar_event_id")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const eventId = booking.google_calendar_event_id;

    if (!eventId) {
      return new Response(
        JSON.stringify({ success: true, message: "No calendar event to delete" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete from Google Calendar
    const accessToken = await getGoogleAccessToken(
      "https://www.googleapis.com/auth/calendar",
      CALENDAR_OWNER
    );

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_OWNER)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    // 204 = success, 404/410 = already deleted (both fine)
    if (!calRes.ok && calRes.status !== 404 && calRes.status !== 410) {
      const errText = await calRes.text();
      console.error("Google Calendar delete error:", calRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Failed to delete calendar event", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clear the event ID from the booking
    await supabase
      .from("bookings")
      .update({ google_calendar_event_id: null })
      .eq("id", booking_id);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("delete-booking-calendar-event error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

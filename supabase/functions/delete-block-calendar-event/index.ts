import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGoogleAccessToken } from "../_shared/google-auth.ts";

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
    const { employee_id, date, start_time, end_time } = await req.json();

    if (!employee_id || !date) {
      return new Response(
        JSON.stringify({ error: "employee_id and date required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select("*")
      .eq("id", employee_id)
      .single();

    if (empError || !employee) {
      return new Response(
        JSON.stringify({ error: "Employee not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const calendarEmail = employee.google_calendar_id;
    if (!calendarEmail) {
      // No Google Calendar — nothing to delete
      return new Response(
        JSON.stringify({ success: true, deleted: false, reason: "no_google_calendar" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await getGoogleAccessToken(
      "https://www.googleapis.com/auth/calendar",
      calendarEmail
    );

    // Search for block events on this date
    const isFullDay = !start_time;
    let timeMin: string;
    let timeMax: string;

    if (isFullDay) {
      timeMin = `${date}T00:00:00+03:00`;
      timeMax = `${date}T23:59:59+03:00`;
    } else {
      timeMin = `${date}T${start_time}:00+03:00`;
      timeMax = `${date}T${end_time}:00+03:00`;
    }

    // List events in that time range
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      q: "Estetty",
      singleEvents: "true",
      maxResults: "10",
    });

    const listRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarEmail)}/events?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error("Google Calendar list error:", listRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Failed to list calendar events", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const listData = await listRes.json();
    const events = listData.items || [];

    // Find and delete matching block events (summary starts with "Estetty")
    let deletedCount = 0;
    for (const event of events) {
      if (event.summary && event.summary.startsWith("Estetty")) {
        const delRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarEmail)}/events/${encodeURIComponent(event.id)}?sendUpdates=none`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        if (delRes.ok || delRes.status === 204) {
          deletedCount++;
        } else {
          console.error("Failed to delete event", event.id, await delRes.text());
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, deleted: true, deletedCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("delete-block-calendar-event error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

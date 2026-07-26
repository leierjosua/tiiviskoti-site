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
    const { employee_id, date, start_time, end_time, reason } = await req.json();

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

    // Fetch employee
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
      return new Response(
        JSON.stringify({ error: "Employee has no Google Calendar configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build event — full day or time range
    const isFullDay = !start_time;
    const summary = reason ? `Estetty: ${reason}` : "Estetty aika (TiivisKoti)";

    let event: Record<string, unknown>;

    if (isFullDay) {
      // All-day event: use date format
      // Google expects end date to be exclusive (next day)
      const endDate = new Date(date + "T00:00:00");
      endDate.setDate(endDate.getDate() + 1);
      const endDateStr = endDate.toISOString().split("T")[0];

      event = {
        summary,
        description: `Estetty TiivisKoti-hallintapaneelista.\n${reason ? `Syy: ${reason}` : ""}`.trim(),
        start: { date },
        end: { date: endDateStr },
        transparency: "opaque",
      };
    } else {
      event = {
        summary,
        description: `Estetty TiivisKoti-hallintapaneelista.\n${reason ? `Syy: ${reason}` : ""}`.trim(),
        start: {
          dateTime: `${date}T${start_time}:00`,
          timeZone: "Europe/Helsinki",
        },
        end: {
          dateTime: `${date}T${end_time}:00`,
          timeZone: "Europe/Helsinki",
        },
        transparency: "opaque",
      };
    }

    // Create event in employee's Google Calendar
    const accessToken = await getGoogleAccessToken(
      "https://www.googleapis.com/auth/calendar",
      calendarEmail
    );

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarEmail)}/events?sendUpdates=none`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );

    if (!calRes.ok) {
      const errText = await calRes.text();
      console.error("Google Calendar API error:", calRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Failed to create calendar event", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const calEvent = await calRes.json();

    return new Response(
      JSON.stringify({ success: true, eventId: calEvent.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-block-calendar-event error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

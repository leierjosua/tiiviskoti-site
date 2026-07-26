import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGoogleAccessToken } from "../_shared/google-auth.ts";

/**
 * Webhook endpoint for Google Calendar push notifications.
 * Google sends a POST here whenever a watched calendar changes.
 *
 * Headers from Google:
 * - X-Goog-Channel-ID: our channel_id
 * - X-Goog-Resource-ID: Google's resource ID
 * - X-Goog-Resource-State: "sync" (initial) or "exists" (change happened)
 */

const SYNC_DAYS = 30;
const TIMEZONE = "Europe/Helsinki";
const SYNC_REASON = "google_calendar_sync";

Deno.serve(async (req) => {
  // Google sends a sync message when watch is first created — acknowledge it
  const resourceState = req.headers.get("X-Goog-Resource-State");
  if (resourceState === "sync") {
    return new Response(null, { status: 200 });
  }

  const channelId = req.headers.get("X-Goog-Channel-ID");
  if (!channelId) {
    return new Response("Missing channel ID", { status: 400 });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Look up which employee this channel belongs to
    const { data: watch, error: watchError } = await supabase
      .from("google_calendar_watches")
      .select("*")
      .eq("channel_id", channelId)
      .single();

    if (watchError || !watch) {
      console.warn(`Unknown channel_id: ${channelId}`);
      return new Response(null, { status: 200 }); // Acknowledge to stop retries
    }

    // 2. Get employee's installer calendars
    const { data: calendars } = await supabase
      .from("installer_calendars")
      .select("id")
      .eq("employee_id", watch.employee_id)
      .eq("active", true);

    if (!calendars || calendars.length === 0) {
      return new Response(JSON.stringify({ message: "No active calendars" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Get Google access token
    const accessToken = await getGoogleAccessToken(
      "https://www.googleapis.com/auth/calendar",
      watch.google_calendar_id
    );

    // 4. Build time range
    const now = new Date();
    const todayStr = toLocalDate(now, TIMEZONE);
    const timeMin = new Date(`${todayStr}T00:00:00+02:00`).toISOString();
    const futureDate = new Date(now.getTime() + SYNC_DAYS * 24 * 60 * 60 * 1000);
    const futureStr = toLocalDate(futureDate, TIMEZONE);
    const timeMax = new Date(`${futureStr}T23:59:59+02:00`).toISOString();

    // 5. Fetch FreeBusy
    const freeBusyRes = await fetch(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          timeZone: TIMEZONE,
          items: [{ id: watch.google_calendar_id }],
        }),
      }
    );

    if (!freeBusyRes.ok) {
      const errText = await freeBusyRes.text();
      console.error(`FreeBusy error for ${watch.google_calendar_id}:`, errText);
      return new Response(null, { status: 200 });
    }

    const freeBusyData = await freeBusyRes.json();
    const busyPeriods =
      freeBusyData.calendars?.[watch.google_calendar_id]?.busy || [];

    // 6. Convert busy periods to overrides
    const overrides = busyPeriodsToOverrides(busyPeriods, TIMEZONE);

    // 7. Update each installer calendar
    let totalCreated = 0;
    for (const cal of calendars) {
      // Delete old synced overrides from today onwards
      await supabase
        .from("calendar_overrides")
        .delete()
        .eq("calendar_id", cal.id)
        .eq("reason", SYNC_REASON)
        .gte("date", todayStr);

      if (overrides.length > 0) {
        const rows = overrides.map((o) => ({
          calendar_id: cal.id,
          date: o.date,
          start_time: o.start_time,
          end_time: o.end_time,
          override_type: "blocked" as const,
          reason: SYNC_REASON,
        }));

        const { error: insertError } = await supabase
          .from("calendar_overrides")
          .insert(rows);

        if (insertError) {
          console.error(`Insert error for calendar ${cal.id}:`, insertError);
        } else {
          totalCreated += rows.length;
        }
      }
    }

    console.log(
      `Synced ${watch.google_calendar_id}: ${totalCreated} overrides for ${calendars.length} calendars`
    );

    return new Response(
      JSON.stringify({ synced: true, overridesCreated: totalCreated }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("google-calendar-webhook error:", err);
    // Always return 200 to Google to prevent retries
    return new Response(null, { status: 200 });
  }
});

// --- Shared helpers (same as sync-google-calendars) ---

interface BusyPeriod {
  start: string;
  end: string;
}

interface Override {
  date: string;
  start_time: string | null;
  end_time: string | null;
}

function busyPeriodsToOverrides(
  busyPeriods: BusyPeriod[],
  timezone: string
): Override[] {
  const overrides: Override[] = [];

  for (const period of busyPeriods) {
    const start = new Date(period.start);
    const end = new Date(period.end);
    const startDate = toLocalDate(start, timezone);
    const endDate = toLocalDate(end, timezone);

    if (startDate === endDate) {
      const startTime = toLocalTime(start, timezone);
      const endTime = toLocalTime(end, timezone);

      if (startTime === "00:00:00" && (endTime === "00:00:00" || endTime === "23:59:00")) {
        overrides.push({ date: startDate, start_time: null, end_time: null });
      } else {
        overrides.push({ date: startDate, start_time: startTime, end_time: endTime });
      }
    } else {
      const current = new Date(start);
      while (toLocalDate(current, timezone) <= endDate) {
        const currentDate = toLocalDate(current, timezone);

        if (currentDate === startDate) {
          const startTime = toLocalTime(start, timezone);
          if (startTime === "00:00:00") {
            overrides.push({ date: currentDate, start_time: null, end_time: null });
          } else {
            overrides.push({ date: currentDate, start_time: startTime, end_time: null });
          }
        } else if (currentDate === endDate) {
          const endTime = toLocalTime(end, timezone);
          if (endTime !== "00:00:00") {
            overrides.push({ date: currentDate, start_time: null, end_time: endTime });
          }
        } else {
          overrides.push({ date: currentDate, start_time: null, end_time: null });
        }

        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
      }
    }
  }

  return overrides;
}

function toLocalDate(date: Date, timezone: string): string {
  return date.toLocaleDateString("sv-SE", { timeZone: timezone });
}

function toLocalTime(date: Date, timezone: string): string {
  return date.toLocaleTimeString("en-GB", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

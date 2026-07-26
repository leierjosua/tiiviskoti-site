import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGoogleAccessToken } from "../_shared/google-auth.ts";

const SYNC_DAYS = 30;
const TIMEZONE = "Europe/Helsinki";
const SYNC_REASON = "google_calendar_sync";

Deno.serve(async (req) => {
  try {
    // Verify service role auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch active installers with google_calendar_id
    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select("id, google_calendar_id")
      .eq("active", true)
      .contains("roles", ["installer"])
      .not("google_calendar_id", "is", null);

    if (empError) throw empError;
    if (!employees || employees.length === 0) {
      return new Response(
        JSON.stringify({ message: "No employees with Google Calendar ID", synced: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Build time range (today + 30 days) in Helsinki timezone
    const now = new Date();
    const todayStr = toLocalDate(now, TIMEZONE);
    const timeMin = new Date(`${todayStr}T00:00:00+02:00`).toISOString();
    const futureDate = new Date(now.getTime() + SYNC_DAYS * 24 * 60 * 60 * 1000);
    const futureStr = toLocalDate(futureDate, TIMEZONE);
    const timeMax = new Date(`${futureStr}T23:59:59+02:00`).toISOString();

    const results: { employeeId: string; overridesCreated: number; error?: string }[] = [];

    for (const emp of employees) {
      try {
        // 3. Get installer's calendars
        const { data: calendars } = await supabase
          .from("installer_calendars")
          .select("id")
          .eq("employee_id", emp.id)
          .eq("active", true);

        if (!calendars || calendars.length === 0) {
          results.push({ employeeId: emp.id, overridesCreated: 0 });
          continue;
        }

        // 4. Get Google access token (impersonate the employee's Google account)
        const accessToken = await getGoogleAccessToken(
          "https://www.googleapis.com/auth/calendar",
          emp.google_calendar_id!
        );

        // 5. Call FreeBusy API
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
              items: [{ id: emp.google_calendar_id }],
            }),
          }
        );

        if (!freeBusyRes.ok) {
          const errText = await freeBusyRes.text();
          results.push({ employeeId: emp.id, overridesCreated: 0, error: errText });
          continue;
        }

        const freeBusyData = await freeBusyRes.json();
        const busyPeriods =
          freeBusyData.calendars?.[emp.google_calendar_id!]?.busy || [];

        // 6. Convert busy periods to overrides (date + start_time + end_time)
        const overrides = busyPeriodsToOverrides(busyPeriods, TIMEZONE);

        // 7. For each installer calendar, delete old synced overrides and insert new ones
        let totalCreated = 0;
        for (const cal of calendars) {
          // Delete old google_calendar_sync overrides from today onwards
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

        results.push({ employeeId: emp.id, overridesCreated: totalCreated });
      } catch (err) {
        results.push({
          employeeId: emp.id,
          overridesCreated: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return new Response(
      JSON.stringify({ synced: results.length, results }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sync-google-calendars error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

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
      // Same-day event
      const startTime = toLocalTime(start, timezone);
      const endTime = toLocalTime(end, timezone);

      // If it spans the whole day (00:00 to 00:00 or 23:59), treat as full-day block
      if (startTime === "00:00:00" && (endTime === "00:00:00" || endTime === "23:59:00")) {
        overrides.push({ date: startDate, start_time: null, end_time: null });
      } else {
        overrides.push({ date: startDate, start_time: startTime, end_time: endTime });
      }
    } else {
      // Multi-day event: one override per day
      const current = new Date(start);
      while (toLocalDate(current, timezone) <= endDate) {
        const currentDate = toLocalDate(current, timezone);

        if (currentDate === startDate) {
          // First day: from start time to end of day
          const startTime = toLocalTime(start, timezone);
          if (startTime === "00:00:00") {
            overrides.push({ date: currentDate, start_time: null, end_time: null });
          } else {
            overrides.push({ date: currentDate, start_time: startTime, end_time: null });
          }
        } else if (currentDate === endDate) {
          // Last day: from start of day to end time
          const endTime = toLocalTime(end, timezone);
          if (endTime === "00:00:00") {
            // End is midnight = previous day was the last full day, skip
          } else {
            overrides.push({ date: currentDate, start_time: null, end_time: endTime });
          }
        } else {
          // Middle days: full day blocked
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

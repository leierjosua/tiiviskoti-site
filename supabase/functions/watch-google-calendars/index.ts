import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGoogleAccessToken } from "../_shared/google-auth.ts";

/**
 * Registers (or renews) Google Calendar push notification channels
 * for all active installers with a google_calendar_id.
 *
 * Call this once on setup, then daily via cron to renew expiring channels.
 * Google watch channels last max ~7 days.
 */

const WEBHOOK_URL = Deno.env.get("GOOGLE_CALENDAR_WEBHOOK_URL");
// Renew channels expiring within the next 2 days
const RENEW_WITHIN_MS = 2 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!WEBHOOK_URL) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_CALENDAR_WEBHOOK_URL not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
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
      return jsonResponse({ message: "No employees with Google Calendar ID", watched: 0 });
    }

    // 2. Get existing active watches
    const { data: existingWatches } = await supabase
      .from("google_calendar_watches")
      .select("*");

    const watchMap = new Map(
      (existingWatches || []).map((w: Watch) => [w.employee_id, w])
    );

    const now = Date.now();
    const results: { employeeId: string; action: string; error?: string }[] = [];

    for (const emp of employees) {
      const existing = watchMap.get(emp.id) as Watch | undefined;
      const expiresAt = existing ? new Date(existing.expiration).getTime() : 0;
      const needsRenewal = !existing || expiresAt - now < RENEW_WITHIN_MS;

      if (!needsRenewal) {
        results.push({ employeeId: emp.id, action: "skipped (still valid)" });
        continue;
      }

      try {
        // Stop existing watch if renewing
        if (existing) {
          await stopWatch(emp.google_calendar_id!, existing, supabase);
        }

        // Create new watch
        const accessToken = await getGoogleAccessToken(
          "https://www.googleapis.com/auth/calendar",
          emp.google_calendar_id!
        );

        const channelId = crypto.randomUUID();
        // Request max TTL (~7 days)
        const expiration = now + 7 * 24 * 60 * 60 * 1000;

        const watchRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(emp.google_calendar_id!)}/events/watch`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: channelId,
              type: "web_hook",
              address: WEBHOOK_URL,
              expiration,
              params: { ttl: "604800" }, // 7 days in seconds
            }),
          }
        );

        if (!watchRes.ok) {
          const errText = await watchRes.text();
          results.push({ employeeId: emp.id, action: "error", error: errText });
          continue;
        }

        const watchData = await watchRes.json();

        // Save watch to DB
        await supabase.from("google_calendar_watches").insert({
          employee_id: emp.id,
          google_calendar_id: emp.google_calendar_id,
          channel_id: watchData.id,
          resource_id: watchData.resourceId,
          expiration: new Date(Number(watchData.expiration)).toISOString(),
        });

        results.push({ employeeId: emp.id, action: "created" });
      } catch (err) {
        results.push({
          employeeId: emp.id,
          action: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 3. Clean up watches for employees no longer active/relevant
    const activeEmpIds = new Set(employees.map((e: { id: string }) => e.id));
    for (const [empId, watch] of watchMap) {
      if (!activeEmpIds.has(empId)) {
        const emp = employees.find((e: { id: string }) => e.id === empId);
        const calId = (watch as Watch).google_calendar_id;
        try {
          await stopWatch(calId, watch as Watch, supabase);
          results.push({ employeeId: empId, action: "removed (inactive)" });
        } catch {
          // Best effort cleanup
        }
      }
    }

    return jsonResponse({ watched: results.length, results });
  } catch (err) {
    console.error("watch-google-calendars error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

interface Watch {
  id: string;
  employee_id: string;
  google_calendar_id: string;
  channel_id: string;
  resource_id: string;
  expiration: string;
}

async function stopWatch(
  calendarId: string,
  watch: Watch,
  supabase: ReturnType<typeof createClient>
) {
  try {
    const accessToken = await getGoogleAccessToken(
      "https://www.googleapis.com/auth/calendar",
      calendarId
    );

    await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: watch.channel_id,
        resourceId: watch.resource_id,
      }),
    });
  } catch {
    // Google may return error if channel already expired, that's fine
  }

  await supabase
    .from("google_calendar_watches")
    .delete()
    .eq("id", watch.id);
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

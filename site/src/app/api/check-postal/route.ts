import { NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, handleApiError } from "@/lib/api-utils";
import { rateLimit } from "@/lib/rate-limit";

const checkPostalSchema = z.object({
  postal_code: z.string().regex(/^\d{5}$/, "Virheellinen postinumero"),
  service_id: z.string().uuid("Virheellinen palvelu-ID"),
});

/**
 * GET /api/check-postal?service_id=X&postal_code=Y
 *
 * Lightweight check: does any active installer calendar serve this
 * postal code for the given service? Returns { served: boolean }.
 */
export async function GET(request: NextRequest) {
  try {
    const rl = rateLimit(request, 20, 60_000);
    if (rl) return rl;

    const { searchParams } = new URL(request.url);
    const parsed = checkPostalSchema.safeParse({
      postal_code: searchParams.get("postal_code"),
      service_id: searchParams.get("service_id"),
    });

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const { service_id: serviceId, postal_code: postalCode } = parsed.data;

    const supabase = createServiceClient();

    // Find calendars that include this service
    const { data: calendars, error: calError } = await supabase
      .from("installer_calendars")
      .select("id, employee_id, calendar_services!inner(service_id), calendar_service_areas(service_area_id)")
      .eq("calendar_services.service_id", serviceId)
      .eq("active", true);

    if (calError) throw calError;

    if (!calendars || calendars.length === 0) {
      return Response.json({ served: false });
    }

    // Get service areas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const areaIds = [...new Set(calendars.flatMap((c: any) => (c.calendar_service_areas || []).map((csa: { service_area_id: string }) => csa.service_area_id)))];
    const { data: areas, error: areasError } = await supabase
      .from("service_areas")
      .select("id, postal_codes")
      .in("id", areaIds)
      .eq("active", true);

    if (areasError) throw areasError;

    const matchingAreaIds = new Set(
      (areas || [])
        .filter((a) => a.postal_codes?.includes(postalCode))
        .map((a) => a.id)
    );

    if (matchingAreaIds.size === 0) {
      return Response.json({ served: false });
    }

    // Check at least one active employee
    const employeeIds = [...new Set(calendars.map((c) => c.employee_id))];
    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select("id")
      .in("id", employeeIds)
      .eq("active", true);

    if (empError) throw empError;

    const activeEmployeeIds = new Set((employees || []).map((e) => e.id));

    // Calendars that match service + area + active employee
    const candidateCalendarIds = calendars
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((c: any) =>
        (c.calendar_service_areas || []).some((csa: { service_area_id: string }) => matchingAreaIds.has(csa.service_area_id)) &&
        activeEmployeeIds.has(c.employee_id)
      )
      .map((c) => c.id);

    if (candidateCalendarIds.length === 0) {
      return Response.json({ served: false });
    }

    // Served if any candidate calendar has at least one weekly slot OR a future available override.
    // (Overrides alone are valid — installer may open extra dates without recurring weekly availability.)
    const today = new Date().toISOString().slice(0, 10);
    const [weeklyRes, overrideRes] = await Promise.all([
      supabase
        .from("calendar_weekly_slots")
        .select("calendar_id")
        .in("calendar_id", candidateCalendarIds)
        .limit(1),
      supabase
        .from("calendar_overrides")
        .select("calendar_id")
        .in("calendar_id", candidateCalendarIds)
        .eq("override_type", "available")
        .gte("date", today)
        .limit(1),
    ]);

    if (weeklyRes.error) throw weeklyRes.error;
    if (overrideRes.error) throw overrideRes.error;

    const hasAvailability =
      (weeklyRes.data?.length ?? 0) > 0 || (overrideRes.data?.length ?? 0) > 0;

    return Response.json({ served: hasAvailability });
  } catch (error) {
    return handleApiError(error);
  }
}

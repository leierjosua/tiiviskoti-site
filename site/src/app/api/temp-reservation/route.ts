import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { findAvailableTeam } from "@/lib/find-installer";
import { apiError, handleApiError } from "@/lib/api-utils";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const HOLD_MINUTES = 5;

const PostSchema = z.object({
  serviceId: z.string().uuid(),
  postalCode: z.string().regex(/^\d{5}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeSlot: z.string().regex(/^\d{2}:\d{2}$/),
  variantId: z.string().uuid().optional().nullable(),
  preferredEmployeeId: z.string().uuid().optional().nullable(),
});

/**
 * POST /api/temp-reservation
 * Creates a temporary hold on a time slot for 5 minutes.
 */
export async function POST(request: NextRequest) {
  try {
    const rl = rateLimit(request, 10, 60_000);
    if (rl) return rl;

    const body = await request.json();
    const parsed = PostSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("serviceId (uuid), postalCode (5 digits), date (YYYY-MM-DD), timeSlot (HH:MM) required", 400);
    }

    const { serviceId, postalCode, date, timeSlot, variantId, preferredEmployeeId } = parsed.data;
    const supabase = createServiceClient();

    // Clean up expired reservations (non-blocking, table may not exist yet)
    await supabase.from("temp_reservations").delete().lt("expires_at", new Date().toISOString()).then(() => {});

    // If variant specified, use its duration
    let durationOverride: number | undefined;
    if (variantId) {
      const { data: variant } = await supabase
        .from("service_variants")
        .select("duration_minutes")
        .eq("id", variantId)
        .eq("active", true)
        .single();
      if (variant) durationOverride = variant.duration_minutes;
    }

    // Find an available installer (same logic as bookings)
    const team = await findAvailableTeam(
      supabase, serviceId, postalCode, date, timeSlot,
      { ...(durationOverride ? { duration: durationOverride, slotBaseDuration: durationOverride } : {}), ...(preferredEmployeeId ? { preferredEmployeeId } : {}) }
    );

    if (!team) {
      return apiError("Aika ei ole enää saatavilla.", 409);
    }

    const assignResult = team[0]; // primary installer

    // Fetch installer name
    const { data: installer } = await supabase
      .from("employees")
      .select("first_name")
      .eq("id", assignResult.employeeId)
      .single();
    const installerName = installer?.first_name || null;

    // Generate a unique session token
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();

    // Insert temp reservation
    const { error } = await supabase
      .from("temp_reservations")
      .insert({
        session_token: sessionToken,
        service_id: serviceId,
        variant_id: variantId || null,
        booking_date: date,
        time_slot: timeSlot,
        calendar_id: assignResult.calendarId,
        employee_id: assignResult.employeeId,
        expires_at: expiresAt,
      });

    if (error) {
      // If table doesn't exist yet, still allow proceeding (graceful degradation)
      if (error.code === "42P01") {
        return NextResponse.json({
          sessionToken,
          expiresAt,
          calendarId: assignResult.calendarId,
          employeeId: assignResult.employeeId,
          installerName,
        });
      }
      console.error("Temp reservation insert error:", error);
      return apiError("Varauksen pitäminen epäonnistui.", 500);
    }

    return NextResponse.json({
      sessionToken,
      expiresAt,
      calendarId: assignResult.calendarId,
      employeeId: assignResult.employeeId,
      installerName,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/temp-reservation?token=xxx
 * Releases a temporary hold.
 */
export async function DELETE(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) {
      return apiError("token required", 400);
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from("temp_reservations")
      .delete()
      .eq("session_token", token);

    if (error) {
      console.error("Temp reservation delete error:", error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

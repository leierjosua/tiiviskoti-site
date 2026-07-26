import { NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { apiError, handleApiError } from "@/lib/api-utils";
import { rateLimit } from "@/lib/rate-limit";

const checkDiscountSchema = z.object({
  code: z.string().min(1, "Koodi vaaditaan"),
  service_id: z.string().uuid("Virheellinen palvelu-ID").optional(),
});

export async function GET(request: NextRequest) {
  try {
    const rl = rateLimit(request, 10, 60_000);
    if (rl) return rl;
    const parsed = checkDiscountSchema.safeParse({
      code: request.nextUrl.searchParams.get("code"),
      service_id: request.nextUrl.searchParams.get("service_id") || undefined,
    });

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 400);
    }

    const code = parsed.data.code.trim().toLowerCase();
    const serviceId = parsed.data.service_id;

    const supabase = createServiceClient();

    const { data: dc, error: dcError } = await supabase
      .from("discount_codes")
      .select("id, code, discount_type, discount_value, max_uses, times_used, expires_at, active")
      .ilike("code", code)
      .eq("active", true)
      .single();

    if (dcError && dcError.code !== "PGRST116") throw dcError;

    if (!dc) {
      return Response.json({ valid: false, error: "Koodi ei ole voimassa." });
    }

    if (dc.max_uses != null && dc.times_used >= dc.max_uses) {
      return Response.json({ valid: false, error: "Koodi on käytetty loppuun." });
    }

    if (dc.expires_at && new Date(dc.expires_at) < new Date()) {
      return Response.json({ valid: false, error: "Koodi on vanhentunut." });
    }

    // Calculate discount amount if service_id provided
    let discountAmountCents = 0;
    if (serviceId) {
      const { data: service, error: svcError } = await supabase
        .from("services")
        .select("base_price_cents")
        .eq("id", serviceId)
        .single();

      if (svcError && svcError.code !== "PGRST116") throw svcError;

      if (service) {
        if (dc.discount_type === "eur") {
          // discount_value is stored in cents for "eur" type
          discountAmountCents = Math.min(dc.discount_value, service.base_price_cents);
        } else {
          // percentage: clamp to 0–100 to avoid negative or >100% discounts
          const pct = Math.max(0, Math.min(dc.discount_value, 100));
          discountAmountCents = Math.round(service.base_price_cents * pct / 100);
        }
      }
    }

    return Response.json({
      valid: true,
      discountId: dc.id,
      discountType: dc.discount_type,
      discountValue: dc.discount_value,
      discountAmountCents,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

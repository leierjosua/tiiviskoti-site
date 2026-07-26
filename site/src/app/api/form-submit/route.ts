import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { trackServerLead } from "@/lib/tracking";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, phone, postalCode, message, formSlug, pageUrl, eventId, fbc, fbp } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: "Nimi ja sähköposti vaaditaan" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { error } = await supabase.from("form_submissions").insert({
      form_slug: formSlug || "yhteydenotto",
      name,
      email,
      phone: phone || null,
      postal_code: postalCode || null,
      message: message || null,
      page_url: pageUrl || null,
    });

    if (error) throw error;

    // Server-side Meta CAPI Lead event (fire-and-forget)
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    trackServerLead({
      eventId: eventId || `lead_${Date.now()}`,
      email,
      phone,
      firstName: name,
      formName: formSlug || "yhteydenotto",
      clientIp,
      userAgent,
      fbc,
      fbp,
      pageUrl,
    });

    // Send notification email to info@lasikiilto.fi (fire-and-forget)
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-contact-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        formSlug: formSlug || "yhteydenotto",
        name,
        email,
        phone,
        postalCode,
        message,
        pageUrl,
        ...body,
      }),
    }).catch((e) => console.error("Contact email error:", e));

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Form submit error:", err);
    return NextResponse.json(
      { error: "Lomakkeen lähetys epäonnistui" },
      { status: 500 }
    );
  }
}

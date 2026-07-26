import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { rating, feedback } = await request.json();

    if (!rating || !feedback) {
      return NextResponse.json(
        { error: "Arvosana ja palaute vaaditaan" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { error } = await supabase.from("form_submissions").insert({
      form_slug: "arvostelu",
      name: rating, // "negative" | "neutral"
      email: "-",
      message: feedback,
    });

    if (error) throw error;

    // Send notification email to info@lasikiilto.fi (fire-and-forget)
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-contact-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        formSlug: "arvostelu",
        name: "-",
        email: "-",
        rating,
        feedback,
      }),
    }).catch((e) => console.error("Contact email error:", e));

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Feedback submit error:", err);
    return NextResponse.json(
      { error: "Palautteen lähetys epäonnistui" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServiceClient();

  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, description, base_price_cents, material_cost_cents, duration_minutes, transition_minutes")
      .eq("active", true)
      .order("base_price_cents", { ascending: true }),
    supabase
      .from("company_settings")
      .select("default_transition_minutes")
      .single(),
  ]);

  if (error) {
    console.error("Services fetch error:", error);
    return NextResponse.json({ error: "Virhe palveluiden haussa." }, { status: 500 });
  }

  const defaultTransition = settings?.default_transition_minutes ?? 30;

  const services = (data || []).map((s) => ({
    ...s,
    transition_minutes: s.transition_minutes ?? defaultTransition,
  }));

  return NextResponse.json({ services });
}

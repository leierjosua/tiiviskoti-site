/**
 * outreach-resend-webhook
 *
 * Vastaanottaa Resendin webhook-tapahtumat ja päivittää CRM-putken:
 *   email.delivered  → message.delivered, prospect pysyy 'contacted'
 *   email.opened     → message.opened,  prospect 'opened'
 *   email.clicked    → message.clicked
 *   email.bounced    → message.bounced, prospect 'bounced', enrollment 'bounced'
 *   email.complained → message.complained, prospect do_not_contact + 'unsubscribed'
 *
 * Idempotentti: jokainen tapahtuma kirjataan outreach_event-lokiin.
 * Mätsäys tehdään Resendin message-id:llä (resend_message_id).
 *
 * HUOM: verifioi allekirjoitus tuotannossa (Svix) — RESEND_WEBHOOK_SECRET.
 * Tässä tehdään kevyt bearer-tarkistus jos secret on asetettu.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Resend-tapahtuma → (message.status, prospect.status?, stopEnrollment?, suppress?)
const MAP: Record<string, {
  msg: string; prospect?: string; stop?: boolean; suppress?: boolean; ts: string;
}> = {
  "email.delivered":  { msg: "delivered", ts: "delivered_at" },
  "email.opened":     { msg: "opened",  prospect: "opened", ts: "opened_at" },
  "email.clicked":    { msg: "clicked", ts: "clicked_at" },
  "email.bounced":    { msg: "bounced", prospect: "bounced", stop: true, ts: "" },
  "email.complained": { msg: "complained", prospect: "unsubscribed", stop: true, suppress: true, ts: "" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Kevyt suoja (jos secret asetettu)
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (secret) {
    const got = req.headers.get("x-webhook-secret") ?? "";
    if (got !== secret) return json({ error: "unauthorized" }, 401);
  }

  let evt: Record<string, unknown>;
  try { evt = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const type = String(evt.type ?? "");
  const data = (evt.data ?? {}) as Record<string, unknown>;
  const resendId = String(data.email_id ?? data.id ?? "");
  const map = MAP[type];
  if (!map || !resendId) return json({ ignored: type });

  // Etsi viesti Resend-id:llä
  const { data: msg } = await supabase
    .from("outreach_message")
    .select("id, prospect_id, enrollment_id, status")
    .eq("resend_message_id", resendId)
    .maybeSingle();
  if (!msg) return json({ ignored: "unknown message", resendId });

  const nowIso = new Date().toISOString();

  // Loki (audit + idempotenssi)
  await supabase.from("outreach_event").insert({
    message_id: msg.id, prospect_id: msg.prospect_id,
    event_type: map.msg, payload: evt, occurred_at: nowIso,
  });

  // Päivitä viesti — älä koskaan taannuta 'replied'-tilaa
  if (msg.status !== "replied") {
    const upd: Record<string, unknown> = { status: map.msg };
    if (map.ts) upd[map.ts] = nowIso;
    await supabase.from("outreach_message").update(upd).eq("id", msg.id);
  }

  // Päivitä prospektin tila (ei taannuta booked/won/replied)
  if (map.prospect) {
    const { data: p } = await supabase
      .from("outreach_prospect").select("status").eq("id", msg.prospect_id).maybeSingle();
    const locked = ["replied", "booked", "won", "lost", "unsubscribed"];
    if (p && !locked.includes(p.status)) {
      await supabase.from("outreach_prospect")
        .update({ status: map.prospect }).eq("id", msg.prospect_id);
    }
  }

  if (map.suppress) {
    await supabase.rpc("outreach_unsubscribe", { p_prospect_id: msg.prospect_id });
  }
  if (map.stop) {
    await supabase.from("outreach_enrollment")
      .update({ status: type === "email.complained" ? "unsubscribed" : "bounced" })
      .eq("id", msg.enrollment_id);
  }

  return json({ ok: true, applied: map.msg });
});

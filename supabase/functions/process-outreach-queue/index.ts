/**
 * process-outreach-queue
 *
 * Kylmän B2B-ulkoreachin lähetysmoottori. Ajetaan cronilla (esim. 15 min välein).
 *
 * Logiikka:
 *   1. Hae ERÄPÄIVÄISET liittymät: status='active', approved_at IS NOT NULL,
 *      next_send_at <= now.  → APPROVE-A-BATCH: mikään ei lähde ilman hyväksyntää.
 *   2. Kunnioita lähetysikkunaa (send_window) ja päiväkattoa (daily_cap)
 *      per kampanja — domain-maineen suoja.
 *   3. Renderöi nykyisen askeleen template, lähetä Resendilla mail.tiiviskoti.fi:stä.
 *   4. Kirjaa outreach_message, päivitä enrollment (current_step, next_send_at)
 *      ja prospektin tila 'contacted'.
 *   5. Sekvenssin lopussa → enrollment 'completed'.
 *
 * Ei kosketa Gmail-transaktioputkeen. Vastaukset/avaukset tulevat erikseen
 * outreach-resend-webhook-funktion kautta.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { requireServiceRole } from "../_shared/auth.ts";
import { sendViaResend, renderTemplate } from "../_shared/resend.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TZ = "Europe/Helsinki";
const PUBLIC_BASE = Deno.env.get("OUTREACH_PUBLIC_BASE") ?? "https://tiiviskoti.fi";
const BOOKING_URL = `${PUBLIC_BASE}/varaa`;

function helsinkiHour(): number {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", hour12: false,
  }).format(new Date());
  return parseInt(s, 10);
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authErr = requireServiceRole(req);
  if (authErr) return authErr;

  const nowIso = new Date().toISOString();
  const hour = helsinkiHour();

  // 1) Aktiiviset kampanjat
  const { data: campaigns, error: campErr } = await supabase
    .from("outreach_campaign")
    .select("*")
    .eq("status", "active");
  if (campErr) return jsonRes({ error: campErr.message }, 500);
  if (!campaigns?.length) return jsonRes({ message: "Ei aktiivisia kampanjoita", sent: 0 });

  let totalSent = 0;
  const results: Record<string, unknown>[] = [];

  for (const camp of campaigns) {
    // 2) Lähetysikkuna
    if (hour < camp.send_window_start || hour >= camp.send_window_end) {
      results.push({ campaign: camp.name, skipped: "send_window", hour });
      continue;
    }

    // Päiväkatto: montako on jo lähtenyt tänään (Helsinki-vrk)
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count: sentToday } = await supabase
      .from("outreach_message")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", dayStart.toISOString())
      .in("enrollment_id",
        (await supabase.from("outreach_enrollment").select("id").eq("campaign_id", camp.id))
          .data?.map((r) => r.id) ?? ["00000000-0000-0000-0000-000000000000"],
      );
    const remaining = Math.max(0, camp.daily_cap - (sentToday ?? 0));
    if (remaining === 0) {
      results.push({ campaign: camp.name, skipped: "daily_cap", cap: camp.daily_cap });
      continue;
    }

    // 3) Eräpäiväiset, HYVÄKSYTYT liittymät
    const { data: due, error: dueErr } = await supabase
      .from("outreach_enrollment")
      .select("*, outreach_prospect(*)")
      .eq("campaign_id", camp.id)
      .eq("status", "active")
      .not("approved_at", "is", null)
      .lte("next_send_at", nowIso)
      .order("next_send_at", { ascending: true })
      .limit(remaining);
    if (dueErr) { results.push({ campaign: camp.name, error: dueErr.message }); continue; }
    if (!due?.length) { results.push({ campaign: camp.name, due: 0 }); continue; }

    // Kampanjan sekvenssiaskeleet
    const { data: steps } = await supabase
      .from("outreach_sequence_step")
      .select("*")
      .eq("campaign_id", camp.id)
      .eq("active", true)
      .order("step_number", { ascending: true });
    if (!steps?.length) { results.push({ campaign: camp.name, error: "ei askeleita" }); continue; }

    for (const enr of due) {
      const prospect = enr.outreach_prospect;
      // Suppress: opt-out / ei sähköpostia
      if (!prospect || prospect.do_not_contact || !prospect.email) {
        await supabase.from("outreach_enrollment")
          .update({ status: "stopped" }).eq("id", enr.id);
        continue;
      }

      const nextStepNo = enr.current_step + 1;
      const step = steps.find((s) => s.step_number === nextStepNo);
      if (!step) {
        // Sekvenssi loppui
        await supabase.from("outreach_enrollment")
          .update({ status: "completed", completed_at: nowIso }).eq("id", enr.id);
        continue;
      }

      const unsubUrl = `${PUBLIC_BASE}/api/outreach/unsubscribe?p=${prospect.id}`;
      const html = renderTemplate(step.body_html, {
        contact_name: prospect.contact_name || "hyvä vastaanottaja",
        company_name: prospect.company_name,
        city: prospect.city,
        booking_url: BOOKING_URL,
        unsubscribe_url: unsubUrl,
      });
      const subject = renderTemplate(step.subject, {
        company_name: prospect.company_name, city: prospect.city,
      });

      // Luo outreach_message ensin (queued) → idempotenssi
      const { data: msg, error: msgErr } = await supabase
        .from("outreach_message")
        .insert({
          enrollment_id: enr.id, prospect_id: prospect.id, step_number: nextStepNo,
          to_email: prospect.email, subject, status: "queued",
        })
        .select().single();
      if (msgErr || !msg) { results.push({ enr: enr.id, error: msgErr?.message }); continue; }

      // 4) Lähetä Resendilla
      const send = await sendViaResend({
        from: `${camp.from_name} <${camp.from_email}>`,
        to: prospect.email,
        subject,
        html,
        replyTo: camp.reply_to ?? undefined,
        headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        tags: [
          { name: "campaign", value: camp.id },
          { name: "prospect", value: prospect.id },
          { name: "step", value: String(nextStepNo) },
        ],
      });

      if (!send.ok) {
        await supabase.from("outreach_message")
          .update({ status: "failed" }).eq("id", msg.id);
        results.push({ prospect: prospect.company_name, sendError: send.error });
        continue;
      }

      // 5) Onnistui → päivitä message + enrollment + prospect
      await supabase.from("outreach_message").update({
        status: "sent", sent_at: nowIso, resend_message_id: send.id ?? null,
      }).eq("id", msg.id);

      const moreSteps = steps.some((s) => s.step_number > nextStepNo);
      const nextStep = steps.find((s) => s.step_number === nextStepNo + 1);
      const nextSendAt = moreSteps && nextStep
        ? new Date(Date.now() + (nextStep.delay_days ?? 3) * 86400000).toISOString()
        : null;

      await supabase.from("outreach_enrollment").update({
        current_step: nextStepNo,
        next_send_at: nextSendAt,
        status: moreSteps ? "active" : "completed",
        completed_at: moreSteps ? null : nowIso,
      }).eq("id", enr.id);

      await supabase.from("outreach_prospect").update({
        status: prospect.status === "new" || prospect.status === "queued" ? "contacted" : prospect.status,
        last_contacted_at: nowIso,
      }).eq("id", prospect.id);

      totalSent++;
      results.push({ prospect: prospect.company_name, step: nextStepNo, sent: true });
    }
  }

  return jsonRes({ sent: totalSent, results });
});

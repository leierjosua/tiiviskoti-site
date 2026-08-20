/**
 * seed-outreach-campaign.mjs
 *
 * Luo/päivittää "Isännöinti Uusimaa" -kampanjan ja lataa 3 sähköpostiaskelta
 * HTML-tiedostoista tietokantaan (outreach_sequence_step).
 *
 * Aja:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/scripts/seed-outreach-campaign.mjs
 *
 * HTML-tiedostot ovat totuuden lähde — tämä skripti synkkaa ne DB:hen.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL = join(__dirname, "..", "outreach-templates");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Aseta SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(url, key);

const CAMPAIGN = {
  name: "Isännöinti Uusimaa",
  description: "Kylmä B2B-ulkoreach isännöintiyrityksille — maksuton lämpökuvaus + kiinteä hinta.",
  from_name: "TiivisKoti",
  from_email: "info@mail.tiiviskoti.fi",
  reply_to: "info@tiiviskoti.fi",
  status: "draft",         // aktivoi vasta kun DNS + Resend valmiina
  daily_cap: 15,           // warmup-katto
  send_window_start: 8,
  send_window_end: 17,
};

const STEPS = [
  { step_number: 1, delay_days: 0, subject: "Vetoiset ovet ja ikkunat taloyhtiöissänne?", file: "email-1-intro.html" },
  { step_number: 2, delay_days: 4, subject: "Näin veto loppuu — ennen & jälkeen", file: "email-2-followup.html" },
  { step_number: 3, delay_days: 6, subject: "Viimeinen viesti — laitan tarjouksen talteen", file: "email-3-breakup.html" },
];

const main = async () => {
  // Upsert-kampanja nimen perusteella
  let { data: camp } = await sb.from("outreach_campaign").select("*").eq("name", CAMPAIGN.name).maybeSingle();
  if (!camp) {
    const { data, error } = await sb.from("outreach_campaign").insert(CAMPAIGN).select().single();
    if (error) throw error;
    camp = data;
    console.log("Kampanja luotu:", camp.id);
  } else {
    console.log("Kampanja on jo olemassa:", camp.id);
  }

  for (const s of STEPS) {
    const body_html = readFileSync(join(TPL, s.file), "utf8");
    const row = {
      campaign_id: camp.id, step_number: s.step_number, delay_days: s.delay_days,
      subject: s.subject, body_html, active: true,
    };
    const { error } = await sb.from("outreach_sequence_step")
      .upsert(row, { onConflict: "campaign_id,step_number" });
    if (error) throw error;
    console.log(`Askel ${s.step_number} synkattu (${s.file})`);
  }
  console.log("Valmis. Kampanja on 'draft' — aktivoi administa kun DNS+Resend valmiina.");
};

main().catch((e) => { console.error(e); process.exit(1); });

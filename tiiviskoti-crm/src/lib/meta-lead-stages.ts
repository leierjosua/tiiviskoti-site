import 'server-only';
import { sql } from '@/lib/db';

/* =========================================================
   Liidin lopputulos takaisin Metalle (Conversions API, lead ads).

   MIKSI: liidilomakkeen täyttö tapahtuu Facebookin sisällä, ja Meta tietää
   siitä vain sen että lomake täytettiin. Se ei tiedä otimmeko yhteyttä,
   tuliko kauppa vai oliko liidi roskaa. Ilman tätä tietoa optimointi etsii
   lisää ihmisiä jotka täyttävät lomakkeita — ei ihmisiä joista tulee
   asiakkaita. Tämä on se sama asia jota Metan oma käyttöliittymä tarjoaa
   nimellä "connect your CRM".

   MIKSI HYLÄTYT LÄHETETÄÄN MYÖS: juuri se on arvokkain tieto. Google Adsin
   puolella tehdään päinvastoin (hylättyä ei raportoida) — siellä konversio
   on palkinto jota tavoitellaan, tässä kyse on laatuluokittelusta, jossa
   negatiivinen esimerkki opettaa yhtä paljon kuin positiivinen.

   MIKSI EI TIETOKANTASARAKETTA LÄHETETYILLE: `event_id` on
   `<lead_id>-<status>`, ja Meta poistaa kaksoiskappaleet sen perusteella.
   Sama vaihe voi siis lähteä monta kertaa ilman että se kirjautuu kahdesti.
   Se säästää migraation ja pitää tilan yhdessä paikassa (liidin status),
   eikä kaksi tilakonetta pääse eriytymään toisistaan.

   Ympäristömuuttujat:
     META_ACCESS_TOKEN  — sama token kuin liidien haussa
     META_PIXEL_ID      — (valinnainen) datajoukko, oletus alla
   ========================================================= */

const GV = process.env.META_GRAPH_VERSION || 'v21.0';
/* Oletus samalla periaatteella kuin META_PAGE_ID meta-leads.ts:ssä: arvo on
   julkinen tunniste eikä salaisuus, ja oletus säästää yhden käsin asetetun
   muuttujan josta koko toiminto muuten hiljaa lakkaisi. */
const PIXEL_ID = process.env.META_PIXEL_ID || '1102837850103694';

/* Liidin tila → Metan tapahtuma.

   `new` puuttuu tarkoituksella: siitä ei ole vielä opittu mitään, eikä
   "liidi saapui" ole uutta tietoa Metalle — se tietää sen itse.

   `converted` → OfferSent EIKÄ LeadConverted: käytännössä tila asetetaan
   kun tarjous on lähetetty (8.10.2026: 18 converted-liidiä, niistä 1 työ).
   Oikea kauppa menee Metalle omana Purchase-tapahtumanaan
   (api/crm-purchase), joten "converted" nimellä Meta luulisi tarjouksen
   kaupaksi ja optimoisi väärää vaihetta. Nimen vaihto ei hukannut
   historiaa: aiemmat LeadConverted-tapahtumat menivät ilman crm-merkintää
   eikä Meta lukenut niitä vaiheiksi lainkaan. */
const STAGE_EVENT: Record<string, string> = {
  contacted: 'LeadContacted',
  converted: 'OfferSent',
  rejected: 'LeadDisqualified',
};

/* KERRAN PER VAIHE: `meta_stage_sent` (db/034) kertoo minkä tilan Meta on
   jo saanut, ja vain eroavat lähetetään.

   Aiemmin rivit valittiin `updated_at`in perusteella (2 vrk ikkuna), mutta
   trg_leads_touch nostaa sitä kaikista muokkauksista — viikkoja sitten
   vaihtunut tila lähti uudestaan kun liidiin lisättiin soittokierros, ja
   Metan deduplikointi kattaa vain ~48 h. Tulos 8.10.2026: 61
   LeadConverted-tapahtumaa 28 liidistä.

   Metan rajoitus: event_time saa olla enintään 7 vrk menneisyydessä, ja
   yksi liian vanha tapahtuma hylkää koko erän. Siksi aika rajataan
   6 vrk:een — jos ajo on ollut rikki pitkään, vaihe lähtee silti
   (myöhäisellä aikaleimalla) eikä tukki jonoa ikuisesti. */
const MAX_EVENT_AGE_MS = 6 * 24 * 3600 * 1000;
/* CRM:n nimi Metan liidisuppilossa. Sama arvo myös sivuston
   api/crm-purchase.mjs:ssä — muuten Meta näkisi kaksi eri CRM:ää. */
const LEAD_EVENT_SOURCE = 'TiivisKoti CRM';
const BATCH_SIZE = 100;

export type StageSyncResult = {
  configured: boolean;
  error?: string;
  sent: number;
  skipped: number;
};

type StageRow = {
  id: string;
  external_id: string;
  status: string;
  updated_at: Date;
};

export async function sendLeadStages(): Promise<StageSyncResult> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return { configured: false, error: 'META_ACCESS_TOKEN puuttuu', sent: 0, skipped: 0 };
  }

  const rows = await sql<StageRow[]>`
    select id, external_id, status, updated_at
      from tk.leads
     where external_id ~ '^[0-9]+$'
       and status in ('contacted', 'converted', 'rejected')
       and status::text is distinct from meta_stage_sent
     order by updated_at
     limit ${BATCH_SIZE}
  `;

  const oldest = Date.now() - MAX_EVENT_AGE_MS;
  const data = rows.map((r) => ({
    event_name: STAGE_EVENT[r.status],
    event_time: Math.floor(Math.max(r.updated_at.getTime(), oldest) / 1000),
    action_source: 'system_generated',
    /* Kaksoiskappaleiden esto: sama liidi + sama vaihe = sama tapahtuma. */
    event_id: `${r.external_id}-${r.status}`,
    user_data: { lead_id: Number(r.external_id) },
    /* PAKOLLISET liidien CRM-integraatiossa: ilman näitä Meta ottaa
       tapahtuman vastaan (events_received) mutta ei tunnista sitä liidin
       vaiheeksi, eikä laatupalaute päädy mainosten optimointiin. */
    custom_data: { event_source: 'crm', lead_event_source: LEAD_EVENT_SOURCE },
  }));

  const skipped = 0;
  if (data.length === 0) return { configured: true, sent: 0, skipped };

  let res: Response;
  let text: string;
  try {
    res = await fetch(`https://graph.facebook.com/${GV}/${PIXEL_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, access_token: token }),
      cache: 'no-store',
    });
    text = await res.text();
  } catch (e) {
    return { configured: true, error: e instanceof Error ? e.message : String(e), sent: 0, skipped };
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = (JSON.parse(text) as { error?: { message?: string } })?.error?.message || msg;
    } catch { /* ei-JSON vastaus: käytetään statusta */ }
    return { configured: true, error: `Meta hylkäsi: ${msg}`, sent: 0, skipped };
  }

  let received = data.length;
  try {
    received = (JSON.parse(text) as { events_received?: number }).events_received ?? data.length;
  } catch { /* vastaus ilman runkoa on silti hyväksyntä */ }

  /* Kirjataan vasta Metan hyväksynnän jälkeen. Ehto `status = …` estää
     merkitsemästä lähetetyksi tilaa joka ehti vaihtua kesken ajon — se
     lähtee seuraavalla kerralla. */
  for (const r of rows) {
    await sql`
      update tk.leads set meta_stage_sent = ${r.status}
       where id = ${r.id}::uuid and status = ${r.status}
    `;
  }

  return { configured: true, sent: received, skipped };
}

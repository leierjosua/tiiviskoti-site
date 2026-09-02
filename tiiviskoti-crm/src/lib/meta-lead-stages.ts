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
   "liidi saapui" ole uutta tietoa Metalle — se tietää sen itse. */
const STAGE_EVENT: Record<string, string> = {
  contacted: 'LeadContacted',
  converted: 'LeadConverted',
  rejected: 'LeadDisqualified',
};

/* Metan attribuutioikkuna. Vanhempaa ei kannata lähettää: se ei enää
   vaikuta optimointiin, ja ilman rajausta jono kasvaisi loputtomiin. */
const MAX_AGE_DAYS = 90;
const BATCH_SIZE = 100;

export type StageSyncResult = {
  configured: boolean;
  error?: string;
  sent: number;
  skipped: number;
};

type StageRow = {
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
    select external_id, status, updated_at
      from tk.leads
     where external_id is not null
       and status <> 'new'
       and updated_at >= now() - ${`${MAX_AGE_DAYS} days`}::interval
     order by updated_at
     limit ${BATCH_SIZE}
  `;

  const data = rows
    .filter((r) => STAGE_EVENT[r.status] && /^\d+$/.test(r.external_id))
    .map((r) => ({
      event_name: STAGE_EVENT[r.status],
      event_time: Math.floor(r.updated_at.getTime() / 1000),
      action_source: 'system_generated',
      /* Kaksoiskappaleiden esto: sama liidi + sama vaihe = sama tapahtuma. */
      event_id: `${r.external_id}-${r.status}`,
      user_data: { lead_id: Number(r.external_id) },
    }));

  const skipped = rows.length - data.length;
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

  return { configured: true, sent: received, skipped };
}

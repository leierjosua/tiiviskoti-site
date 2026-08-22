import { sql } from '@/lib/db';

/* =========================================================
   Liidin kirjoitus tk.leads-tauluun — yhdessä paikassa, koska kaksi reittiä
   (`/lead` kuluttajalle, `/taloyhtio-lead` taloyhtiölle) kirjoittaa samaan
   tauluun ja kumpikin tarvitsee saman kampanjasarakkeiden varautumisen.

   MIKSI VARAUTUMINEN: `db/015_leads_campaign.sql` ajetaan käsin Supabasen
   SQL-editorissa postgres-roolilla, koska `tk_app` ei omista taulua. Deploy
   voi siis olla edellä migraatiota. Liidi on aina tärkeämpi kuin sen mittari,
   joten puuttuva sarake pudottaa kampanjan pois eikä hylkää yhteydenottoa.

   Sama kirjanpitotapa kuin `track/route.ts`:n variant-sarakkeessa: ensimmäinen
   epäonnistunut lisäys kääntää lipun, ja sen jälkeen mennään suoraan lyhyttä
   polkua. Prosessin uudelleenkäynnistys (uusi deploy) yrittää taas — eli
   migraation ajamisen jälkeen kampanja alkaa tallentua viimeistään seuraavasta
   kylmästä käynnistyksestä.
   ========================================================= */

let campaignColumnsExist = true;

const isUndefinedColumn = (e: unknown) =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703';

export type LeadRow = {
  full_name: string;
  email: string | null;
  phone: string;
  postal_code: string | null;
  city: string | null;
  message: string | null;
  campaign: string | null;
  gclid: string | null;
};

export async function insertLead(d: LeadRow): Promise<void> {
  if (campaignColumnsExist) {
    try {
      await sql`
        insert into tk.leads (full_name, email, phone, postal_code, city, message, campaign, gclid)
        values (${d.full_name}, ${d.email}, ${d.phone}, ${d.postal_code},
                ${d.city}, ${d.message}, ${d.campaign}, ${d.gclid})
      `;
      return;
    } catch (e) {
      if (isUndefinedColumn(e)) campaignColumnsExist = false;
      else throw e;
    }
  }
  await sql`
    insert into tk.leads (full_name, email, phone, postal_code, city, message)
    values (${d.full_name}, ${d.email}, ${d.phone}, ${d.postal_code},
            ${d.city}, ${d.message})
  `;
}

/* Kampanjan ja klikkitunnisteen muotorajaus zod-skeemaan. Kelvoton arvo
   pudotetaan pois eikä pyyntöä hylätä: arvo tulee julkisesta osoiterivistä,
   eikä rikkinäinen mainoslinkki saa estää yhteydenottoa. Muodot vastaavat
   kannan leads_campaign_format- ja leads_gclid_format-rajoitteita. */
export const CAMPAIGN_RE = /^[a-z0-9][a-z0-9._-]{0,59}$/;
export const GCLID_RE = /^[A-Za-z0-9_-]{10,200}$/;

export const campaignPreprocess = (v: unknown) =>
  (typeof v === 'string' && CAMPAIGN_RE.test(v) ? v : undefined);
export const gclidPreprocess = (v: unknown) =>
  (typeof v === 'string' && GCLID_RE.test(v) ? v : undefined);

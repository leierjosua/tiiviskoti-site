import 'server-only';
import { sql } from '@/lib/db';

/* =========================================================
   Metan liidimainosten (instant form) liidien tuonti tk.leads-tauluun.

   MIKSI HAKU EIKÄ WEBHOOK: webhook vaatisi julkisen vahvistetun
   callback-osoitteen ja app secretin, ja se hiljenee huomaamatta jos
   tilaus katkeaa. Haku on tylsempi mutta itsekorjaava: jos yksi ajo jää
   väliin, seuraava poimii samat liidit. Uudelleenajo on turvallista,
   koska `tk.leads.external_id` on uniikki (db/023).

   MIKSI SIVUTUNNUS: liidit ovat sivun omaisuutta. Järjestelmätunnuksella
   ei pääse suoraan `/{form_id}/leads`-osoitteeseen, vaan sillä haetaan
   ensin sivun oma tunnus `/me/accounts`-reitiltä. Järjestelmätunnus
   tarvitsee `leads_retrieval`-oikeuden, joka lisättiin sovellukselle
   käyttötapauksena "Capture & manage ad leads" 27.8.2026.

   Ympäristömuuttujat (tiiviskoti-crm Vercel):
     META_ACCESS_TOKEN   — järjestelmätunnus, jolla leads_retrieval
     META_PAGE_ID        — (valinnainen) oletus TiivisKodin sivu
     META_LEAD_FORM_IDS  — (valinnainen) pilkulla erotellut lomake-id:t;
                           ilman tätä luetaan kaikki sivun lomakkeet
   ========================================================= */

const GV = process.env.META_GRAPH_VERSION || 'v21.0';
const PAGE_ID = process.env.META_PAGE_ID || '556560117546812';

export type MetaLeadsResult = {
  forms: number;
  fetched: number;
  imported: number;
  skipped: number;
  error?: string;
};

type Kentta = { name: string; values: string[] };
type MetaLead = { id: string; created_time: string; field_data?: Kentta[] };

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const u = new URL(`https://graph.facebook.com/${GV}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { cache: 'no-store' });
  const j = (await r.json()) as T & { error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j;
}

/** Kenttien nimet vaihtelevat lomakkeittain, joten haetaan ensimmäinen osuma. */
const arvo = (kentat: Kentta[], ...nimet: string[]): string | null => {
  for (const n of nimet) {
    const k = kentat.find((x) => x.name === n);
    const v = k?.values?.[0]?.trim();
    if (v) return v;
  }
  return null;
};

/* Suomalainen postinumero on viisi numeroa. Metan vapaa tekstikenttä voi
   sisältää mitä tahansa, eikä roskaa kannata kirjoittaa kantaan. */
const postinumero = (v: string | null) => (v && /^\d{5}$/.test(v.replace(/\s/g, '')) ? v.replace(/\s/g, '') : null);

export async function importMetaLeads(): Promise<MetaLeadsResult> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return { forms: 0, fetched: 0, imported: 0, skipped: 0, error: 'META_ACCESS_TOKEN puuttuu' };

  try {
    const acc = await graph<{ data?: { id: string; access_token: string }[] }>('me/accounts', { access_token: token });
    const page = (acc.data || []).find((p) => p.id === PAGE_ID);
    if (!page) return { forms: 0, fetched: 0, imported: 0, skipped: 0, error: `sivua ${PAGE_ID} ei löytynyt tunnukselta` };
    const pageToken = page.access_token;

    const kiinteat = (process.env.META_LEAD_FORM_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const lomakkeet = kiinteat.length
      ? kiinteat
      : (await graph<{ data?: { id: string }[] }>(`${PAGE_ID}/leadgen_forms`, { access_token: pageToken, limit: '50' }))
          .data?.map((f) => f.id) ?? [];

    let fetched = 0;
    let imported = 0;
    let skipped = 0;

    for (const formId of lomakkeet) {
      const res = await graph<{ data?: MetaLead[] }>(`${formId}/leads`, {
        access_token: pageToken,
        fields: 'id,created_time,field_data',
        limit: '100',
      });
      for (const lead of res.data || []) {
        fetched++;
        const kentat = lead.field_data || [];
        const nimi = arvo(kentat, 'full_name', 'first_name') || 'Nimi puuttuu';
        const puhelin = arvo(kentat, 'phone_number', 'phone');
        const email = arvo(kentat, 'email');
        const pn = postinumero(arvo(kentat, 'postinumero', 'post_code', 'zip'));
        const taloyhtio = arvo(kentat, 'taloyhtio');
        const rooli = arvo(kentat, 'rooli');
        const kohde = arvo(kentat, 'kohde');

        const viesti = [
          'Meta-liidimainos',
          taloyhtio ? `Taloyhtiö: ${taloyhtio}` : null,
          rooli ? `Rooli: ${rooli}` : null,
          kohde ? `Kohde: ${kohde}` : null,
          `Lomake: ${formId}`,
        ].filter(Boolean).join('\n');

        /* Puhelin on tk.leads-taulussa käytännön pakko: ilman sitä liidiin
           ei voi soittaa. Metan lomake kysyy sen, mutta varmistetaan silti. */
        const rows = await sql<{ id: string }[]>`
          insert into tk.leads (full_name, email, phone, postal_code, message, campaign, external_id)
          values (${nimi}, ${email}, ${puhelin ?? ''}, ${pn}, ${viesti}, ${'meta-liidilomake'}, ${lead.id})
          on conflict (external_id) do nothing
          returning id
        `;
        if (rows.length) imported++;
        else skipped++;
      }
    }

    return { forms: lomakkeet.length, fetched, imported, skipped };
  } catch (e) {
    return { forms: 0, fetched: 0, imported: 0, skipped: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

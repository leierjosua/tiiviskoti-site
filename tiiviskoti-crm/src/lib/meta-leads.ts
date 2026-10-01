import 'server-only';
import { sql } from '@/lib/db';
import { sendMail, SENDER_EMAIL } from '@/lib/google';

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
  /* Kuinka monelle vastaanottajalle ilmoitus lähti. */
  notified?: number;
  /* Ilmoituksen epäonnistuminen EI kaada tuontia, mutta se palautetaan
     tässä: hiljainen epäonnistuminen oli juuri se vika joka jäi
     huomaamatta viikoiksi. Cron-reitti nostaa tämän 500:ksi. */
  notifyError?: string;
  error?: string;
};

type Kentta = { name: string; values: string[] };
type MetaLead = { id: string; created_time: string; field_data?: Kentta[] };

/* Metan Graph vastaa satunnaisesti virheellä joka näyttää pysyvältä mutta
   korjaantuu itsestään. 1.10.2026 tuonti kaatui viestiin "Invalid OAuth
   access token - Cannot parse access token", vaikka tunnus oli voimassa:
   sama ajo onnistui sellaisenaan tunnin päästä eikä tunnusta ollut
   koskettu. Yhdestä piikistä tuli punainen hälytys jossa ei ollut mitään
   korjattavaa — ja juuri sellainen hälytys opettaa olemaan välittämättä.

   MIKSI KAIKKI VIRHEET EIKÄ VAIN TUNNETUT: luku on idempotentti, joten
   turha uusinta maksaa sekunnin eikä mitään muuta. Oikeasti kuollut tunnus
   epäonnistuu kaikilla yrityksillä ja virhe palautuu kutsujalle ennallaan.
   Uusinta ei siis piilota vikaa, se vaimentaa kohinan sen ympäriltä. */
const YRITYKSIA = 3;
const ODOTUS_MS = [500, 2000];

async function haeJson<T>(url: string | URL): Promise<T> {
  let viimeisin: Error = new Error('haku ei ehtinyt alkaa');
  for (let yritys = 0; yritys < YRITYKSIA; yritys++) {
    if (yritys > 0) await new Promise((r) => setTimeout(r, ODOTUS_MS[yritys - 1]));
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const j = (await r.json()) as T & { error?: { message: string } };
      if (j.error) throw new Error(j.error.message);
      return j;
    } catch (e) {
      viimeisin = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw viimeisin;
}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const u = new URL(`https://graph.facebook.com/${GV}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return haeJson<T>(u);
}

/* Sivuttava haku. Graph palauttaa enintään `limit` riviä kerralla ja
   loput `paging.next`-osoitteen takaa.

   MIKSI TÄMÄ ON TÄRKEÄ: ilman sivutusta haku näki vain uusimmat 100
   liidiä lomaketta kohti. Vilkkaimmalla lomakkeella on nyt 34, joten
   vikaa ei näkynyt — mutta jos tuonti olisi ollut alhaalla riittävän
   kauan, sen yli menevä häntä olisi jäänyt kannan ulkopuolelle
   PYSYVÄSTI, koska seuraavakaan ajo ei olisi enää nähnyt niitä.
   Juuri sitä vikaa ei huomaa mistään: liidit vain eivät ole siellä.

   Katto on 50 sivua. Ilman sitä rikkinäinen paging-linkki jumittaisi
   cron-ajon ikuiseksi silmukaksi. */
async function graphAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
  type Sivu = { data?: T[]; paging?: { next?: string } };
  const eka = await graph<Sivu>(path, params);
  let rivit = eka.data ?? [];
  let seuraava = eka.paging?.next;
  for (let sivu = 1; seuraava && sivu < 50; sivu++) {
    const j = await haeJson<Sivu>(seuraava);
    rivit = rivit.concat(j.data ?? []);
    seuraava = j.paging?.next;
  }
  return rivit;
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

/* =========================================================
   Tuonnin terveysmerkintä.

   MIKSI: ennen tätä tuonnin tila näkyi vain GitHub Actionsin sähköpostissa.
   Varsinainen ajastus on Supabasen pg_cronissa 5 minuutin välein, ja SEN
   epäonnistumisista ei mennyt tietoa yhtään mihinkään — GitHubin ajo on
   varajärjestelmä, jonka GitHub kuristaa 7-9 tunnin välein. Jos tunnus
   kuolisi oikeasti, hälytys tulisi siis sattumanvaraisella viiveellä tai
   ei lainkaan, ja `tk.leads` hiljenisi ensin huomaamatta.

   MIKSI SAMA TAULU KUIN GOOGLELLA: päivittäinen kuntotarkistus lukee jo
   tk.health_checks:ia, ja `kind` on vapaa teksti. Oma taulu toisi vain
   migraation eikä yhtään uutta tietoa.

   Merkintä kattaa MYÖS sen tapauksen ettei reittiä kutsuta lainkaan:
   lukija katsoo viimeisimmän merkinnän IKÄÄ, ei vain sen tulosta. Juuri
   se on ainoa tapa nähdä pysähtynyt ajastin — pysähtynyt cron ei kirjoita
   virhettä, se ei kirjoita mitään. */
async function kirjaaTerveys(tulos: MetaLeadsResult): Promise<void> {
  /* Myös epäonnistunut ilmoitus on vika: liidi on kannassa, mutta jos
     kukaan ei saa siitä tietoa, se on käytännössä menetetty. Sama raja
     kuin cron-reitin 500:ssa. */
  const ok = !tulos.error && !tulos.notifyError;
  try {
    /* Onnistumisia syntyy 5 minuutin välein. Rivi kirjataan vain jos
       edellisestä on yli puoli tuntia — tiheämpi kirjaus kasvattaisi
       taulua 288 rivillä vuorokaudessa tuomatta lukijalle mitään, ja
       puoli tuntia on yhä murto-osa hälytysrajasta. Virhe kirjataan aina:
       sen ajankohta on se mitä vikaa selvittäessä halutaan tietää. */
    if (ok) {
      const [edellinen] = await sql<{ ok: boolean; checked_at: Date }[]>`
        select ok, checked_at from tk.health_checks
         where kind = 'meta_leads' order by checked_at desc limit 1
      `;
      if (edellinen?.ok && Date.now() - edellinen.checked_at.getTime() < 30 * 60_000) return;
    }
    const detail = ok
      ? `${tulos.fetched} liidiä ${tulos.forms} lomakkeelta, ${tulos.imported} uutta`
      : (tulos.error ?? tulos.notifyError ?? null);
    await sql`
      insert into tk.health_checks (kind, ok, detail)
      values (${'meta_leads'}, ${ok}, ${detail})
    `;
  } catch (e) {
    /* Merkinnän kirjaus ei saa kaataa tuontia: liidit ovat jo kannassa.
       Hiljainen epäonnistuminen on tässä oikea valinta vain siksi, että
       vaihtoehto olisi hävittää onnistunut tuonti kirjanpidon takia. */
    console.error('meta-leads: terveysmerkinnän kirjaus epäonnistui', e);
  }
}

export async function importMetaLeads(): Promise<MetaLeadsResult> {
  const tulos = await suoritaTuonti();
  await kirjaaTerveys(tulos);
  return tulos;
}

async function suoritaTuonti(): Promise<MetaLeadsResult> {
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
      : (await graphAll<{ id: string }>(`${PAGE_ID}/leadgen_forms`, { access_token: pageToken, limit: '100' }))
          .map((f) => f.id);

    let fetched = 0;
    let imported = 0;
    let skipped = 0;
    const uudet: { nimi: string; puhelin: string; email: string | null; pn: string | null; viesti: string }[] = [];
    let notified = 0;
    let notifyError: string | undefined;

    for (const formId of lomakkeet) {
      const res = await graphAll<MetaLead>(`${formId}/leads`, {
        access_token: pageToken,
        fields: 'id,created_time,field_data',
        limit: '100',
      });
      for (const lead of res) {
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
          /* Ehto on TOISTETTAVA: leads_external_id_uniq on osittainen
             indeksi (where external_id is not null), eikä Postgres tunnista
             sitä ilman samaa ehtoa. Ilman tätä jokainen lisäys kaatui
             virheeseen "no unique or exclusion constraint matching", tuonti
             palautti virheen ja sivu nieli sen — yhtään liidiä ei tullut
             perille ennen 28.8.2026. */
          on conflict (external_id) where external_id is not null do nothing
          returning id
        `;
        if (rows.length) {
          imported++;
          uudet.push({ nimi, puhelin: puhelin ?? '', email, pn, viesti });
        } else skipped++;
      }
    }

    /* Ilmoitus toimistolle. Liidi joka jää vain kantaan on käytännössä
       menetetty: soitto samana päivänä ratkaisee kaupan.

       VASTAANOTTAJA ON PAKKO OLLA ERI KUIN LÄHETTÄJÄ. Ilmoitus meni
       ennen info@ -> info@, ja Gmail käsittelee itselle lähetettyä
       API-postia epäjohdonmukaisesti: osa viesteistä sai vain SENT-
       tunnisteen eikä näkynyt saapuneissa lainkaan. Tarkistettu
       28.9.2026 postilaatikosta — 24.9. lähtenyt ilmoitus oli pelkkä
       SENT. Siksi LEAD_NOTIFY_TO, johon voi antaa pilkulla erotellun
       listan oikeita vastaanottajia.

       Lähetys ei saa kaataa tuontia — liidi on jo tallessa. Virhe
       palautetaan silti kutsujalle, koska hiljainen epäonnistuminen on
       juuri se vika jota etsittiin: liidejä tuli, postia ei. */
    if (uudet.length) {
      const rivit = uudet.map((u) => [
        u.nimi,
        u.puhelin ? `puh. ${u.puhelin}` : null,
        u.email,
        u.pn ? `postinumero ${u.pn}` : null,
        u.viesti.split('\n').slice(1).join(' · '),
      ].filter(Boolean).join(' — '));
      const vastaanottajat = (process.env.LEAD_NOTIFY_TO ?? SENDER_EMAIL)
        .split(',').map((x) => x.trim()).filter(Boolean);
      try {
        await sendMail({
          to: vastaanottajat.join(', '),
          subject: `${uudet.length} uutta liidiä Metan mainoksesta`,
          text: `Uudet liidit näkyvät myös adminissa: https://admin.tiiviskoti.fi/liidit\n\n${rivit.join('\n')}`,
          html: `<p>Uudet liidit näkyvät myös <a href="https://admin.tiiviskoti.fi/liidit">adminin Liidit-sivulla</a>.</p><ul>${rivit.map((r) => `<li>${r.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))}</li>`).join('')}</ul>`,
        });
        notified = vastaanottajat.length;
      } catch (e) {
        notifyError = e instanceof Error ? e.message : String(e);
        console.error('meta-leads: ilmoituksen lähetys epäonnistui', e);
      }
    }

    return { forms: lomakkeet.length, fetched, imported, skipped, notified, notifyError };
  } catch (e) {
    return { forms: 0, fetched: 0, imported: 0, skipped: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

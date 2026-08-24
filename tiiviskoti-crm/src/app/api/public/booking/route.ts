import { z } from 'zod';
import { isSlotTaken, sql } from '@/lib/db';
import { MAX_BOOKING_BLOCK_MINUTES } from '@/lib/availability';
import { areaForPostal, purgeExpiredHolds } from '@/lib/data';
import { deliverBooking, saveJobLines } from '@/lib/deliver';
import { removeCalendarEventForJob } from '@/lib/deliver';
import { normalizeCode, resolveDiscount, type DiscountError } from '@/lib/discounts';
import { clientIdentity, visitorHash } from '@/lib/visitor';

/* ---------------------------------------------------------------
   Kampanja kävijän omasta tapahtumaketjusta, kun selain ei kertonut sitä.

   MIKSI TÄMÄ ON OLEMASSA: sivusto poimii kampanjan osoiterivistä ja
   säilöö sen `localStorage`iin (`_shared.js`), josta se lähtee varauksen
   mukana. Se pettää hiljaa selaimissa joissa tallennustila ei säily —
   käytännössä Instagramin ja Facebookin sovellusselaimissa. Tulos: juuri
   MAINOKSESTA tulleet varaukset menettävät kampanjansa, eli ne joita
   varten koko mittari on. Todettu 24.8.2026 (työ 1044): analytiikka näki
   `tk26-video-olohuonekoukku`, varaus tallentui ilman kampanjaa.

   Analytiikka ei nojaa tallennustilaan lainkaan — se lukee kampanjan
   osoiterivistä joka sivulatauksella ja lähettää sen palvelimelle. Sama
   kävijähash (IP + selain + päivä + salt) syntyy uudelleen tässä, joten
   varaus voidaan yhdistää kävijän omaan käyntiin ilman evästeitä.

   ENSIMMÄINEN VOITTAA, sama sääntö kuin selaimessa: kaupan ansaitsee se
   mainos joka toi kävijän sivustolle.

   RAJAT, jotka on hyvä tietää lukuja katsoessa:
   - Hash vaihtuu keskiyöllä, joten tämä kattaa vain saman päivän. Useamman
     päivän harkinta jää `localStorage`in varaan, kuten ennenkin.
   - Jos kävijä on estänyt `_analytics.js`:n, tapahtumia ei ole eikä
     varakeinoa. Silloin kampanja jää tyhjäksi kuten ennenkin.
   Kumpikaan ei ole regressio: ilman tätä tulos olisi tyhjä joka kerta.
--------------------------------------------------------------- */
async function campaignFromVisitorTrail(request: Request): Promise<string | null> {
  try {
    const { ip, ua } = clientIdentity(request);
    if (ip === 'x' && !ua) return null;
    const [row] = await sql<{ campaign: string | null }[]>`
      select campaign from tk.web_events
       where visitor_hash = ${visitorHash(ip, ua)} and campaign is not null
       order by ts asc limit 1
    `;
    return row?.campaign ?? null;
  } catch (e) {
    /* Mittari ei saa koskaan kaataa varausta — sama periaate kuin
       gclidillä ja Meta CAPIlla. Kirjataan ja jatketaan ilman kampanjaa. */
    console.error('booking: kampanjan haku kävijäketjusta epäonnistui', e);
    return null;
  }
}

/* =========================================================
   Varauksen kirjaus — SISÄINEN rajapinta.

   Tätä kutsuu vain tiiviskoti.fi:n `api/create-booking.mjs` palvelimelta
   palvelimelle, jaetulla salaisuudella (`x-tk-secret`). Selain ei kutsu
   tätä koskaan, eikä CORS-otsakkeita siksi anneta.

   Miksi salaisuus: hinta tulee pyynnön mukana. Se on turvallista vain
   koska kutsuja on `create-booking.mjs`, joka laskee summan `pricing.mjs`
   -moduulista. Jos tämä olisi selaimelle avoin, kuka tahansa voisi
   kirjata 0 €:n varauksen — juuri se virhe, jonka takia hinnat
   keskitettiin `pricing.mjs`:ään alun perin.

   `tk.jobs`-rivi on samalla slotin varaus: taulun exclusion constraint
   estää päällekkäisyyden, joten tämä on koko varausketjun portinvartija.
   Sitä kutsutaan ENNEN kuin vanha polku kirjoittaa mitään muuta, ja
   DELETE peruu varauksen jos loppuketju kaatuu.
   ========================================================= */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  calendarId: z.string().uuid(),
  startsAt: z.string().datetime(),
  /* Työn TODELLINEN arvioitu kesto (pricing.mjs). Ei hylätä isoja arvoja:
     kalenteriin varattava lohko katkaistaan erikseen MAX_BOOKING_BLOCK_MINUTES:iin
     (paikanpitäjä), ja todellinen kesto viedään muistiinpanoihin. Näin iso keikka
     mahtuu aina eikä kauppa mene "validation"-virheeseen. 24 h on vain järkevä
     yläraja roskasyötteelle. */
  durationMinutes: z.number().int().min(15).max(1440),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  address: z.string().min(1),
  postalCode: z.string().regex(/^\d{5}$/),
  city: z.string().optional(),
  notes: z.string().max(4000).optional(),
  /* TYÖN hinta ilman matkalisää. Matkalisä lasketaan täällä alueen mukaan,
     jottei sitä voi syöttää pyynnössä. Näin kummallakin luvulla on täsmälleen
     yksi lähde: työ pricing.mjs:stä, matkalisä tk.areas-taulusta. */
  workCents: z.number().int().min(0),
  title: z.string().min(1).max(300).optional(),
  externalRef: z.string().max(100).optional(),
  /* Rivit tulevat kutsujalta, koska hinnoittelu (pricing.mjs) elää sivun
     puolella eikä sitä kahdenneta tänne. Ne tallennetaan työn riveiksi ja
     näytetään vahvistuspostissa. */
  lines: z.array(z.object({
    name: z.string().min(1).max(200),
    qty: z.number().int().min(1).max(999),
    unit: z.number().min(0),
    sum: z.number().min(0),
    unitName: z.string().max(20).optional(),
    note: z.string().max(60).optional(),
  })).max(50).optional(),
  netCents: z.number().int().min(0).optional(),
  /* Asiakkaan kirjoittama alennuskoodi. Vain koodi, ei sen arvoa: vähennys
     lasketaan täällä `tk.discount_codes`-taulusta, jottei sitä voi syöttää
     pyynnössä. Sama sääntö kuin matkalisällä. */
  discountCode: z.string().max(40).optional(),
  /* Mistä mainoksesta asiakas tuli (sivuston ?src=-parametri). Pelkkä
     merkintä raportointia varten — ei vaikuta hintaan eikä varaukseen.

     Kelvoton arvo pudotetaan tyhjäksi eikä hylätä pyyntöä: arvo tulee
     osoiterivistä, jota kuka tahansa voi muokata, ja rikkinäinen
     mainoslinkki ei saa estää kauppaa. Siksi preprocess eikä pelkkä
     regex — jälkimmäinen kaataisi koko varauksen. Sama muotorajaus kuin
     kannan jobs_campaign_format-rajoitteessa. */
  campaign: z.preprocess(
    (v) => (typeof v === 'string' && /^[a-z0-9][a-z0-9._-]{0,59}$/.test(v) ? v : undefined),
    z.string().optional(),
  ),
  /* Google Ads -klikin tunniste (gclid/wbraid/gbraid) sivuston osoiterivistä.
     Tästä syntyy Adsin offline-konversio: klikki + aika + kaupan arvo.

     Sama puolustus kuin kampanjalla — arvo tulee julkisesta osoiterivistä,
     joten kelvoton pudotetaan pois eikä varausta hylätä. Mainoslinkin
     rikkoutuminen ei saa estää kauppaa; mittari on toissijainen kauppaan
     nähden. Sama muotorajaus kuin kannan jobs_gclid_format-rajoitteessa. */
  gclid: z.preprocess(
    (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(v) ? v : undefined),
    z.string().optional(),
  ),
  /* Kumpi Googlen kolmesta klikkitunnisteesta `gclid`-kentässä on. Adsin
     rajapinnassa niillä on omat kenttänsä eikä arvoista voi päätellä
     tyyppiä, joten se on kuljetettava sivustolta asti. Puuttuva tai outo
     arvo tulkitaan gclidiksi — sama oletus kuin kannan sarakkeella. */
  gclidKind: z.preprocess(
    (v) => (v === 'wbraid' || v === 'gbraid' ? v : 'gclid'),
    z.enum(['gclid', 'wbraid', 'gbraid']),
  ),
});

/* Kelpaamaton alennuskoodi keskeyttää varauksen. Vaihtoehto olisi kirjata
   varaus täydellä hinnalla, mutta silloin asiakas maksaisi hiljaisesti
   enemmän kuin lomakkeella luki. Sivusto tarkistaa koodin jo ennen
   lähetystä, joten tänne asti päässyt virhe on joko kilpajuoksu (viimeinen
   käyttökerta ehdittiin viedä) tai käsin muokattu pyyntö — kumpikin
   ansaitsee selvän virheen eikä hiljaista hinnankorotusta.

   Heitetään transaktion sisältä, jotta koko varaus peruuntuu. */
class DiscountRejected extends Error {
  constructor(public reason: DiscountError) {
    super(`discount_${reason}`);
  }
}

/** Vakioaikainen vertailu, jottei salaisuutta voi haarukoida vasteajasta. */
function secretOk(request: Request): boolean {
  const expected = process.env.BOOKING_SECRET;
  if (!expected) return false;
  const given = request.headers.get('x-tk-secret') ?? '';
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request) {
  if (!secretOk(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'validation', fields: parsed.error.issues.map((i) => i.path.join('.')) },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const starts = new Date(d.startsAt);

  /* Paikanpitäjä: kalenteriin varataan enintään MAX_BOOKING_BLOCK_MINUTES, jotta
     iso keikka mahtuu vapaaseen aikaan eikä varaus kaadu — muuten kauppa
     menetettäisiin. Työn todellinen arvioitu kesto liitetään muistiinpanoihin,
     jotta toimisto osaa sovittaa oikean keston kalenteriin. Tavallinen keikka
     (≤ MAX_BOOKING_BLOCK_MINUTES) ei muutu lainkaan. */
  const blockMinutes = Math.min(d.durationMinutes, MAX_BOOKING_BLOCK_MINUTES);
  const ends = new Date(starts.getTime() + blockMinutes * 60_000);
  const oversized = d.durationMinutes > MAX_BOOKING_BLOCK_MINUTES;
  const estHours = (d.durationMinutes / 60).toFixed(1).replace('.', ',');
  const notes = oversized
    ? `⚠ ISO KEIKKA: arvioitu kesto ~${estHours} h (${d.durationMinutes} min). Kalenteriin `
      + `varattu vain ${Math.round(blockMinutes / 60 * 10) / 10} h paikanpitäjänä — `
      + `sovita todellinen kesto ja siirrä tarvittaessa.`
      + (d.notes ? `\n\n${d.notes}` : '')
    : (d.notes ?? null);

  await purgeExpiredHolds();

  const [calendar] = await sql<{ id: string; google_calendar_id: string | null }[]>`
    select c.id, c.google_calendar_id from tk.calendars c
      join tk.staff s on s.id = c.staff_id
     where c.id = ${d.calendarId} and c.active and s.active
  `;
  if (!calendar) return Response.json({ error: 'calendar_unavailable' }, { status: 409 });

  // --- palvelualue ja matkalisä ---
  // Alue ratkaistaan postinumerosta palvelimella, ja valitun kalenterin on
  // oikeasti palveltava sitä aluetta. Muuten varauksen voisi ohjata väärän
  // asentajan kalenteriin muokkaamalla pyyntöä.
  const area = await areaForPostal(d.postalCode);
  if (!area) {
    return Response.json({ error: 'area_not_served', postal: d.postalCode }, { status: 409 });
  }
  const [serves] = await sql<{ ok: boolean }[]>`
    select true as ok from tk.calendar_areas
     where calendar_id = ${d.calendarId} and area_id = ${area.id}
  `;
  if (!serves) {
    return Response.json({ error: 'calendar_area_mismatch', area: area.name }, { status: 409 });
  }

  const travelFeeCents = area.travelFeeCents;
  /* Veloitus ennen alennusta. Alennus lasketaan tästä, eli se koskee myös
     matkalisää — asiakkaalle luvattu "−20 €" on −20 € loppusummasta, ei
     työn osuudesta. */
  const subtotalCents = d.workCents + travelFeeCents;
  const wantedCode = normalizeCode(d.discountCode);

  /* Selaimen kertoma kampanja voittaa: se on kävijän ENSIMMÄINEN kosketus ja
     kantaa myös useamman päivän harkinnan yli. Vain jos se puuttuu, katsotaan
     saman päivän tapahtumaketjusta. Haku on transaktion ULKOPUOLELLA, jottei
     mittari pidennä varauksen lukitusta. */
  const campaign = d.campaign ?? (await campaignFromVisitorTrail(request));

  try {
    const created = await sql.begin(async (tx) => {
      // Sama asiakas voi varata uudelleen: etsitään ensin sähköpostilla,
      // jottei jokainen varaus synnytä uutta asiakasriviä.
      const [existing] = await tx<{ id: string }[]>`
        select id from tk.customers where lower(email) = lower(${d.email}) limit 1
      `;
      let customerId: string;
      if (existing) {
        customerId = existing.id;
        await tx`
          update tk.customers
             set full_name = ${d.name}, phone = ${d.phone}, address = ${d.address},
                 postal_code = ${d.postalCode}, city = coalesce(${d.city ?? null}, city)
           where id = ${customerId}
        `;
      } else {
        const [row] = await tx<{ id: string }[]>`
          insert into tk.customers (full_name, email, phone, address, postal_code, city)
          values (${d.name}, ${d.email}, ${d.phone}, ${d.address}, ${d.postalCode}, ${d.city ?? null})
          returning id
        `;
        customerId = row.id;
      }

      /* Alennus ratkaistaan vasta kun asiakas on tiedossa, koska koodilla voi
         olla asiakaskohtainen käyttöraja. `forUpdate` lukitsee koodirivin:
         ilman sitä kaksi yhtaikaista varausta voisi kumpikin lukea saman
         "yksi käyttö jäljellä" ja käyttää sen. */
      let discountCents = 0;
      let discountId: string | null = null;
      let discountCode: string | null = null;
      if (wantedCode) {
        const res = await resolveDiscount({
          code: wantedCode,
          subtotalCents,
          customerId,
          db: tx,
          forUpdate: true,
        });
        if (!res.ok) throw new DiscountRejected(res.error);
        discountCents = res.discount.amountCents;
        discountId = res.discount.id;
        discountCode = res.discount.code;
      }
      const totalCents = subtotalCents - discountCents;

      const [job] = await tx<{ id: string; job_number: string }[]>`
        insert into tk.jobs (customer_id, calendar_id, starts_at, ends_at, status, title,
                             address, postal_code, city, price_cents, notes, source,
                             campaign, gclid)
        values (${customerId}, ${d.calendarId}, ${starts}, ${ends}, 'confirmed',
                ${d.title ?? 'Tiivistetyö'}, ${d.address}, ${d.postalCode}, ${d.city ?? null},
                ${totalCents}, ${notes}, 'web',
                ${campaign}, ${d.gclid ?? null})
        returning id, job_number
      `;

      /* Käyttökerta samassa transaktiossa työn kanssa: peruuntunut varaus ei
         saa kuluttaa koodia, eikä käytetty koodi jäädä kirjaamatta. */
      if (discountId) {
        await tx`
          insert into tk.discount_redemptions (code_id, job_id, customer_id, amount_cents)
          values (${discountId}, ${job.id}, ${customerId}, ${discountCents})
        `;
      }

      return { ...job, discountCents, discountCode, totalCents };
    }) as unknown as {
      id: string; job_number: string;
      discountCents: number; discountCode: string | null; totalCents: number;
    };

    const totalCents = created.totalCents;

    /* Klikkitunnisteen tyyppi omana kirjoituksenaan varauksen jälkeen.

       MIKSI EI SAMASSA INSERTISSÄ: sarake tulee migraatiosta 017, jota ei
       voi ajaa sovelluksen roolilla. Jos insert viittaisi sarakkeeseen jota
       tuotannossa ei vielä ole, JOKAINEN varaus kaatuisi migraation
       odottelun ajan — mittaustieto veisi mennessään kaupan. Nyt pahin
       seuraus on että konversio lähtee Adsille väärässä kentässä ja Ads
       hylkää sen näkyvästi.

       Vain kun tyyppi poikkeaa oletuksesta: sarakkeen oletusarvo on
       'gclid', joten tavallisesta klikistä ei tarvitse kirjoittaa mitään. */
    if (d.gclid && d.gclidKind !== 'gclid') {
      try {
        await sql`update tk.jobs set ads_click_kind = ${d.gclidKind} where id = ${created.id}::uuid`;
      } catch (e) {
        // 42703 = saraketta ei ole (017 ajamatta). Muut viat kuuluvat esiin.
        if (!(typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703')) throw e;
      }
    }

    // --- jälkitoimet: rivit, vahvistusposti, kalenteritapahtuma ---
    // Aika on nyt varattu ja työ kannassa. Mikään tästä eteenpäin ei saa
    // muuttaa vastausta virheeksi: asiakkaan varaus on voimassa vaikka posti
    // tai kalenteri pettäisi. Epäonnistuminen kirjataan riville ja näkyy
    // panelissa (`confirmation_error`, `tk.mail_log`).
    /* Matkalisärivi lisätään TÄÄLLÄ eikä kutsujan lähettämänä, jotta se on
       varmasti sama kuin alueen todellinen lisä. Kutsuja lähettää vain työn
       rivit, joten rivien summa on aina täsmälleen `totalCents`. */
    const lines = [...(d.lines ?? [])];
    if (travelFeeCents > 0) {
      lines.push({
        name: `Matkalisä (${area.name})`,
        qty: 1,
        unit: travelFeeCents / 100,
        sum: travelFeeCents / 100,
        unitName: 'kerta',
      });
    }
    /* Alennus omana negatiivisena rivinään viimeisenä, jotta vahvistuspostin
       ja työmääräimen erittelystä näkee sekä listahinnan että vähennyksen —
       ei vain pienempää loppusummaa. */
    if (created.discountCents > 0) {
      lines.push({
        name: `Alennuskoodi ${created.discountCode}`,
        qty: 1,
        unit: -created.discountCents / 100,
        sum: -created.discountCents / 100,
        unitName: 'kerta',
      });
    }

    // Varmiste: rivien summan on täsmättävä veloitukseen. Sivulla on sama
    // tarkistus työn osalta, mutta matkalisä lisätään vasta täällä.
    const lineSum = Math.round(lines.reduce((s, l) => s + l.sum, 0) * 100);
    if (lineSum !== totalCents) {
      console.error('public/booking: rivisumma', lineSum, '!= veloitus', totalCents, created.job_number);
    }

    try {
      await saveJobLines(created.id, lines);
    } catch (e) {
      console.error('public/booking: rivien tallennus epäonnistui', created.job_number, e);
    }

    const delivery = await deliverBooking({
      jobId: created.id,
      jobNumber: created.job_number,
      customerName: d.name,
      email: d.email,
      phone: d.phone,
      address: d.address,
      postalCode: d.postalCode,
      city: d.city ?? null,
      startsAt: starts,
      endsAt: ends,
      lines,
      totalCents,
      // Kotitalousvähennys: 40 % työn osuudesta, työ n. 70 % hinnasta.
      netCents: Math.round(totalCents * (1 - 0.4 * 0.7)),
      notes: d.notes ?? null,
      googleCalendarId: calendar.google_calendar_id,
    });

    return Response.json({
      ok: true,
      jobId: created.id,
      jobNumber: created.job_number,
      totalCents,
      travelFeeCents,
      subtotalCents,
      discountCents: created.discountCents,
      discountCode: created.discountCode,
      area: area.name,
      mailSent: delivery.mail.ok,
      workOrderSent: delivery.workOrder.ok,
      calendarCreated: delivery.calendar.ok,
      // Virheet mukaan vastaukseen, jotta kutsuja voi logittaa ne omalta
      // puoleltaan eikä syy jää vain CRM:n lokiin.
      mailError: delivery.mail.error,
      workOrderError: delivery.workOrder.error,
      calendarError: delivery.calendar.error,
    });
  } catch (err) {
    if (isSlotTaken(err)) return Response.json({ error: 'slot_taken' }, { status: 409 });
    // Koodi ei kelvannut: varaus peruuntui kokonaan, joten aika on yhä vapaa.
    // Sivusto näyttää syyn ja antaa lähettää uudelleen ilman koodia.
    if (err instanceof DiscountRejected) {
      return Response.json(
        { error: 'discount_invalid', reason: err.reason, code: wantedCode },
        { status: 409 },
      );
    }
    console.error('public/booking POST:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

/**
 * Peruu varauksen, jos kutsujan loppuketju (vahvistusposti, kalenteri,
 * vanha kanta) kaatui. Ilman tätä kaatunut varaus jättäisi slotin
 * ikuisesti varatuksi ilman että kenelläkään on työtä.
 */
export async function DELETE(request: Request) {
  if (!secretOk(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const jobId = new URL(request.url).searchParams.get('jobId') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return Response.json({ error: 'invalid_job_id' }, { status: 400 });
  }

  // Kalenteritapahtuma pois ensin — sen jälkeen työn rivi on poissa eikä
  // tapahtuman tunnusta enää löydy mistään.
  await removeCalendarEventForJob(jobId);

  // Vain verkosta tullut ja vielä koskematon varaus saa kadota jäljettömiin.
  const rows = await sql<{ id: string }[]>`
    delete from tk.jobs
     where id = ${jobId} and source = 'web' and status = 'confirmed'
    returning id
  `;
  return Response.json({ ok: true, deleted: rows.length });
}

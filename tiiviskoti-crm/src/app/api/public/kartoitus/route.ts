import { z } from 'zod';
import { isSlotTaken, sql } from '@/lib/db';
import { KARTOITUS_MINUTES } from '@/lib/availability';
import { areaForPostal, kartoitusCalendarId, purgeExpiredHolds } from '@/lib/data';
import { deliverKartoitus, removeCalendarEventForJob } from '@/lib/deliver';

/* =========================================================
   Taloyhtiön veloituksettoman kartoituskäynnin varaus — SISÄINEN rajapinta.

   Tätä kutsuu vain tiiviskoti.fi:n `api/create-kartoitus.mjs` palvelimelta
   palvelimelle, jaetulla salaisuudella (`x-tk-secret`). Sama suoja kuin
   varausreitillä, vaikka hintaa ei tässä liikukaan: reitti varaa aikaa
   asentajan kalenterista, ja avoimena kuka tahansa voisi täyttää kalenterin
   olemattomilla käynneillä.

   Miksi oma reitti eikä `public/booking`:
     - Kartoitus on 0 €. Varausreitti hylkää nollahintaisen tilauksen
       tarkoituksella (`no_items` create-booking.mjs:ssä), koska nollahinta
       oli aiemmin oire rikkinäisestä hinnoittelusta.
     - Kartoituksesta ei lähde hinta-erittelyä eikä kotitalousvähennystä.
     - Kesto on kiinteä eikä hinnoittelusta johdettu.

   `tk.jobs`-rivi on samalla ajan varaus: taulun exclusion constraint estää
   päällekkäisyyden. Kartoitus varaa siis oikeasti asentajan ajan, eikä
   samaan aikaan voi enää tulla maksavaa työtä — mikä on tarkoituskin,
   koska käynti on todellinen ja auto ajaa paikalle.
   ========================================================= */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* Kartoituskäynti erottuu maksavasta työstä `source`-kentän arvolla. Se on
   vapaa tekstisarake, joten tämä ei vaatinut migraatiota — ja `price_cents = 0`
   yhdessä tämän kanssa kertoo adminissa yhdellä silmäyksellä mistä on kyse. */
const KARTOITUS_SOURCE = 'web-kartoitus';

const schema = z.object({
  calendarId: z.string().uuid(),
  startsAt: z.string().datetime(),
  association: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  role: z.string().max(100).optional(),
  email: z.string().email(),
  phone: z.string().min(1).max(60),
  address: z.string().min(1).max(300),
  postalCode: z.string().regex(/^\d{5}$/),
  city: z.string().max(100).optional(),
  doors: z.string().max(100).optional(),
  notes: z.string().max(4000).optional(),
  /* Liidin viitenumero (TK-YHT-…) lomakkeelta, jotta kalenterissa oleva käynti
     ja adminin liidirivi voi yhdistää toisiinsa. Pelkkä merkintä. */
  leadRef: z.string().max(40).optional(),
});

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
  /* Kesto tulee palvelimelta eikä pyynnöstä: kutsuja ei saa päättää kuinka
     paljon kalenterista varataan. Sama sääntö kuin matkalisällä ja
     alennuksella varausreitillä — asiakkaan syöte ei ohjaa resurssia. */
  const ends = new Date(starts.getTime() + KARTOITUS_MINUTES * 60_000);

  if (starts.getTime() < Date.now()) {
    return Response.json({ error: 'in_past' }, { status: 400 });
  }

  await purgeExpiredHolds();

  /* Kartoituksen saa varata VAIN kartoituskalenteriin. Varausreitillä sama
     tarkistus tehdään `tk.calendar_areas`-taulusta, mutta kartoituskalenteri
     ei kuulu mihinkään alueeseen — juuri siksi se ei näy kuluttajan
     saatavuushaussa. Tarkistus on siis kalenterin tunnusta vasten, ja se on
     yhtä tärkeä: ilman sitä pyyntöä muokkaamalla voisi ujuttaa maksuttoman
     käynnin keskelle asentajan maksullista työpäivää. */
  const expectedCalendarId = kartoitusCalendarId();
  if (!expectedCalendarId) {
    console.error('public/kartoitus: KARTOITUS_CALENDAR_ID puuttuu');
    return Response.json({ error: 'kartoitus_unavailable' }, { status: 503 });
  }
  if (d.calendarId.toLowerCase() !== expectedCalendarId.toLowerCase()) {
    return Response.json({ error: 'calendar_not_kartoitus' }, { status: 409 });
  }

  const [calendar] = await sql<{ id: string; google_calendar_id: string | null }[]>`
    select c.id, c.google_calendar_id from tk.calendars c
      join tk.staff s on s.id = c.staff_id
     where c.id = ${d.calendarId} and c.active and s.active
  `;
  if (!calendar) return Response.json({ error: 'calendar_unavailable' }, { status: 409 });

  /* Palvelualue tarkistetaan silti: postinumero kertoo palvelemmeko
     taloyhtiötä lainkaan. Matkalisää ei lasketa, koska käynti on maksuton. */
  const area = await areaForPostal(d.postalCode);
  if (!area) {
    return Response.json({ error: 'area_not_served', postal: d.postalCode }, { status: 409 });
  }

  const notes = [
    'Veloitukseton kartoituskäynti (taloyhtiö).',
    `Taloyhtiö: ${d.association}`,
    `Yhteyshenkilö: ${d.contactName}${d.role ? ` (${d.role})` : ''}`,
    d.doors ? `Ovien ja ikkunoiden määrä (asiakkaan arvio): ${d.doors}` : null,
    d.leadRef ? `Tarjouspyynnön viite: ${d.leadRef}` : null,
    d.notes ? `\nAsiakkaan lisätiedot:\n${d.notes}` : null,
  ].filter(Boolean).join('\n');

  try {
    const created = await sql.begin(async (tx) => {
      const [existing] = await tx<{ id: string }[]>`
        select id from tk.customers where lower(email) = lower(${d.email}) limit 1
      `;
      let customerId: string;
      if (existing) {
        customerId = existing.id;
        /* Nimeä EI ylikirjoiteta, toisin kuin varausreitillä. Sama sähköposti
           voi olla sekä isännöitsijän oma että aiemman yksityisasiakkaan, ja
           silloin "As Oy Esimerkki — Matti" korvaisi henkilön oman nimen
           asiakasrekisterissä. Puhelin ja osoite päivitetään, koska ne ovat
           tuoreempaa tietoa samasta yhteydenotosta. */
        await tx`
          update tk.customers
             set phone = ${d.phone}, address = ${d.address},
                 postal_code = ${d.postalCode}, city = coalesce(${d.city ?? null}, city)
           where id = ${customerId}
        `;
      } else {
        const [row] = await tx<{ id: string }[]>`
          insert into tk.customers (full_name, email, phone, address, postal_code, city)
          values (${`${d.association} — ${d.contactName}`}, ${d.email}, ${d.phone},
                  ${d.address}, ${d.postalCode}, ${d.city ?? null})
          returning id
        `;
        customerId = row.id;
      }

      const [job] = await tx<{ id: string; job_number: string }[]>`
        insert into tk.jobs (customer_id, calendar_id, starts_at, ends_at, status, title,
                             address, postal_code, city, price_cents, notes, source)
        values (${customerId}, ${d.calendarId}, ${starts}, ${ends}, 'confirmed',
                ${`Kartoituskäynti: ${d.association}`},
                ${d.address}, ${d.postalCode}, ${d.city ?? null},
                0, ${notes}, ${KARTOITUS_SOURCE})
        returning id, job_number
      `;
      return job;
    }) as unknown as { id: string; job_number: string };

    /* Aika on nyt varattu. Mikään tästä eteenpäin ei saa muuttaa vastausta
       virheeksi: käynti on sovittu vaikka posti tai kalenteri pettäisi.
       Epäonnistuminen kirjataan riville ja näkyy adminissa. */
    const delivery = await deliverKartoitus({
      jobId: created.id,
      jobNumber: created.job_number,
      googleCalendarId: calendar.google_calendar_id,
      association: d.association,
      contactName: d.contactName,
      role: d.role ?? null,
      phone: d.phone,
      email: d.email,
      startsAt: starts,
      endsAt: ends,
      address: d.address,
      postalCode: d.postalCode,
      city: d.city ?? null,
      doors: d.doors ?? null,
      notes: d.notes ?? null,
    });

    return Response.json({
      ok: true,
      jobId: created.id,
      jobNumber: created.job_number,
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      durationMinutes: KARTOITUS_MINUTES,
      area: area.name,
      mailSent: delivery.mail.ok,
      workOrderSent: delivery.workOrder.ok,
      calendarCreated: delivery.calendar.ok,
      mailError: delivery.mail.error,
      workOrderError: delivery.workOrder.error,
      calendarError: delivery.calendar.error,
    });
  } catch (err) {
    if (isSlotTaken(err)) return Response.json({ error: 'slot_taken' }, { status: 409 });
    console.error('public/kartoitus POST:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

/**
 * Peruu kartoituskäynnin, jos kutsujan loppuketju kaatui. Ilman tätä
 * kaatunut varaus jättäisi ajan ikuisesti varatuksi ilman että kenelläkään
 * on käyntiä kalenterissa.
 */
export async function DELETE(request: Request) {
  if (!secretOk(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const jobId = new URL(request.url).searchParams.get('jobId') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return Response.json({ error: 'invalid_job_id' }, { status: 400 });
  }

  await removeCalendarEventForJob(jobId);

  // Vain verkosta tullut ja vielä koskematon kartoitus saa kadota jäljettömiin.
  const rows = await sql<{ id: string }[]>`
    delete from tk.jobs
     where id = ${jobId} and source = ${KARTOITUS_SOURCE} and status = 'confirmed'
    returning id
  `;
  return Response.json({ ok: true, deleted: rows.length });
}

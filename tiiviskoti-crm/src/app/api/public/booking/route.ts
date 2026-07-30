import { z } from 'zod';
import { isSlotTaken, sql } from '@/lib/db';
import { areaForPostal, purgeExpiredHolds } from '@/lib/data';
import { deliverBooking, saveJobLines } from '@/lib/deliver';
import { removeCalendarEventForJob } from '@/lib/deliver';

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
  durationMinutes: z.number().int().min(15).max(600),
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
  const ends = new Date(starts.getTime() + d.durationMinutes * 60_000);

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
  const totalCents = d.workCents + travelFeeCents;

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

      const [job] = await tx<{ id: string; job_number: string }[]>`
        insert into tk.jobs (customer_id, calendar_id, starts_at, ends_at, status, title,
                             address, postal_code, city, price_cents, notes, source)
        values (${customerId}, ${d.calendarId}, ${starts}, ${ends}, 'confirmed',
                ${d.title ?? 'Tiivistetyö'}, ${d.address}, ${d.postalCode}, ${d.city ?? null},
                ${totalCents}, ${d.notes ?? null}, 'web')
        returning id, job_number
      `;
      return job;
    }) as unknown as { id: string; job_number: string };

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

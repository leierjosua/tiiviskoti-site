import { sql } from '@/lib/db';
import { kartoitusCalendarId } from '@/lib/data';
import { requireManager } from '@/lib/session';
import { Card, CardHeader, Empty } from '@/components/ui';
import { AreaCard, NewArea, type AreaData, type CalendarOption } from './ui';

export const dynamic = 'force-dynamic';

export default async function AreasPage() {
  await requireManager();

  const areas = await sql<AreaData[]>`
    select a.id, a.name, a.postal_prefixes, a.travel_fee_cents, a.active,
           a.center_postal, a.radius_km::text as radius_km, a.excluded_postals,
           coalesce(array(select ca.calendar_id::text from tk.calendar_areas ca where ca.area_id = a.id), '{}') as calendar_ids,
           (select count(*)::int from tk.jobs j
              join tk.calendar_areas ca2 on ca2.calendar_id = j.calendar_id
             where ca2.area_id = a.id) as jobs
      from tk.areas a
     order by a.active desc, a.name
  `;

  const calendarRows = await sql<{ id: string; name: string; staff_name: string }[]>`
    select c.id, c.name, s.full_name as staff_name
      from tk.calendars c
      join tk.staff s on s.id = c.staff_id
     where c.active and s.active
     order by s.full_name, c.name
  `;

  const allOrphans = await sql<{ id: string; name: string; staff_name: string }[]>`
    select c.id, c.name, s.full_name as staff_name
      from tk.calendars c
      join tk.staff s on s.id = c.staff_id
     where c.active and s.active
       and not exists (select 1 from tk.calendar_areas ca where ca.calendar_id = c.id)
  `;

  /* Kartoituskalenteri EI KUULU tähän varoitukseen. Alueen puuttuminen on sen
     kohdalla tarkoitus eikä puute: se on koko mekanismi joka pitää
     kartoituskäynnit erossa kuluttajan varauskalenterista (ks. lib/data.ts →
     kartoitusCalendarId). Kartoitusreitti löytää kalenterin tunnuksella, ei
     alueen kautta, joten aikoja voi varata verkosta ilman aluetta.

     MIKSI TÄMÄ ON TÄRKEÄÄ: varoitus kehotti liittämään alueen, ja juuri se
     tehtiin 24.8.2026 — jolloin maksava keikka varautui kartoituskalenteriin.
     Väärä neuvo hallintapaneelissa on pahempi kuin puuttuva neuvo. */
  const kartoitusId = kartoitusCalendarId()?.toLowerCase() ?? null;
  const orphanCalendars = allOrphans.filter((c) => c.id.toLowerCase() !== kartoitusId);
  const kartoitusCal = allOrphans.find((c) => c.id.toLowerCase() === kartoitusId);

  /* Kartoituskalenteria ei tarjota valittavaksi lainkaan — ks. yllä miksi
     sille ei koskaan liitetä aluetta. Saman henkilön useampi kalenteri
     erotellaan kalenterin nimellä. */
  const perStaff = new Map<string, number>();
  for (const c of calendarRows) perStaff.set(c.staff_name, (perStaff.get(c.staff_name) ?? 0) + 1);
  const calendars: CalendarOption[] = calendarRows
    .filter((c) => c.id.toLowerCase() !== kartoitusId)
    .map((c) => ({
      id: c.id,
      label: (perStaff.get(c.staff_name) ?? 0) > 1 ? `${c.staff_name} — ${c.name}` : c.staff_name,
      otherAreas: areas.filter((a) => a.active && a.calendar_ids.includes(c.id))
        .map((a) => ({ id: a.id, name: a.name })),
    }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight text-text">Palvelualueet</h1>
        <p className="text-sm text-muted">
          Asiakas syöttää postinumeron, ja siitä ratkeaa kenen kalenterista ajat näytetään —
          kaikkien asentajien, joiden alueeseen postinumero osuu. Alueen voi rajata etuliitteillä
          tai etäisyytenä postinumerosta (esim. asentajan koti + 25 km). Postinumero joka ei osu
          mihinkään alueeseen ei saa varata aikaa — hänestä tulee liidi.
        </p>
      </header>

      {orphanCalendars.length > 0 && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          <b>
            {orphanCalendars.length} kalenteri{orphanCalendars.length > 1 ? 'a' : ''} ilman aluetta
          </b>
          <span className="mt-1 block text-warn/80">
            {orphanCalendars.map((c) => `${c.staff_name} — ${c.name}`).join(', ')}.
            Näihin ei voi varata aikaa verkosta ennen kuin alue on liitetty (kohdasta Työajat).
          </span>
        </div>
      )}

      {kartoitusCal && (
        <div className="rounded-lg border border-info/40 bg-info/10 px-4 py-3 text-sm text-info">
          <b>{kartoitusCal.staff_name} — {kartoitusCal.name}</b>
          <span className="mt-1 block text-info/80">
            Tälle kalenterille <b>ei liitetä aluetta</b>, eikä se ole puute: juuri siksi
            kartoituskäynnit pysyvät erossa tavallisesta varauskalenterista. Ajat varataan
            taloyhtiösivun omalta reitiltä, joka löytää kalenterin tunnuksella. Jos liität
            alueen, kartoitusajat alkavat näkyä myös tavallisessa varauksessa.
          </span>
        </div>
      )}

      <Card>
        <CardHeader title="Alueet" action={<NewArea calendars={calendars} />} />
        {areas.length === 0 ? (
          <Empty>Ei alueita. Luo ensimmäinen yläkulmasta.</Empty>
        ) : (
          <div>
            {areas.map((area) => <AreaCard key={area.id} area={area} calendars={calendars} />)}
          </div>
        )}
      </Card>
    </div>
  );
}

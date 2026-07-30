import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { Card, CardHeader, Empty } from '@/components/ui';
import { AreaRow, CreateAreaForm, DeleteArea } from './ui';

export const dynamic = 'force-dynamic';

type AreaRowData = {
  id: string; name: string; postal_prefixes: string[];
  travel_fee_cents: number; active: boolean;
  calendars: number; jobs: number; prefix_count: number;
};

export default async function AreasPage() {
  await requireManager();

  const areas = await sql<AreaRowData[]>`
    select a.id, a.name, a.postal_prefixes, a.travel_fee_cents, a.active,
           (select count(*)::int from tk.calendar_areas ca where ca.area_id = a.id) as calendars,
           (select count(*)::int from tk.jobs j
              join tk.calendar_areas ca2 on ca2.calendar_id = j.calendar_id
             where ca2.area_id = a.id) as jobs,
           coalesce(array_length(a.postal_prefixes, 1), 0) as prefix_count
      from tk.areas a
     order by a.active desc, a.name
  `;

  const orphanCalendars = await sql<{ name: string; staff_name: string }[]>`
    select c.name, s.full_name as staff_name
      from tk.calendars c
      join tk.staff s on s.id = c.staff_id
     where c.active and s.active
       and not exists (select 1 from tk.calendar_areas ca where ca.calendar_id = c.id)
  `;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight text-text">Palvelualueet</h1>
        <p className="text-sm text-muted">
          Asiakas syöttää postinumeron, ja siitä ratkeaa kenen kalenterista ajat näytetään.
          Postinumero joka ei osu mihinkään alueeseen ei saa varata aikaa — hänestä tulee liidi.
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

      <div className="grid gap-6 lg:grid-cols-[1fr_330px]">
        <Card>
          <CardHeader title="Alueet" />
          {areas.length === 0 ? (
            <Empty>Ei alueita. Luo ensimmäinen oikealta.</Empty>
          ) : (
            <div>
              {areas.map((area) => (
                <div key={area.id} className={area.active ? '' : 'opacity-60'}>
                  <AreaRow area={area} />
                  <div className="flex items-center justify-between px-4 pb-3 text-xs text-faint">
                    <span>
                      {area.prefix_count} etuliite{area.prefix_count === 1 ? '' : 'ttä'}
                      {area.jobs > 0 && ` · ${area.jobs} työtä`}
                    </span>
                    <DeleteArea id={area.id} name={area.name} hasJobs={area.jobs > 0} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Uusi alue" />
          <div className="p-4">
            <CreateAreaForm />
          </div>
        </Card>
      </div>
    </div>
  );
}

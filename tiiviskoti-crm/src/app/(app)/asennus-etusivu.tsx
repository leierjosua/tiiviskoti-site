import Link from 'next/link';
import { sql } from '@/lib/db';
import type { Staff } from '@/lib/session';
import {
  addDays, dateKeyOf, formatDateKey, helsinkiDateTime, isoWeekday, timeOf, weekdayShort,
} from '@/lib/time';
import { Card, CardHeader, StatusBadge } from '@/components/ui';

/* =========================================================
   Asennusnäkymän etusivu.

   Tämä ei ole yrityksen tilannekuva vaan yhden ihmisen työlista: mitä
   minä teen tänään, missä, ja mitä tulee seuraavaksi. Kaikki luvut ja
   rivit on rajattu kirjautuneen henkilön kalentereihin — myös silloin kun
   katsoja on toimistolainen, joka vaihtoi näkymää. Muuten näkymä
   valehtelisi siitä mitä se lupaa näyttää.

   Kaksi paneelia rinnakkain: TÄNÄÄN on päivän tehtävälista toimintoineen
   (reitti, soitto, tehdyksi), TULEVAT on pelkkä silmäys eteenpäin. Ne
   ovat tarkoituksella eri painoisia — päivän keikka on tekemistä, ensi
   viikon keikka on tietoa.
   ========================================================= */

type Job = {
  id: string; job_number: string; starts_at: Date; ends_at: Date; status: string;
  title: string; address: string | null; postal_code: string | null; city: string | null;
  price_cents: number; notes: string | null;
  customer_name: string | null; customer_phone: string | null;
};

const eur = (cents: number) => (cents / 100).toLocaleString('fi-FI', { maximumFractionDigits: 0 }) + ' €';

const addressOf = (j: Job) => [j.address, j.postal_code, j.city].filter(Boolean).join(', ');

const mapUrl = (j: Job) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressOf(j))}`;

/** Lyhyt päivämäärä rivin alle: 'ke 9.9.2026'. */
const dayLabel = (d: Date) => {
  const key = dateKeyOf(d);
  return `${weekdayShort(isoWeekday(key))} ${formatDateKey(key)}`;
};

function Metric({ label, value, sub, tone = 'plain' }: {
  label: string; value: string; sub?: string; tone?: 'plain' | 'accent';
}) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className={`mt-2 text-[32px] leading-none font-extrabold tabular ${
        tone === 'accent' ? 'text-accent' : 'text-text'
      }`}>
        {value}
      </p>
      {sub && <p className="mt-2 text-xs text-faint">{sub}</p>}
    </Card>
  );
}

/* Keikkarivi. Vasemmalla aika, päivä ja tila allekkain; keskellä kuka ja
   mitä; oikealla hinta. Sama muoto kummassakin paneelissa, jotta silmä
   löytää kellonajan aina samasta kohdasta.

   Päivä jätetään pois tämän päivän listalta: "tänään" on jo otsikossa. */
function JobRow({ job, showDay, children }: {
  job: Job; showDay?: boolean; children?: React.ReactNode;
}) {
  const address = addressOf(job);
  return (
    <li className="px-4 py-3.5 transition-colors hover:bg-ink-700">
      <div className="flex gap-3">
        <div className="w-[104px] shrink-0">
          <div className="text-[17px] leading-none font-bold tabular text-text">
            {timeOf(job.starts_at)}
          </div>
          {showDay && (
            <div className="mt-1 text-xs tabular text-faint">{dayLabel(job.starts_at)}</div>
          )}
          <div className="mt-1.5">
            <StatusBadge status={job.status} />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <Link href={`/tyot/${job.id}`} className="font-bold text-text hover:text-accent">
            {job.customer_name ?? job.title}
          </Link>
          <p className="truncate text-sm text-muted">{job.title}</p>
          <p className="truncate text-sm text-faint">
            {address ? `◎ ${address}` : 'Ei osoitetta'}
          </p>
        </div>

        <div className="shrink-0 text-right text-sm font-bold tabular text-text">
          {eur(job.price_cents)}
        </div>
      </div>

      {job.notes && (
        <p className="mt-2.5 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
          {job.notes}
        </p>
      )}

      {children}
    </li>
  );
}

export default async function AsennusEtusivu({ staff }: { staff: Staff }) {
  const today = dateKeyOf(new Date());
  const dayStart = helsinkiDateTime(today, '00:00');
  const dayEnd = helsinkiDateTime(addDays(today, 1), '00:00');
  const monthAgo = helsinkiDateTime(addDays(today, -30), '00:00');
  const horizon = helsinkiDateTime(addDays(today, 60), '00:00');

  /* Palasina eikä muuttujina: postgres.js:n fragmentti on kyselyolio, ja
     sama olio kolmessa kyselyssä on turha riski. Funktio antaa joka
     kutsulla tuoreen. */
  const mine = () => sql`
    j.calendar_id in (select c.id from tk.calendars c where c.staff_id = ${staff.id})
  `;

  const columns = () => sql`
    j.id, j.job_number, j.starts_at, j.ends_at, j.status::text as status, j.title,
    j.address, j.postal_code, j.city, j.price_cents, j.notes,
    cu.full_name as customer_name, cu.phone as customer_phone
  `;

  const [upcoming, overdue, stats] = await Promise.all([
    sql<Job[]>`
      select ${columns()}
        from tk.jobs j
        left join tk.customers cu on cu.id = j.customer_id
       where ${mine()}
         and j.starts_at >= ${dayStart.toISOString()}
         and j.starts_at <  ${horizon.toISOString()}
         and j.status <> 'cancelled'
       order by j.starts_at
    `,
    /* Rästit: keikan aika on mennyt eikä sitä ole merkitty tehdyksi.
       Tämä on ainoa kohta jossa asentajan oma huolimattomuus näkyy hänelle
       itselleen — toimisto näkee sen laskutuksesta viikkoja myöhemmin. */
    sql<Job[]>`
      select ${columns()}
        from tk.jobs j
        left join tk.customers cu on cu.id = j.customer_id
       where ${mine()}
         and j.ends_at < now()
         and j.ends_at >= ${helsinkiDateTime(addDays(today, -90), '00:00').toISOString()}
         and j.status in ('hold', 'tentative', 'confirmed')
       order by j.starts_at desc
    `,
    sql<{ valmiit: number; valmiit_arvo: number; tulevat_arvo: number }[]>`
      select
        count(*) filter (where j.status = 'done'
                           and j.starts_at >= ${monthAgo.toISOString()}
                           and j.starts_at <  ${dayEnd.toISOString()})::int          as valmiit,
        coalesce(sum(j.price_cents) filter (where j.status = 'done'
                           and j.starts_at >= ${monthAgo.toISOString()}
                           and j.starts_at <  ${dayEnd.toISOString()}), 0)::int      as valmiit_arvo,
        coalesce(sum(j.price_cents) filter (where j.status <> 'cancelled'
                           and j.starts_at >= ${dayStart.toISOString()}), 0)::int    as tulevat_arvo
      from tk.jobs j
      where ${mine()}
    `,
  ]);

  const s = stats[0] ?? { valmiit: 0, valmiit_arvo: 0, tulevat_arvo: 0 };
  const todayJobs = upcoming.filter((j) => dateKeyOf(j.starts_at) === today);
  const laterJobs = upcoming.filter((j) => dateKeyOf(j.starts_at) !== today);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-text">
            Etusivu
          </h1>
          <p className="mt-1 text-sm text-muted">
            {staff.fullName} · {formatDateKey(today)}
          </p>
        </div>

        {overdue.length > 0 && (
          <a
            href="#rastit"
            className="inline-flex items-center gap-2 rounded-full border border-warn/40 bg-warn/10
                       px-3.5 py-2 text-sm font-bold text-warn transition-colors hover:bg-warn/15"
          >
            <span aria-hidden>⚠</span>
            {overdue.length} {overdue.length === 1 ? 'rästi' : 'rästiä'} →
          </a>
        )}
      </header>

      {/* Neljä lukua: päivä, edessä, takana ja raha. Kaksi saraketta jo
          puhelimessa, koska nämä katsotaan pakettiauton penkillä. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Tänään" value={String(todayJobs.length)} tone="accent"
                sub={todayJobs.length === 0 ? 'ei keikkoja' : 'keikkaa tänään'} />
        <Metric label="Tulevat" value={String(laterJobs.length)}
                sub="tästä eteenpäin" />
        <Metric label="Valmiit" value={String(s.valmiit)}
                sub="viimeiset 30 pv" />
        <Metric label="Valmiiden arvo" value={eur(s.valmiit_arvo)}
                sub={`Sovittu yhteensä ${eur(s.tulevat_arvo)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Tänään */}
        <Card className="overflow-hidden">
          <CardHeader
            title="Tänään"
            action={
              <span className="rounded-full border border-line bg-ink-700 px-2.5 py-1 text-xs font-bold text-muted">
                {todayJobs.length} {todayJobs.length === 1 ? 'keikka' : 'keikkaa'}
              </span>
            }
          />
          {todayJobs.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <p className="text-[15px] font-bold text-text">Ei keikkoja tänään</p>
              <p className="mt-1 text-sm text-faint">Kaikki vapaa!</p>
            </div>
          ) : (
            <ul className="divide-y divide-line-soft">
              {todayJobs.map((job) => (
                <JobRow key={job.id} job={job}>
                  {/* Päivän rivillä on napit, tulevien rivillä ei: reitti ja
                      soitto ovat tarpeen vasta kun ollaan matkalla. */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 pl-[116px]">
                    {job.address && (
                      <a href={mapUrl(job)} target="_blank" rel="noreferrer"
                         className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink">
                        Reitti
                      </a>
                    )}
                    {job.customer_phone && (
                      <a href={`tel:${job.customer_phone.replace(/\s/g, '')}`}
                         className="rounded-lg border border-line px-3 py-2 text-sm font-medium">
                        Soita
                      </a>
                    )}
                    {job.status !== 'done' && (
                      <Link href={`/tyot/${job.id}/viimeistely`}
                            className="rounded-lg border border-accent px-3 py-2 text-sm font-semibold text-accent
                                       hover:bg-accent-dim">
                        Viimeistele
                      </Link>
                    )}
                  </div>
                </JobRow>
              ))}
            </ul>
          )}
        </Card>

        {/* Tulevat työt */}
        <Card className="overflow-hidden">
          <CardHeader
            title="Tulevat työt"
            action={
              <Link href="/kalenteri" className="text-xs font-semibold text-accent hover:underline">
                Kalenteri →
              </Link>
            }
          />
          {laterJobs.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <p className="text-[15px] font-bold text-text">Ei tulevia keikkoja</p>
              <p className="mt-1 text-sm text-faint">Kalenteri on tyhjä tästä eteenpäin.</p>
            </div>
          ) : (
            <ul className="max-h-[720px] divide-y divide-line-soft overflow-y-auto">
              {laterJobs.map((job) => <JobRow key={job.id} job={job} showDay />)}
            </ul>
          )}
        </Card>
      </div>

      {/* Rästit viimeisenä: ne ovat tärkeitä mutta menneitä, eivätkä saa
          työntää päivän listaa alaspäin. */}
      {overdue.length > 0 && (
        <section id="rastit" className="scroll-mt-6">
        <Card className="overflow-hidden">
          <CardHeader
            title={`Rästit (${overdue.length})`}
            action={<span className="text-xs text-faint">Aika mennyt, ei merkitty tehdyksi</span>}
          />
          <ul className="divide-y divide-line-soft">
            {overdue.map((job) => (
              <JobRow key={job.id} job={job} showDay>
                <div className="mt-3 flex flex-wrap items-center gap-2 pl-[116px]">
                  <Link href={`/tyot/${job.id}/viimeistely`}
                        className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink
                                   hover:bg-[#1A6340]">
                    Viimeistele
                  </Link>
                </div>
              </JobRow>
            ))}
          </ul>
        </Card>
        </section>
      )}
    </div>
  );
}

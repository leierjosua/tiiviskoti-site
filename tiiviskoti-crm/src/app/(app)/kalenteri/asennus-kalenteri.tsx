import Link from 'next/link';
import { sql } from '@/lib/db';
import type { Staff } from '@/lib/session';
import {
  addDays, dateKeyOf, formatDateKey, helsinkiDateTime, isoWeekday, timeOf, todayKey, weekdayShort,
} from '@/lib/time';
import { Card, Empty, StatusBadge } from '@/components/ui';

/* =========================================================
   Asennusnäkymän kalenteri.

   Yhden ihmisen viikko, ei koko yrityksen. Siksi tässä ei ole
   asentajavalitsinta eikä värikoodeja henkilöittäin — kaikki lohkot ovat
   saman ihmisen, ja väri on vapautunut kertomaan tilan: vahvistettu,
   alustava, tehty. Toimiston kalenterissa väri kertoo kuka tekee, koska
   siellä se on se kysymys.

   Ruudukon tuntiväli lasketaan viikon omista töistä. Kiinteä 07–19
   piilotti kuudelta alkavan keikan kokonaan, ja piilotettu keikka on
   pahempi vika kuin turha tyhjä rivi.
   ========================================================= */

type Job = {
  id: string; job_number: string; starts_at: Date; ends_at: Date;
  status: 'hold' | 'tentative' | 'confirmed' | 'done' | 'cancelled';
  title: string; address: string | null; postal_code: string | null; city: string | null;
  price_cents: number; customer_name: string | null;
};

const HOUR_PX = 52;

const eur = (cents: number) => (cents / 100).toLocaleString('fi-FI', { maximumFractionDigits: 0 }) + ' €';

/* Lohkon väri tilan mukaan. Sama merkitys kuin StatusBadgessa, jotta
   ruudukon väri ja rivin merkki eivät kerro eri tarinaa. */
const BLOCK: Record<Job['status'], string> = {
  hold:      'border-l-faint bg-ink-700 text-muted',
  tentative: 'border-l-warn bg-warn/10 text-warn',
  confirmed: 'border-l-accent bg-accent-dim text-accent',
  done:      'border-l-info bg-info/10 text-info',
  cancelled: 'border-l-faint bg-ink-700 text-faint line-through',
};

const FILTERS = [
  { key: 'kaikki', label: 'Kaikki' },
  { key: 'tentative', label: 'Alustava' },
  { key: 'confirmed', label: 'Vahvistettu' },
  { key: 'done', label: 'Tehty' },
  { key: 'hold', label: 'Varauksessa' },
  { key: 'cancelled', label: 'Peruttu' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

function mondayOf(dateKey: string) {
  return addDays(dateKey, -(isoWeekday(dateKey) - 1));
}

function Metric({ label, value, sub, tone = 'plain' }: {
  label: string; value: string; sub?: string; tone?: 'plain' | 'accent';
}) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className={`mt-2 text-[32px] leading-none font-extrabold tabular ${
        tone === 'accent' ? 'text-accent' : 'text-text'
      }`}>{value}</p>
      {sub && <p className="mt-2 text-xs text-faint">{sub}</p>}
    </Card>
  );
}

/** Rivi listanäkymään ja puhelimeen. */
function JobLine({ job, showDay }: { job: Job; showDay?: boolean }) {
  const address = [job.address, job.postal_code, job.city].filter(Boolean).join(', ');
  return (
    <li>
      <Link href={`/tyot/${job.id}`}
            className="flex gap-3 px-4 py-3 transition-colors hover:bg-ink-700">
        <div className="w-[104px] shrink-0">
          <div className="text-[15px] leading-none font-bold tabular text-text">
            {timeOf(job.starts_at)}
          </div>
          {showDay && (
            <div className="mt-1 text-xs tabular text-faint">
              {weekdayShort(isoWeekday(dateKeyOf(job.starts_at)))} {formatDateKey(dateKeyOf(job.starts_at))}
            </div>
          )}
          <div className="mt-1.5"><StatusBadge status={job.status} /></div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-text">{job.customer_name ?? job.title}</p>
          <p className="truncate text-sm text-muted">{job.title}</p>
          <p className="truncate text-sm text-faint">{address || 'Ei osoitetta'}</p>
        </div>
        <div className="shrink-0 text-right text-sm font-bold tabular text-text">
          {eur(job.price_cents)}
        </div>
      </Link>
    </li>
  );
}


/* Laskuttamatta: tehty keikka jota ei ole merkitty maksetuksi.

   `paid` tulee migraatiosta 016, joka ajetaan käsin postgres-roolilla.
   Ennen sitä maksutilaa ei ole olemassa, ja paras saatavilla oleva
   arvaus on lähtenyt kuitti — se on väärä mittari (käteisellä maksettu
   keikka ilman sähköpostia näyttää maksamattomalta), mutta parempi kuin
   kaatunut sivu. Kun migraatio on ajettu, tätä haaraa ei enää käytetä.

   Ei viikkorajausta: vanhin laskuttamaton on juuri se joka pitää nähdä. */
async function unbilledFor(staffId: string, sinceIso: string): Promise<{ kpl: number; arvo: number }[]> {
  const mine = sql`
    j.calendar_id in (select c.id from tk.calendars c where c.staff_id = ${staffId})
  `;
  try {
    return await sql<{ kpl: number; arvo: number }[]>`
      select count(*)::int as kpl, coalesce(sum(j.price_cents), 0)::int as arvo
        from tk.jobs j
       where ${mine}
         and j.status = 'done' and not j.paid
         and j.starts_at >= ${sinceIso}
    `;
  } catch (err) {
    if (typeof err !== 'object' || err === null || (err as { code?: string }).code !== '42703') throw err;
    return sql<{ kpl: number; arvo: number }[]>`
      select count(*)::int as kpl, coalesce(sum(j.price_cents), 0)::int as arvo
        from tk.jobs j
       where j.calendar_id in (select c.id from tk.calendars c where c.staff_id = ${staffId})
         and j.status = 'done'
         and j.starts_at >= ${sinceIso}
         and not exists (
           select 1 from tk.mail_log m
            where m.job_id = j.id and m.kind = 'receipt' and m.error is null
         )
    `;
  }
}

export default async function AsennusKalenteri({
  staff, viikko, tila, haku, nakyma,
}: {
  staff: Staff;
  viikko?: string;
  tila?: string;
  haku?: string;
  nakyma?: string;
}) {
  const today = todayKey();
  const weekParam = /^\d{4}-\d{2}-\d{2}$/.test(viikko ?? '') ? viikko! : undefined;
  const monday = mondayOf(weekParam ?? today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const filter: FilterKey =
    (FILTERS.find((f) => f.key === tila)?.key as FilterKey | undefined) ?? 'kaikki';
  const query = (haku ?? '').trim();

  /* Haku ei rajoitu viikkoon: asiakasta etsitään nimellä, ei päivämäärällä,
     eikä etsijä tiedä millä viikolla keikka on. Haku pakottaa siksi myös
     listanäkymään — ruudukossa näkyisi vain se murto-osa joka osuu tälle
     viikolle. */
  const searching = query.length >= 2;
  const asList = searching || nakyma === 'lista';

  const from = searching
    ? helsinkiDateTime(addDays(today, -180), '00:00')
    : helsinkiDateTime(monday, '00:00');
  const to = searching
    ? helsinkiDateTime(addDays(today, 180), '00:00')
    : helsinkiDateTime(addDays(monday, 7), '00:00');

  const mine = () => sql`
    j.calendar_id in (select c.id from tk.calendars c where c.staff_id = ${staff.id})
  `;

  const [rows, unbilled] = await Promise.all([
    sql<Job[]>`
      select j.id, j.job_number, j.starts_at, j.ends_at, j.status, j.title,
             j.address, j.postal_code, j.city, j.price_cents,
             cu.full_name as customer_name
        from tk.jobs j
        left join tk.customers cu on cu.id = j.customer_id
       where ${mine()}
         and j.starts_at >= ${from.toISOString()}
         and j.starts_at <  ${to.toISOString()}
       order by j.starts_at
    `,
    unbilledFor(staff.id, helsinkiDateTime(addDays(today, -180), '00:00').toISOString()),
  ]);

  const needle = query.toLowerCase();
  const shown = rows
    .filter((j) => (filter === 'kaikki' ? j.status !== 'cancelled' : j.status === filter))
    .filter((j) => !searching || [
      j.customer_name, j.title, j.address, j.city, j.postal_code, j.job_number,
    ].some((v) => v?.toLowerCase().includes(needle)));

  const priced = shown.filter((j) => j.price_cents > 0);
  const total = priced.reduce((s, j) => s + j.price_cents, 0);
  const avg = priced.length ? Math.round(total / priced.length) : 0;
  const count = (s: Job['status']) => shown.filter((j) => j.status === s).length;
  const bill = unbilled[0] ?? { kpl: 0, arvo: 0 };

  /* Ruudukon tuntiväli: 07–19 pohjana, levitettynä niin että viikon
     aikaisin alku ja myöhäisin loppu mahtuvat sisään. */
  const hourStart = Math.min(7, ...shown.map((j) => Number(timeOf(j.starts_at).slice(0, 2))));
  const hourEnd = Math.max(19, ...shown.map((j) => Math.ceil(
    Number(timeOf(j.ends_at).slice(0, 2)) + (Number(timeOf(j.ends_at).slice(3)) > 0 ? 1 : 0),
  )));
  const hours = Array.from({ length: Math.max(1, hourEnd - hourStart) }, (_, i) => hourStart + i);

  /** Linkin query säilyttää kaiken paitsi sen mitä juuri vaihdetaan. */
  const href = (p: { viikko?: string; tila?: string; haku?: string; nakyma?: string }) => {
    const sp = new URLSearchParams();
    const v = 'viikko' in p ? p.viikko : weekParam;
    const t = 'tila' in p ? p.tila : (filter === 'kaikki' ? undefined : filter);
    const q = 'haku' in p ? p.haku : (query || undefined);
    const n = 'nakyma' in p ? p.nakyma : (nakyma === 'lista' ? 'lista' : undefined);
    if (v) sp.set('viikko', v);
    if (t) sp.set('tila', t);
    if (q) sp.set('haku', q);
    if (n) sp.set('nakyma', n);
    const s = sp.toString();
    return `/kalenteri${s ? `?${s}` : ''}`;
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
      active ? 'border-accent bg-accent-dim text-accent' : 'border-line text-muted hover:text-text'
    }`;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-text">
            Kalenteri
          </h1>
          <p className="mt-1 text-sm text-muted tabular">
            {searching
              ? `Haku: ${query}`
              : `${formatDateKey(monday)} – ${formatDateKey(addDays(monday, 6))}`}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-accent/35 bg-accent-dim
                         px-3.5 py-2 text-sm font-bold text-accent">
          <span aria-hidden className="h-2 w-2 rounded-full bg-accent" />
          {staff.fullName}
          <span className="tabular">{eur(total)}</span>
        </span>
      </header>

      {/* Haku omalla rivillään: se on ainoa kenttä, ja lomake vaatii oman
          submitinsa toisin kuin viereiset linkkisuodattimet. */}
      <form action="/kalenteri" className="flex gap-2">
        {weekParam && <input type="hidden" name="viikko" value={weekParam} />}
        {filter !== 'kaikki' && <input type="hidden" name="tila" value={filter} />}
        <input
          type="search"
          name="haku"
          defaultValue={query}
          placeholder="Hae asiakkaalla, osoitteella tai työnumerolla…"
          className="w-full max-w-md rounded-lg border border-line bg-ink-800 px-3 py-2.5 text-sm
                     text-text placeholder:text-faint focus:border-accent focus:ring-2
                     focus:ring-accent/20 focus:outline-none"
        />
        <button type="submit"
                className="rounded-lg border border-line bg-ink-800 px-4 py-2.5 text-sm font-semibold
                           text-text transition-colors hover:bg-ink-700">
          Hae
        </button>
        {searching && (
          <Link href={href({ haku: undefined, nakyma: undefined })}
                className="rounded-lg px-3 py-2.5 text-sm font-semibold text-muted hover:text-text">
            Tyhjennä
          </Link>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key}
                href={href({ tila: f.key === 'kaikki' ? undefined : f.key })}
                className={chip(filter === f.key)}>
            {f.label}
          </Link>
        ))}
      </div>

      {!searching && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-line">
            <Link href={href({ nakyma: undefined })}
                  className={`px-3 py-1.5 text-sm font-semibold ${
                    asList ? 'text-muted hover:text-text' : 'bg-accent-dim text-accent'}`}>
              Viikko
            </Link>
            <Link href={href({ nakyma: 'lista' })}
                  className={`border-l border-line px-3 py-1.5 text-sm font-semibold ${
                    asList ? 'bg-accent-dim text-accent' : 'text-muted hover:text-text'}`}>
              Lista
            </Link>
          </div>

          <div className="flex items-center gap-1">
            <Link href={href({ viikko: addDays(monday, -7) })}
                  aria-label="Edellinen viikko"
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:text-text">
              ←
            </Link>
            <Link href={href({ viikko: addDays(monday, 7) })}
                  aria-label="Seuraava viikko"
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:text-text">
              →
            </Link>
          </div>

          <Link href={href({ viikko: undefined })}
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-muted hover:text-text">
            Tänään
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Keikat" value={String(shown.length)}
                sub={`${count('confirmed')} vahv. · ${count('done')} tehty · ${count('tentative')} alustava`} />
        <Metric label="Myynti" value={eur(total)} tone="accent"
                sub={priced.length < shown.length
                  ? `${priced.length}/${shown.length} hinnoiteltu`
                  : (searching ? 'hakutuloksista' : 'tällä viikolla')} />
        <Metric label="Keskihinta" value={priced.length ? eur(avg) : '—'} sub="per hinnoiteltu keikka" />
        <Metric label="Laskuttamatta" value={eur(bill.arvo)}
                sub={`${bill.kpl} valmista keikkaa`} />
      </div>

      {/* Lista: haussa aina, muuten valinnan mukaan. Puhelimessa ruudukko ei
          ole vaihtoehto — 900 px:n viikko näyttäisi 390 px:n ruudulla kaksi
          päivää, eli koko viikkonäkymän idea katoaisi. */}
      <Card className={asList ? '' : 'md:hidden'}>
        {shown.length === 0 ? (
          <Empty>{searching ? 'Ei osumia.' : 'Ei keikkoja tällä viikolla.'}</Empty>
        ) : (
          <ul className="divide-y divide-line-soft">
            {shown.map((job) => <JobLine key={job.id} job={job} showDay />)}
          </ul>
        )}
      </Card>

      {!asList && (
        <Card className="hidden overflow-x-auto md:block">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-line">
              <div />
              {days.map((day) => (
                <div key={day}
                     className={`px-2 py-2 text-center text-xs ${
                       day === today ? 'text-accent' : 'text-muted'}`}>
                  <div className="font-medium uppercase">{weekdayShort(isoWeekday(day))}</div>
                  <div className={`text-[17px] font-extrabold tabular ${
                    day === today ? 'text-accent' : 'text-text'}`}>
                    {Number(day.slice(8))}
                  </div>
                </div>
              ))}
            </div>

            <div className="relative grid grid-cols-[56px_repeat(7,1fr)]">
              <div>
                {hours.map((h) => (
                  <div key={h} style={{ height: HOUR_PX }}
                       className="pr-2 pt-0.5 text-right text-[11px] text-faint tabular">
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {days.map((day) => {
                const dayJobs = shown.filter((j) => dateKeyOf(j.starts_at) === day);
                return (
                  <div key={day} className={`relative border-l border-line-soft ${
                    day === today ? 'bg-accent-dim/40' : ''}`}>
                    {hours.map((h) => (
                      <div key={h} style={{ height: HOUR_PX }} className="border-b border-line-soft" />
                    ))}

                    {dayJobs.map((job) => {
                      const [sh, sm] = timeOf(job.starts_at).split(':').map(Number);
                      const minutes = (job.ends_at.getTime() - job.starts_at.getTime()) / 60_000;
                      const top = (sh + sm / 60 - hourStart) * HOUR_PX;
                      const height = Math.max(28, (minutes / 60) * HOUR_PX - 2);

                      return (
                        <Link
                          key={job.id}
                          href={`/tyot/${job.id}`}
                          style={{ top, height }}
                          className={`absolute inset-x-1 overflow-hidden rounded-md border border-line
                                      border-l-[3px] px-1.5 py-1 text-[11px] leading-tight shadow-sm
                                      transition-shadow hover:shadow-md ${BLOCK[job.status]}`}
                        >
                          <div className="tabular font-bold">{timeOf(job.starts_at)}</div>
                          <div className="truncate font-semibold">{job.customer_name ?? job.title}</div>
                          <div className="truncate opacity-80">{job.title}</div>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

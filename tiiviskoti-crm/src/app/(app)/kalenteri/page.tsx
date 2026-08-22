import Link from 'next/link';
import { listCalendars, listJobs } from '@/lib/data';
import {
  addDays, dateKeyOf, formatDateKey, helsinkiDateTime, isoWeekday, timeOf, todayKey, weekdayShort,
} from '@/lib/time';
import { Card, Empty } from '@/components/ui';
import { requireStaff, viewMode } from '@/lib/session';
import AsennusKalenteri from './asennus-kalenteri';

export const dynamic = 'force-dynamic';

const DAY_START = 6;   // ruudukon ensimmäinen tunti
const DAY_END = 20;
const HOUR_PX = 52;

const eur = (cents: number) => (cents / 100).toLocaleString('fi-FI', { maximumFractionDigits: 0 }) + ' €';

/** Maanantai, johon annettu päivä kuuluu. */
function mondayOf(dateKey: string) {
  return addDays(dateKey, -(isoWeekday(dateKey) - 1));
}

/* Asentajien erotteluun: kalenteri saa värin järjestysnumeronsa mukaan.
   Vaalealla pinnalla tarvitaan kylläisempi täyttö ja vasen reunaviiva —
   pelkkä 15 %:n sävy katoaa valkoista vasten. */
const COLORS = [
  'border-l-accent bg-accent-dim text-accent',
  'border-l-info bg-info/10 text-info',
  'border-l-warn bg-warn/10 text-warn',
  'border-l-danger bg-danger/10 text-danger',
];
/* Sama järjestys pelkkänä tekstivärinä: asentajan nimi värjätään tällä. */
const TEXT_COLORS = ['text-accent', 'text-info', 'text-warn', 'text-danger'];

/* Pieni yhteenvetokortti (sama tyyli kuin etusivun mittarit). */
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

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{
    viikko?: string; asentaja?: string; tila?: string; haku?: string; nakyma?: string;
  }>;
}) {
  const { viikko, asentaja, tila, haku, nakyma } = await searchParams;
  const me = await requireStaff();

  /* Asennusnäkymässä kalenteri on yhden ihmisen viikko. Se ei ole tämän
     näkymän suodatus vaan eri kysymys, joten se on oma komponenttinsa. */
  if (await viewMode(me) === 'asennus') {
    return <AsennusKalenteri staff={me} viikko={viikko} tila={tila} haku={haku} nakyma={nakyma} />;
  }

  const today = todayKey();
  const weekParam = /^\d{4}-\d{2}-\d{2}$/.test(viikko ?? '') ? viikko! : undefined;
  const monday = mondayOf(weekParam ?? today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const from = helsinkiDateTime(monday, '00:00');
  const to = helsinkiDateTime(addDays(monday, 7), '00:00');

  const [jobs, calendars] = await Promise.all([
    listJobs(from.toISOString(), to.toISOString()),
    listCalendars(true),
  ]);

  const colorOf = new Map(calendars.map((c, i) => [c.id, COLORS[i % COLORS.length]]));
  const calToStaff = new Map(calendars.map((c) => [c.id, c.staff_id]));

  /* Asentajat uniikkina henkilön mukaan. Väri periytyy henkilön ensimmäisestä
     kalenterista, jolloin nimen väri täsmää hänen keikkalohkojensa väriin. */
  const staffIdx = new Map<string, number>();
  calendars.forEach((c, i) => { if (!staffIdx.has(c.staff_id)) staffIdx.set(c.staff_id, i); });
  const staff = [...staffIdx.keys()].map((id) => {
    const i = staffIdx.get(id)!;
    return {
      id,
      name: calendars.find((c) => c.staff_id === id)!.staff_name,
      text: TEXT_COLORS[i % TEXT_COLORS.length],
      dot: COLORS[i % COLORS.length],
    };
  });
  const selected = staff.find((s) => s.id === asentaja)?.id ?? null;
  const selectedName = staff.find((s) => s.id === selected)?.name;

  const active = jobs.filter((j) => j.status !== 'cancelled');
  /* Kun asentaja on valittu, näytetään vain hänen keikkansa (kalenterin
     kautta henkilöön). Yhteenveto lasketaan samasta joukosta. */
  const shown = selected
    ? active.filter((j) => calToStaff.get(j.calendar_id) === selected)
    : active;

  const priced = shown.filter((j) => j.price_cents > 0);
  const total = priced.reduce((s, j) => s + j.price_cents, 0);
  const avg = priced.length ? Math.round(total / priced.length) : 0;

  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);

  /* Linkkien query säilyttää viikon ja valitun asentajan. */
  const href = (p: { viikko?: string; asentaja?: string }) => {
    const sp = new URLSearchParams();
    if (p.viikko) sp.set('viikko', p.viikko);
    if (p.asentaja) sp.set('asentaja', p.asentaja);
    const s = sp.toString();
    return `/kalenteri${s ? `?${s}` : ''}`;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-text">Kalenteri</h1>
          <p className="text-sm text-muted tabular">
            {formatDateKey(monday)} – {formatDateKey(addDays(monday, 6))}
            {selectedName && <span className="text-faint"> · {selectedName}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <Link href={href({ viikko: addDays(monday, -7), asentaja: selected ?? undefined })}
                className="rounded-md border border-line px-2.5 py-1.5 text-muted hover:text-text">
            ← Edellinen
          </Link>
          <Link href={href({ asentaja: selected ?? undefined })}
                className="rounded-md border border-line px-2.5 py-1.5 text-muted hover:text-text">
            Tämä viikko
          </Link>
          <Link href={href({ viikko: addDays(monday, 7), asentaja: selected ?? undefined })}
                className="rounded-md border border-line px-2.5 py-1.5 text-muted hover:text-text">
            Seuraava →
          </Link>
        </div>
      </header>

      {/* Viikon yhteenveto — suodattuu valitun asentajan mukaan. */}
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Keikkoja" value={String(shown.length)}
                sub={selectedName ?? 'tällä viikolla'} />
        <Metric label="Myynti" value={eur(total)} tone="accent"
                sub={priced.length < shown.length ? `${priced.length}/${shown.length} hinnoiteltu` : 'tällä viikolla'} />
        <Metric label="Keskihinta" value={priced.length ? eur(avg) : '—'}
                sub="per hinnoiteltu keikka" />
      </div>

      {staff.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={href({ viikko: weekParam })}
                className={`rounded-md border px-2.5 py-1 font-semibold ${
                  selected ? 'border-line text-muted hover:text-text' : 'border-accent text-accent'
                }`}>
            Kaikki
          </Link>
          {staff.map((s) => (
            <Link key={s.id} href={href({ viikko: weekParam, asentaja: s.id })}
                  className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-semibold ${s.text} ${
                    selected === s.id ? 'border-current' : 'border-line hover:border-current'
                  }`}>
              <span className={`h-2.5 w-2.5 rounded-sm border-l-2 ${s.dot}`} />
              {s.name}
            </Link>
          ))}
        </div>
      )}

      {/* Puhelin: päiväkohtainen lista. Viikkoruudukko on 900 px leveä, joten
          390 px:n ruudulla siitä näkyi vain kaksi päivää kerrallaan — koko
          viikkonäkymän tarkoitus katosi. */}
      <div className="space-y-3 md:hidden">
        {days.map((day) => {
          const dayJobs = shown.filter((j) => dateKeyOf(j.starts_at) === day);
          return (
            <Card key={day}>
              <div className="flex items-baseline gap-2 border-b border-line-soft px-4 py-2.5">
                <span className={`text-sm font-bold ${day === today ? 'text-accent' : 'text-text'}`}>
                  {weekdayShort(isoWeekday(day))}
                </span>
                <span className="text-xs text-faint tabular">{formatDateKey(day)}</span>
                <span className="ml-auto text-xs text-faint">
                  {dayJobs.length === 0 ? '—' : `${dayJobs.length} työtä`}
                </span>
              </div>
              {dayJobs.length > 0 && (
                <ul className="divide-y divide-line-soft">
                  {dayJobs.map((job) => (
                    <li key={job.id}>
                      <Link href={`/tyot/${job.id}`}
                            className="flex items-baseline gap-3 px-4 py-2.5 text-sm hover:bg-ink-700">
                        <span className="tabular font-semibold">{timeOf(job.starts_at)}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {job.customer_name ?? job.title}
                        </span>
                        <span className="shrink-0 text-xs text-faint">{job.staff_name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="hidden overflow-x-auto md:block">
        {calendars.length === 0 ? (
          <Empty>Ei aktiivisia kalentereita.</Empty>
        ) : (
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-line">
              <div />
              {days.map((day) => (
                <div
                  key={day}
                  className={`px-2 py-2 text-center text-xs ${day === today ? 'text-accent' : 'text-muted'}`}
                >
                  <div className="font-medium">{weekdayShort(isoWeekday(day))}</div>
                  <div className="tabular text-faint">{formatDateKey(day).slice(0, -5)}</div>
                </div>
              ))}
            </div>

            <div className="relative grid grid-cols-[56px_repeat(7,1fr)]">
              <div>
                {hours.map((h) => (
                  <div key={h} style={{ height: HOUR_PX }}
                       className="pr-2 pt-0.5 text-right text-[11px] text-faint tabular">
                    {String(h).padStart(2, '0')}
                  </div>
                ))}
              </div>

              {days.map((day) => {
                const dayJobs = shown.filter((j) => dateKeyOf(j.starts_at) === day);
                return (
                  <div key={day} className="relative border-l border-line-soft">
                    {hours.map((h) => (
                      <div key={h} style={{ height: HOUR_PX }} className="border-b border-line-soft" />
                    ))}

                    {dayJobs.map((job) => {
                      const [sh, sm] = timeOf(job.starts_at).split(':').map(Number);
                      const minutes = (job.ends_at.getTime() - job.starts_at.getTime()) / 60_000;
                      const top = (sh + sm / 60 - DAY_START) * HOUR_PX;
                      const height = Math.max(20, (minutes / 60) * HOUR_PX - 2);
                      if (top < 0) return null;

                      return (
                        <Link
                          key={job.id}
                          href={`/tyot/${job.id}`}
                          style={{ top, height }}
                          className={`absolute inset-x-1 overflow-hidden rounded-md border border-line border-l-[3px] px-1.5 py-1
                                      text-[11px] leading-tight shadow-sm transition-shadow hover:shadow-md
                                      ${colorOf.get(job.calendar_id) ?? COLORS[0]}`}
                        >
                          <div className="tabular font-medium">{timeOf(job.starts_at)}</div>
                          <div className="truncate opacity-90">
                            {job.customer_name ?? job.title}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

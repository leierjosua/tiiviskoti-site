import Link from 'next/link';
import { requireStaff } from '@/lib/session';
import { Card, Empty, PageHead, cx } from '@/components/ui';
import { listKartoitukset, listKartoitusJobs, type KartoitusJob, type KartoitusRow } from '@/lib/kartoitus';
import { dateKeyOf, formatInstant, isoWeekday, timeOf, todayKey } from '@/lib/time';

/* =========================================================
   Kartoitus — kartoittajan työlista. Tehty niin selkeäksi kuin voi:

   1. Ylhäällä koko prosessi kolmena kuvallisena vaiheena, jotta
      ensikertalainenkin tietää mitä tapahtuu.
   2. Yksi iso pääpainike: Aloita uusi kartoitus.
   3. Kalenterin käynnit jaettuna Tänään / Tulevat / Menneet — ennen ne
      olivat yhdessä listassa, ja tämän päivän käynti piti etsiä.
   4. Tehtyjen kartoitusten tila selkokielellä JA mitä seuraavaksi.
   ========================================================= */

export const dynamic = 'force-dynamic';

const eur = (c: number) => (c / 100).toLocaleString('fi-FI', { maximumFractionDigits: 0 }) + ' €';
const WD = ['maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai', 'sunnuntai'];

/** Tila + mitä seuraavaksi, selkokielellä. */
function tila(k: KartoitusRow): { label: string; next: string; tone: 'done' | 'wait' | 'todo' | 'sent' } {
  if (k.confirmed_at) return { label: 'Valmis ✓', next: 'Asiakas hyväksyi ja vahvisti. Sovi asennusaika tarjoukselta.', tone: 'done' };
  if (k.accepted_at) return { label: 'Hyväksytty', next: 'Odottaa, että asiakas vahvistaa sähköpostilla.', tone: 'wait' };
  if (k.offer_status === 'sent') return { label: 'Tarjous lähetetty', next: 'Odottaa asiakkaan hyväksyntää.', tone: 'sent' };
  if (k.offer_status) return { label: k.offer_status, next: '', tone: 'wait' };
  return { label: 'Kesken', next: 'Tarjousta ei ole vielä lähetetty. Avaa ja lähetä.', tone: 'todo' };
}

const TONE = {
  done: 'bg-accent text-white',
  sent: 'bg-accent-dim text-accent',
  wait: 'bg-[#FFF4E0] text-warn',
  todo: 'bg-[#FDECEA] text-danger',
} as const;

function Steps() {
  const steps = [
    ['Täytä', 'Kirjaa ikkunat, ovet ja kuvat asiakkaan luona.'],
    ['Lähetä', 'Paina "Lähetä tarjous". Hinta lasketaan itse.'],
    ['Hyväksytä', 'Asiakas hyväksyy heti sinun puhelimellasi.'],
  ];
  return (
    <ol className="grid gap-2 sm:grid-cols-3">
      {steps.map(([t, d], i) => (
        <li key={t} className="flex items-start gap-3 rounded-[16px] bg-white p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-[19px] font-bold text-white">{i + 1}</span>
          <span>
            <span className="block text-[18px] font-bold text-text">{t}</span>
            <span className="block text-[15px] leading-snug text-muted">{d}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function JobRow({ j, today }: { j: KartoitusJob; today: boolean }) {
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="text-[22px] leading-tight font-bold tabular text-text">
          {today ? `klo ${timeOf(j.starts_at).replace(':', '.')}` : formatInstant(j.starts_at)}
        </div>
        <div className="mt-1 text-[18px] font-semibold text-text">{j.customer_name ?? j.title}</div>
        <div className="text-[16px] text-muted">{[j.address, j.city].filter(Boolean).join(', ') || 'Osoite puuttuu'}</div>
      </div>
      {j.kartoitus_id ? (
        <Link href={`/kartoitus/${j.kartoitus_id}`}
              className="flex min-h-14 items-center justify-center rounded-[14px] border-[1.5px] border-line bg-white px-6 text-[18px] font-semibold text-text sm:w-56">
          Avaa kartoitus
        </Link>
      ) : (
        <Link href={`/kartoitus/uusi?tyo=${j.id}`}
              className="flex min-h-14 items-center justify-center rounded-[14px] bg-accent px-6 text-[18px] font-bold text-white sm:w-56">
          Aloita kartoitus →
        </Link>
      )}
    </li>
  );
}

function Section({ title, sub, jobs, today = false }: { title: string; sub?: string; jobs: KartoitusJob[]; today?: boolean }) {
  if (jobs.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[22px] font-bold text-text">{title} <span className="font-semibold text-faint">({jobs.length})</span></h2>
      {sub && <p className="px-1 text-[16px] text-muted">{sub}</p>}
      <Card><ul className="divide-y divide-line-soft">{jobs.map((j) => <JobRow key={j.id} j={j} today={today} />)}</ul></Card>
    </section>
  );
}

export default async function KartoitusPage() {
  const staff = await requireStaff();
  const [jobs, done] = await Promise.all([listKartoitusJobs(staff), listKartoitukset(staff)]);

  const tk = todayKey();
  const tanaan = jobs.filter((j) => dateKeyOf(j.starts_at) === tk);
  const tulevat = jobs.filter((j) => dateKeyOf(j.starts_at) > tk);
  /* Menneistä vain ne joilta kartoitus puuttuu: tehdyt näkyvät alempana. */
  const menneet = jobs.filter((j) => dateKeyOf(j.starts_at) < tk && !j.kartoitus_id);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHead title="Kartoitus" sub={`Tänään on ${WD[isoWeekday(tk) - 1]}.`} />

      <Steps />

      <Link href="/kartoitus/uusi"
            className="flex min-h-16 items-center justify-center gap-3 rounded-[16px] bg-accent px-6 text-[20px] font-bold text-white shadow-[0_6px_20px_-8px_rgba(33,122,78,.6)]">
        <span aria-hidden className="text-[28px] leading-none">＋</span> Aloita uusi kartoitus
      </Link>

      {done === null && (
        <p className="rounded-[14px] bg-[#FFF4E0] px-5 py-4 text-[17px] font-semibold text-warn">
          Tietokannasta puuttuu kartoitustaulu. Aja db/038_kartoitus_ja_hyvaksynta.sql Supabasen SQL-editorissa.
        </p>
      )}

      {tanaan.length === 0 && (
        <Card><Empty>Tänään ei ole kartoituskäyntejä kalenterissa.</Empty></Card>
      )}
      <Section title="Tänään" jobs={tanaan} today />
      <Section title="Tulevat käynnit" jobs={tulevat} />
      <Section title="Menneet — kartoitus tekemättä" sub="Näiltä käynneiltä ei ole vielä kirjattu kartoitusta." jobs={menneet} />

      {done && (
        <section className="space-y-2">
          <h2 className="px-1 text-[22px] font-bold text-text">Tehdyt kartoitukset</h2>
          <Card>
            {done.length === 0 ? <Empty>Ei vielä kartoituksia.</Empty> : (
              <ul className="divide-y divide-line-soft">
                {done.map((k) => {
                  const t = tila(k);
                  return (
                    <li key={k.id}>
                      <Link href={`/kartoitus/${k.id}`} className="flex items-center gap-4 px-5 py-4 active:bg-ink-700 hover:bg-ink-700">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[18px] font-bold text-text">{k.data.customerName || 'Nimetön'}</span>
                            <span className={cx('rounded-full px-3 py-1 text-[15px] font-bold', TONE[t.tone])}>{t.label}</span>
                          </div>
                          {t.next && <div className="mt-1 text-[16px] text-text">{t.next}</div>}
                          <div className="mt-0.5 text-[15px] text-faint">
                            {formatInstant(k.updated_at)}
                            {k.staff_name ? ` · ${k.staff_name}` : ''}
                            {k.offer_number ? ` · ${k.offer_number}` : ''}
                            {k.offer_total_cents ? ` · ${eur(k.offer_total_cents)}` : ''}
                          </div>
                        </div>
                        <span aria-hidden className="text-[26px] text-faint">›</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}

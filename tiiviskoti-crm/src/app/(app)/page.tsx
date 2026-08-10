import Link from 'next/link';
import { sql } from '@/lib/db';
import { readHealthBanner, type HealthBanner } from '@/lib/health';
import { requireStaff } from '@/lib/session';
import { addDays, dateKeyOf, formatDateKey, formatInstant, helsinkiDateTime, timeOf } from '@/lib/time';
import { Card, CardHeader, Empty, StatusBadge } from '@/components/ui';
import { MarkDone } from './tyot/[id]/ui';

export const dynamic = 'force-dynamic';

type DayJob = {
  id: string; job_number: string; starts_at: Date; ends_at: Date; status: string;
  title: string; address: string | null; postal_code: string | null; city: string | null;
  price_cents: number; notes: string | null;
  staff_name: string; customer_name: string | null; customer_phone: string | null;
};

const eur = (cents: number) => (cents / 100).toLocaleString('fi-FI', { maximumFractionDigits: 0 }) + ' €';

/* Tunnusluku. Vertailuluku alle kertoo mihin lukua verrataan — pelkkä
   numero ilman mittakaavaa ei kerro onko päivä hyvä vai huono.

   Otsikko oli ennen 11 px:n harvennettu versaali haalealla harmaalla, eli
   juuri se osa jota ilman luku on merkityksetön oli vaikeimmin luettava. */
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

/* Varoitus rikkoutuneesta Google-yhteydestä.

   MIKSI TÄMÄ ON ETUSIVULLA EIKÄ ASETUKSISSA: kun yhteys on poikki, varaus
   näyttää onnistuvan kaikille — asiakkaalle, sivustolle ja tälle näkymälle.
   Vain vahvistusposti, työmääräin ja kalenteritapahtuma jäävät tulematta.
   Sähköpostivaroitusta ei silloin voi lähettää, koska posti kulkee saman
   yhteyden läpi, joten tämä on se paikka jossa rikko on pakko näkyä.

   Kaksi eri oiretta, tärkein ensin: toteutunut vahinko (asiakas ilman
   vahvistusta) ennen ennustettua (tarkistus punaisena). */
function HealthWarning({ health }: { health: HealthBanner }) {
  const broken = health.lastOk === false;
  if (!broken && health.failedDeliveries === 0) return null;

  const stale = health.lastCheckedAt
    ? Date.now() - health.lastCheckedAt.getTime() > 36 * 3600_000
    : false;

  return (
    <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      <p className="font-bold">
        {health.failedDeliveries > 0
          ? `${health.failedDeliveries} varausta ilman vahvistusta`
          : 'Google-yhteys ei toimi'}
      </p>
      <p className="mt-1 text-danger/90">
        {health.failedDeliveries > 0 && (
          <>
            Viimeisen 7 vrk:n aikana verkosta tulleista varauksista{' '}
            {health.failedDeliveries} kpl jäi ilman vahvistuspostia. Asiakas ei tiedä
            varauksesta, eikä keikka välttämättä ole kalenterissa.{' '}
          </>
        )}
        {broken && (
          <>
            Kuntotarkistus epäonnistui{health.lastCheckedAt ? ` ${formatInstant(health.lastCheckedAt)}` : ''}:{' '}
            {health.detail ?? 'tuntematon syy'}. Uusista varauksista ei lähde vahvistusta
            ennen kuin tämä on korjattu.
          </>
        )}
        {stale && !broken && ' Kuntotarkistus ei ole ajanut yli vuorokauteen.'}
      </p>
      <p className="mt-1.5 text-xs text-danger/80">
        Korjaus: hae uusi Google-tunnus{' '}
        <code className="font-mono">scripts/google-oauth-setup.mjs</code> ja vie se
        GOOGLE_OAUTH_REFRESH_TOKEN-muuttujaan.
      </p>
    </div>
  );
}

export default async function TodayPage() {
  const staff = await requireStaff();

  const today = dateKeyOf(new Date());
  const dayStart = helsinkiDateTime(today, '00:00');
  const dayEnd = helsinkiDateTime(addDays(today, 1), '00:00');
  const monthAgo = helsinkiDateTime(addDays(today, -30), '00:00');
  const weekAhead = helsinkiDateTime(addDays(today, 8), '00:00');

  /* Asentaja näkee vain omat työnsä — päivänäkymä on hänelle työlista, ei
     yrityksen tilannekuva. Tunnusluvut ovat siksi vain toimistolle. */
  const onlyMine = staff.role === 'installer';

  const [jobs, stats, health] = await Promise.all([
    sql<DayJob[]>`
      select j.id, j.job_number, j.starts_at, j.ends_at, j.status::text as status, j.title,
             j.address, j.postal_code, j.city, j.price_cents, j.notes,
             s.full_name as staff_name, cu.full_name as customer_name, cu.phone as customer_phone
        from tk.jobs j
        join tk.calendars c on c.id = j.calendar_id
        join tk.staff s on s.id = c.staff_id
        left join tk.customers cu on cu.id = j.customer_id
       where j.starts_at >= ${dayStart.toISOString()} and j.starts_at < ${weekAhead.toISOString()}
         and j.status <> 'cancelled'
         ${onlyMine ? sql`and s.id = ${staff.id}` : sql``}
       order by j.starts_at
    `,
    /* Kaikki tunnusluvut yhdellä kyselyllä: erilliset kyselyt olisivat neljä
       kanta-edestakaista matkaa siinä missä tässä riittää yksi. */
    onlyMine ? Promise.resolve([]) : sql<{
      myynti_tanaan: number; keikat_tanaan: number;
      uudet_varaukset: number; uudet_arvo: number;
      kpl_30pv: number; myynti_30pv: number;
      tulevat: number; liidit_uudet: number;
    }[]>`
      select
        -- Myynti tänään = tänään TEHTÄVÄT työt (kalenterin mukaan)
        coalesce(sum(case when j.starts_at >= ${dayStart.toISOString()}
                           and j.starts_at <  ${dayEnd.toISOString()}
                          then j.price_cents end), 0)::int          as myynti_tanaan,
        count(*) filter (where j.starts_at >= ${dayStart.toISOString()}
                           and j.starts_at <  ${dayEnd.toISOString()})::int as keikat_tanaan,
        -- Uudet varaukset = tänään SAAPUNEET (luontihetki)
        count(*) filter (where j.created_at >= ${dayStart.toISOString()})::int as uudet_varaukset,
        coalesce(sum(case when j.created_at >= ${dayStart.toISOString()}
                          then j.price_cents end), 0)::int          as uudet_arvo,
        -- Viimeiset 30 päivää: tehtävät työt, ei saapuneet
        count(*) filter (where j.starts_at >= ${monthAgo.toISOString()}
                           and j.starts_at <  ${dayEnd.toISOString()})::int  as kpl_30pv,
        coalesce(sum(case when j.starts_at >= ${monthAgo.toISOString()}
                           and j.starts_at <  ${dayEnd.toISOString()}
                          then j.price_cents end), 0)::int          as myynti_30pv,
        count(*) filter (where j.starts_at >= ${dayEnd.toISOString()})::int   as tulevat,
        (select count(*)::int from tk.leads where status = 'new')             as liidit_uudet
      from tk.jobs j
      where j.status <> 'cancelled'
    `,
    /* Asentajalle ei näytetä: hän ei voi korjata Google-tunnusta, ja
       päivänäkymä on hänelle työlista eikä yrityksen tilannekuva. */
    onlyMine ? Promise.resolve(null) : readHealthBanner(),
  ]);

  const s = stats[0];
  const todayJobs = jobs.filter((j) => dateKeyOf(j.starts_at) === today);
  const laterJobs = jobs.filter((j) => dateKeyOf(j.starts_at) !== today);

  const mapUrl = (j: DayJob) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      [j.address, j.postal_code, j.city].filter(Boolean).join(', '),
    )}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-text">
            {onlyMine ? 'Omat työt' : 'Yhteenveto'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {formatDateKey(today)} · {todayJobs.length} keikkaa tänään
          </p>
        </div>
        {!onlyMine && (
          <Link href="/tyot/uusi"
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-[#1A6340]">
            Uusi työ
          </Link>
        )}
      </header>

      {/* Ennen tunnuslukuja: rikkoutunut vahvistusketju on tärkeämpi tieto
          kuin päivän myynti, ja se on helppo ohittaa jos se on alempana. */}
      {health && <HealthWarning health={health} />}

      {s && (
        <>
          {/* Kaksi saraketta jo puhelimessa: yksi allekkain vei neljä ruutua
              pystysuunnassa, eikä päivän keikkoja nähnyt vierittämättä. */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric
              label="Myynti tänään"
              value={eur(s.myynti_tanaan)}
              tone="accent"
              sub={`${s.keikat_tanaan} keikkaa kalenterissa`}
            />
            <Metric
              label="Uudet varaukset"
              value={String(s.uudet_varaukset)}
              sub={s.uudet_varaukset > 0 ? `arvo ${eur(s.uudet_arvo)}` : 'tänään saapuneet'}
            />
            <Metric
              label="Varaukset 30 pv"
              value={String(s.kpl_30pv)}
              sub={`myynti ${eur(s.myynti_30pv)}`}
            />
            <Metric
              label="Keikat tänään"
              value={String(s.keikat_tanaan)}
              sub={`${s.tulevat} tulevaa varausta`}
            />
          </div>

          {s.liidit_uudet > 0 && (
            <Link href="/liidit"
                  className="block rounded-lg border border-warn/35 bg-warn/10 px-4 py-3 text-sm text-warn hover:bg-warn/15">
              <b>{s.liidit_uudet} uutta liidiä</b> palvelualueiden ulkopuolelta odottaa käsittelyä →
            </Link>
          )}
        </>
      )}

      {/* Tänään tehtävät keikat: sama korttimuoto kuin ennen, koska se toimii
          puhelimessa. Reitti ja soitto ovat päivän tärkeimmät napit. */}
      <section className="space-y-2">
        <h2 className="text-[19px] font-bold text-text">Keikat tänään</h2>
        {todayJobs.length === 0 ? (
          <Card><Empty>Ei keikkoja tänään.</Empty></Card>
        ) : (
          todayJobs.map((job) => (
            <Card key={job.id} className="p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-lg font-bold tabular">
                  {timeOf(job.starts_at)}–{timeOf(job.ends_at)}
                </span>
                <StatusBadge status={job.status} />
                <Link href={`/tyot/${job.id}`}
                      className="ml-auto text-xs font-semibold text-accent hover:underline tabular">
                  {job.job_number} →
                </Link>
              </div>

              <p className="mt-2 text-base font-semibold">{job.customer_name ?? job.title}</p>
              <p className="text-sm text-muted">
                {[job.address, job.postal_code, job.city].filter(Boolean).join(', ') || 'Ei osoitetta'}
              </p>
              {!onlyMine && <p className="mt-1 text-xs text-faint">{job.staff_name}</p>}

              {job.notes && (
                <p className="mt-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
                  {job.notes}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {job.address && (
                  <a href={mapUrl(job)} target="_blank" rel="noreferrer"
                     className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink">
                    Reitti
                  </a>
                )}
                {job.customer_phone && (
                  <a href={`tel:${job.customer_phone.replace(/\s/g, '')}`}
                     className="rounded-lg border border-line px-3 py-2 text-sm font-medium">
                    Soita {job.customer_phone}
                  </a>
                )}
                <span className="ml-auto text-sm font-semibold tabular text-muted">
                  {eur(job.price_cents)}
                </span>
                {job.status !== 'done' && <MarkDone id={job.id} />}
              </div>
            </Card>
          ))
        )}
      </section>

      {/* Seuraavat päivät tiiviinä listana: tänään on tärkeä, loppuviikko
          riittää yhtenä silmäyksenä. */}
      {laterJobs.length > 0 && (
        <Card className="overflow-x-auto">
          <CardHeader
            title="Seuraavat 7 päivää"
            action={<Link href="/kalenteri" className="text-xs font-semibold text-accent hover:underline">
              Kalenteri →
            </Link>}
          />
          {/* Puhelin: sama tieto listana. Taulukko leikkasi osoitteen. */}
          <ul className="divide-y divide-line-soft md:hidden">
            {laterJobs.map((job) => (
              <li key={job.id}>
                <Link href={`/tyot/${job.id}`}
                      className="flex items-baseline gap-2 px-4 py-2.5 text-sm hover:bg-ink-700">
                  <span className="shrink-0 tabular font-semibold">
                    {formatDateKey(dateKeyOf(job.starts_at)).slice(0, -5)}
                  </span>
                  <span className="shrink-0 tabular text-muted">{timeOf(job.starts_at)}</span>
                  <span className="min-w-0 flex-1 truncate">{job.customer_name ?? job.title}</span>
                  <span className="shrink-0 text-xs tabular text-faint">{eur(job.price_cents)}</span>
                </Link>
              </li>
            ))}
          </ul>

          <table className="hidden w-full min-w-[560px] text-sm md:table">
            <tbody className="divide-y divide-line-soft">
              {laterJobs.map((job) => (
                <tr key={job.id} className="hover:bg-ink-700">
                  <td className="px-4 py-2.5 text-muted tabular whitespace-nowrap">
                    {formatDateKey(dateKeyOf(job.starts_at))}
                  </td>
                  <td className="px-4 py-2.5 tabular whitespace-nowrap">{timeOf(job.starts_at)}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/tyot/${job.id}`} className="hover:text-accent">
                      {job.customer_name ?? job.title}
                    </Link>
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-2.5 text-muted">
                    {[job.address, job.postal_code].filter(Boolean).join(', ') || '—'}
                  </td>
                  {!onlyMine && <td className="px-4 py-2.5 text-xs text-faint">{job.staff_name}</td>}
                  <td className="px-4 py-2.5 text-right tabular whitespace-nowrap">
                    {eur(job.price_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJob, jobLinks, listCalendars } from '@/lib/data';
import { ownsJob, requireStaff, viewMode } from '@/lib/session';
import { Card, CardHeader, StatusBadge } from '@/components/ui';
import { dateKeyOf, formatDateKey, timeOf, weekdayName, isoWeekday } from '@/lib/time';
import { sql } from '@/lib/db';
import { DeleteJob, EditJobForm, InvoiceMark, RescheduleForm, SendConfirmation, SendOffer, SendReceipt, StatusButtons, TransferJobForm } from './ui';
import AsennusTyo from './asennus-tyo';
import { JobPhotos } from './photos';
import { listJobPhotos } from '@/lib/photos';
import { fiNumber, getJobReport } from '@/lib/job-report';
import { WORK_STEPS, missingSteps } from '@/lib/work-report';

export const dynamic = 'force-dynamic';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-4 px-4 py-2 text-sm">
      <span className="w-32 shrink-0 text-faint">{label}</span>
      <span className="min-w-0 flex-1">{value || '—'}</span>
    </div>
  );
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;

  const job = await getJob(id);
  if (!job) notFound();
  /* Asentajalle toisen keikka on olematon, ei kielletty: sama 404 kuin
     tuntemattomalle tunnisteelle, jottei osoitteesta voi päätellä keiden
     keikkoja on olemassa. */
  if (!(await ownsJob(staff, id))) notFound();

  /* Asennusnäkymässä sama työ näytetään toisin: ei muokkauslomakkeita
     vaan tiedot ja Viimeistele-nappi. */
  if (await viewMode(staff) === 'asennus') return <AsennusTyo job={job} />;

  const dayKey = dateKeyOf(job.starts_at);
  const durationMinutes = Math.round(
    (job.ends_at.getTime() - job.starts_at.getTime()) / 60_000,
  );

  // Rivit, viestiloki ja liitokset ovat toisistaan riippumattomia — rinnakkain.
  const [lines, mails, links, photos, deliveryRows, calendars, reportRes] = await Promise.all([
    sql<{ name: string; quantity: number; unit_price_cents: number }[]>`
      select name, quantity, unit_price_cents from tk.job_lines
       where job_id = ${id} order by sort_order
    `,
    sql<{ kind: string; to_email: string; sent_at: Date | null; error: string | null }[]>`
      select kind::text as kind, to_email, sent_at, error from tk.mail_log
       where job_id = ${id} order by created_at
    `,
    jobLinks(id),
    listJobPhotos(id),
    /* Vahvistuksen ja kalenterin tila: kumpikin voi puuttua toisistaan
       riippumatta, eikä sitä näe mistään muualta työn sivulla. */
    sql<{ confirmation_sent_at: Date | null; google_event_id: string | null }[]>`
      select confirmation_sent_at, google_event_id from tk.jobs where id = ${id}
    `,
    /* Siirtolistan vaihtoehdot. Vain käytössä olevat, jottei työtä voi antaa
       lopettaneelle asentajalle. */
    listCalendars(true),
    /* Asentajan työraportti (db/033). Puuttuva taulu ei kaada sivua. */
    getJobReport(id),
  ]);
  const report = reportRes.report;
  const delivery = deliveryRows[0];
  const lineSumCents = lines.reduce((s, l) => s + l.quantity * l.unit_price_cents, 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/tyot" className="text-xs text-muted hover:text-text">← Työt</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight tabular">{job.job_number}</h1>
          <StatusBadge status={job.status} />
          {/* Jatkotarjous samalle asiakkaalle. Asiakastiedot tulevat
              valmiiksi, hinnat eivät — ks. tarjoukset/uusi/page.tsx. */}
          <Link
            href={`/tarjoukset/uusi?tyo=${job.id}`}
            className="ml-auto rounded-lg border border-accent/50 px-3 py-1.5 text-xs
                       font-bold text-accent transition-colors hover:bg-accent/10"
          >
            + Uusi tarjous
          </Link>
        </div>
        <p className="text-sm text-muted">
          {weekdayName(isoWeekday(dayKey))} {formatDateKey(dayKey)} klo{' '}
          <span className="tabular">{timeOf(job.starts_at)}–{timeOf(job.ends_at)}</span> ·{' '}
          {job.staff_name}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-fit">
          <CardHeader title="Työ" />
          <div className="divide-y divide-line-soft">
            <Row label="Nimi" value={job.title} />
            <Row label="Kalenteri" value={`${job.staff_name} — ${job.calendar_name}`} />
            <Row label="Kesto" value={<span className="tabular">{durationMinutes} min</span>} />
            <Row
              label="Hinta"
              value={<span className="tabular">{(job.price_cents / 100).toFixed(2)} €</span>}
            />
            <Row
              label="Lähde"
              value={job.source === 'web' ? 'Verkkosivu'
                : job.source === 'tarjous' ? 'Tarjous'
                : job.source === 'liidi' ? 'Liidi'
                : 'Hallinta'}
            />
            {/* Työpari: kummallakin asentajalla on oma rivi omassa
                kalenterissaan, joten ilman tätä työn sivulta ei näkisi että
                keikalla on toinenkin tekijä. Siirto ja peruminen osuvat
                molempiin riveihin. */}
            {links.mates.length > 0 && (
              <Row
                label="Työpari"
                value={
                  <span className="flex flex-wrap gap-x-2 gap-y-1">
                    {links.mates.map((m) => (
                      <Link key={m.id} href={`/tyot/${m.id}`} className="text-accent hover:underline">
                        {m.staff_name} ({m.job_number})
                      </Link>
                    ))}
                  </span>
                }
              />
            )}
            {links.offer && (
              <Row
                label="Tarjous"
                value={
                  <Link href={`/tarjoukset/${links.offer.id}`} className="text-accent hover:underline">
                    {links.offer.offer_number}
                  </Link>
                }
              />
            )}
            {/* Mainoskampanja on eri asia kuin lähde: lähde kertoo syntyikö työ
                verkossa vai hallinnassa, kampanja mikä mainos toi asiakkaan.
                Näytetään vain kun tiedossa, jottei rivi toistu tyhjänä. */}
            {job.campaign && <Row label="Kampanja" value={<code>{job.campaign}</code>} />}
            <Row label="Muistiinpanot" value={job.notes} />
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Asiakas" />
          <div className="divide-y divide-line-soft">
            <Row label="Nimi" value={job.customer_name} />
            <Row
              label="Sähköposti"
              value={job.customer_email
                ? <a href={`mailto:${job.customer_email}`} className="text-accent hover:underline">
                    {job.customer_email}
                  </a>
                : null}
            />
            <Row
              label="Puhelin"
              value={job.customer_phone
                ? <a href={`tel:${job.customer_phone}`} className="text-accent hover:underline tabular">
                    {job.customer_phone}
                  </a>
                : null}
            />
            <Row
              label="Osoite"
              value={[job.address, job.postal_code, job.city].filter(Boolean).join(', ')}
            />
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Siirrä aikaa" />
          <RescheduleForm
            id={job.id}
            startsAt={job.starts_at.toISOString()}
            durationMinutes={durationMinutes}
          />
        </Card>

        {/* Tekijän vaihto on eri asia kuin ajan siirto: aika pysyy, kalenteri
            vaihtuu. Oma korttinsa vieressä, koska nämä kaksi sekoitetaan
            helposti toisiinsa. */}
        <Card className="h-fit">
          <CardHeader title="Tekijät" />
          <TransferJobForm
            id={job.id}
            currentCalendarIds={[job.calendar_id, ...links.mates.map((m) => m.calendar_id)]}
            calendars={calendars.map((c) => ({
              id: c.id, name: c.name, staff_id: c.staff_id, staff_name: c.staff_name,
            }))}
          />
        </Card>

        <Card className="h-fit">
          <CardHeader title="Tila" />
          <div className="space-y-4 p-4">
            <StatusButtons id={job.id} status={job.status} />
            <div className="border-t border-line pt-4">
              <SendConfirmation
                id={job.id}
                alreadySent={!!delivery?.confirmation_sent_at}
                inCalendar={!!delivery?.google_event_id}
              />
            </div>
            <div className="border-t border-line pt-4">
              <SendOffer id={job.id} alreadySent={mails.some((m) => m.kind === 'offer' && m.sent_at)} />
            </div>
            <div className="border-t border-line pt-4">
              <InvoiceMark id={job.id} invoicedAt={job.invoiced_at} paid={job.paid} />
            </div>
            <div className="border-t border-line pt-4">
              <SendReceipt id={job.id} alreadySent={mails.some((m) => m.kind === 'receipt' && m.sent_at)} />
            </div>
            <div className="border-t border-line pt-4">
              <DeleteJob id={job.id} status={job.status} />
            </div>
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Tilatut työt"
            action={
              <span className={`text-xs tabular ${lineSumCents === job.price_cents ? 'text-faint' : 'text-warn'}`}>
                rivit {(lineSumCents / 100).toLocaleString('fi-FI')} €
              </span>
            }
          />
          {lines.length === 0 ? (
            <div className="px-4 py-6 text-sm text-faint">
              Ei rivejä. Hallinnasta luodulle työlle rivejä ei vielä syötetä — hinta on kokonaissumma.
            </div>
          ) : (
            <ul className="divide-y divide-line-soft">
              {lines.map((l, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="flex-1">
                    {l.quantity > 1 && <b>{l.quantity}× </b>}{l.name}
                  </span>
                  <span className="tabular text-muted">
                    {((l.quantity * l.unit_price_cents) / 100).toLocaleString('fi-FI')} €
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Työraportti vain luettavana: asentaja täyttää sen viimeistelyssä,
            toimisto katsoo ja lataa PDF:n. Kortti näkyy vasta kun raportti on. */}
        {report && (
          <Card className="h-fit">
            <CardHeader
              title="Työraportti"
              action={
                <a href={`/tyot/${job.id}/raportti/pdf`}
                   className="rounded-lg border border-accent/50 px-3 py-1.5 text-xs font-bold text-accent
                              transition-colors hover:bg-accent/10">
                  Lataa PDF
                </a>
              }
            />
            <div className="divide-y divide-line-soft">
              <Row
                label="Päivä ja aika"
                value={<span className="tabular">
                  {formatDateKey(report.work_date)} klo {report.started_at}–{report.finished_at}
                  {report.travel_hours !== null && ` · matka ${fiNumber(report.travel_hours)} h`}
                </span>}
              />
              <Row label="Asentaja(t)" value={report.installers} />
              {report.unit && <Row label="Rappu / huoneisto" value={report.unit} />}
              <Row
                label="Kohteet"
                value={<span className="tabular">
                  {report.windows} ikkunaa · {report.balcony_doors} parvekeovea · {report.other_doors} muuta ovea
                </span>}
              />
              <div className="px-4 py-2 text-sm">
                <p className="mb-1.5 text-faint">
                  Työvaiheet{' '}
                  <span className="tabular">
                    ({WORK_STEPS.length - missingSteps(report.steps).length}/{WORK_STEPS.length})
                  </span>
                </p>
                <ul className="space-y-1">
                  {WORK_STEPS.map((s) => {
                    const v = report.steps[s.key];
                    return (
                      <li key={s.key} className="flex items-start gap-2">
                        <span className={`mt-px w-20 shrink-0 text-xs font-bold ${
                          v === 'done' ? 'text-accent' : v === 'na' ? 'text-muted' : 'text-danger'
                        }`}>
                          {v === 'done' ? '✓ Tehty' : v === 'na' ? 'Ei tarpeen' : 'Puuttuu'}
                        </span>
                        <span className="min-w-0 flex-1">{s.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {(report.sealant_m !== null || report.silicone_pcs !== null || report.acrylic_pcs !== null) && (
                <Row
                  label="Materiaalit"
                  value={<span className="tabular">
                    {[
                      report.sealant_m !== null && `tiivistettä ${fiNumber(report.sealant_m)} m`,
                      report.silicone_pcs !== null && `silikonia ${report.silicone_pcs} kpl`,
                      report.acrylic_pcs !== null && `akryyliä ${report.acrylic_pcs} kpl`,
                    ].filter(Boolean).join(' · ')}
                  </span>}
                />
              )}
              {report.notes && (
                <Row label="Huomiot" value={<span className="whitespace-pre-line">{report.notes}</span>} />
              )}
              <Row label="Asiakkaan kuittaus" value={report.customer_ack_name} />
              <Row
                label="Kirjannut"
                value={<span className="text-muted">
                  {report.created_by_name ?? '—'} · {formatDateKey(dateKeyOf(report.updated_at))}
                </span>}
              />
            </div>
          </Card>
        )}

        <Card className="h-fit">
          <CardHeader title="Muokkaa" />
          <EditJobForm
            job={{
              id: job.id, title: job.title, address: job.address,
              postal_code: job.postal_code, city: job.city,
              price_cents: job.price_cents, notes: job.notes,
              customer_name: job.customer_name, customer_email: job.customer_email,
              customer_phone: job.customer_phone,
            }}
            lineSumCents={lineSumCents}
          />
        </Card>

        <Card className="h-fit">
          <CardHeader title="Viestit" />
          {mails.length === 0 ? (
            <div className="px-4 py-6 text-sm text-faint">Ei lähetettyjä viestejä.</div>
          ) : (
            <ul className="divide-y divide-line-soft">
              {mails.map((m, i) => (
                <li key={i} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex-1">
                      {m.kind === 'work_order' ? 'Työmääräin' : 'Vahvistus'}
                      <span className="ml-2 text-xs text-muted">{m.to_email}</span>
                    </span>
                    <span className={m.sent_at ? 'text-xs text-accent' : 'text-xs text-danger'}>
                      {m.sent_at ? 'lähetetty' : 'ei lähtenyt'}
                    </span>
                  </div>
                  {m.error && <p className="mt-1 text-xs text-danger">{m.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <JobPhotos
        jobId={id}
        canEdit
        photos={photos.map((p) => ({
          id: p.id, caption: p.caption, url: p.url, createdAt: p.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJob } from '@/lib/data';
import { requireStaff } from '@/lib/session';
import { Card, CardHeader, StatusBadge } from '@/components/ui';
import { dateKeyOf, formatDateKey, timeOf, weekdayName, isoWeekday } from '@/lib/time';
import { sql } from '@/lib/db';
import { DeleteJob, EditJobForm, RescheduleForm, StatusButtons } from './ui';

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
  await requireStaff();
  const { id } = await params;

  const job = await getJob(id);
  if (!job) notFound();

  const dayKey = dateKeyOf(job.starts_at);
  const durationMinutes = Math.round(
    (job.ends_at.getTime() - job.starts_at.getTime()) / 60_000,
  );

  // Rivit ja viestiloki ovat toisistaan riippumattomia — haetaan rinnakkain.
  const [lines, mails] = await Promise.all([
    sql<{ name: string; quantity: number; unit_price_cents: number }[]>`
      select name, quantity, unit_price_cents from tk.job_lines
       where job_id = ${id} order by sort_order
    `,
    sql<{ kind: string; to_email: string; sent_at: Date | null; error: string | null }[]>`
      select kind::text as kind, to_email, sent_at, error from tk.mail_log
       where job_id = ${id} order by created_at
    `,
  ]);
  const lineSumCents = lines.reduce((s, l) => s + l.quantity * l.unit_price_cents, 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/tyot" className="text-xs text-muted hover:text-text">← Työt</Link>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight tabular">{job.job_number}</h1>
          <StatusBadge status={job.status} />
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
            <Row label="Lähde" value={job.source === 'web' ? 'Verkkosivu' : 'Hallinta'} />
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

        <Card className="h-fit">
          <CardHeader title="Tila" />
          <div className="space-y-4 p-4">
            <StatusButtons id={job.id} status={job.status} />
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
    </div>
  );
}

import Link from 'next/link';
import { sql } from '@/lib/db';
import type { JobRow } from '@/lib/data';
import { satisfactionLabel } from '@/lib/completion';
import { dateKeyOf, formatDateKey, isoWeekday, timeOf, weekdayName } from '@/lib/time';
import { Card, CardHeader, StatusBadge } from '@/components/ui';
import { NoteForm } from './ui';

/* =========================================================
   Varauksen näkymä asennuspuolella.

   Sama työ kuin toimiston sivulla, mutta eri kysymyksellä: toimisto
   muokkaa ja laskuttaa, asentaja katsoo mihin mennään, mitä tehdään ja
   painaa lopuksi Viimeistele. Siksi täällä ei ole muokkauslomakkeita
   eikä poistoa — vain tiedot, yhteystiedot ja se yksi nappi.
   ========================================================= */

const eur = (cents: number) => (cents / 100).toLocaleString('fi-FI', { maximumFractionDigits: 2 }) + ' €';

type Completion = { paid: boolean; satisfaction: number | null; completed_at: Date | null } | null;

/** Viimeistelyn tiedot. Sarakkeet tulevat migraatiosta 016, joka ajetaan
 *  käsin postgres-roolilla — puuttuva sarake (42703) ei saa kaataa koko
 *  sivua, koska keikkatiedot ovat tärkeämmät kuin niiden yhteenveto. */
async function readCompletion(id: string): Promise<Completion> {
  try {
    const rows = await sql<{ paid: boolean; satisfaction: number | null; completed_at: Date | null }[]>`
      select paid, satisfaction, completed_at from tk.jobs where id = ${id}
    `;
    return rows[0] ?? null;
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '42703') return null;
    throw err;
  }
}

function Fact({ icon, children, sub }: { icon: string; children: React.ReactNode; sub?: string }) {
  return (
    <div className="flex gap-3">
      <span aria-hidden className="w-5 shrink-0 text-center text-faint">{icon}</span>
      <div className="min-w-0">
        <p className="font-semibold text-text">{children}</p>
        {sub && <p className="text-sm text-faint">{sub}</p>}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 mb-2 border-t border-line-soft pt-4 text-xs font-bold tracking-wide text-faint uppercase">
      {children}
    </p>
  );
}

export default async function AsennusTyo({ job }: { job: JobRow }) {
  const dayKey = dateKeyOf(job.starts_at);
  const minutes = Math.round((job.ends_at.getTime() - job.starts_at.getTime()) / 60_000);
  const address = [job.address, job.postal_code, job.city].filter(Boolean).join(', ');

  const [lines, mails, completion] = await Promise.all([
    sql<{ name: string; quantity: number; unit_price_cents: number }[]>`
      select name, quantity, unit_price_cents from tk.job_lines
       where job_id = ${job.id} order by sort_order
    `,
    sql<{ kind: string; sent_at: Date | null }[]>`
      select kind::text as kind, sent_at from tk.mail_log where job_id = ${job.id}
    `,
    readCompletion(job.id),
  ]);

  const receiptSent = mails.some((m) => m.kind === 'receipt' && m.sent_at);
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const notes = (job.notes ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Link href="/" className="text-sm text-muted hover:text-text">← Takaisin</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-text tabular">
            Varaus {job.job_number}
          </h1>
          <StatusBadge status={job.status} />
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {job.status !== 'cancelled' && (
          <Link href={`/tyot/${job.id}/viimeistely`}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink hover:bg-[#1A6340]">
            {job.status === 'done' ? 'Viimeistele uudelleen' : 'Viimeistele'}
          </Link>
        )}
        {address && (
          <a href={mapUrl} target="_blank" rel="noreferrer"
             className="rounded-lg border border-line bg-ink-800 px-4 py-2.5 text-sm font-semibold text-text hover:bg-ink-700">
            Reitti
          </a>
        )}
        {job.customer_phone && (
          <a href={`tel:${job.customer_phone.replace(/\s/g, '')}`}
             className="rounded-lg border border-line bg-ink-800 px-4 py-2.5 text-sm font-semibold text-text hover:bg-ink-700">
            Soita
          </a>
        )}
      </div>

      {/* Viimeistelyn tulos ennen muuta: kun keikka on tehty, ensimmäinen
          kysymys on maksettiinko se — ei se mitä kalenterissa luki. */}
      {completion?.completed_at && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className={`rounded-full border px-3 py-1.5 text-sm font-bold ${
              completion.paid
                ? 'border-accent/35 bg-accent-dim text-accent'
                : 'border-warn/35 bg-warn/10 text-warn'
            }`}>
              {completion.paid ? 'Maksettu' : 'Ei maksettu'}
            </span>
            {satisfactionLabel(completion.satisfaction) && (
              <span className="text-sm text-muted">
                Asiakastyytyväisyys: <b className="text-text">{satisfactionLabel(completion.satisfaction)}</b>
              </span>
            )}
            <span className="text-sm text-muted">
              Kuitti: <b className="text-text">{receiptSent ? 'lähetetty' : 'ei lähetetty'}</b>
            </span>
            <span className="ml-auto text-xs text-faint tabular">
              Viimeistelty {formatDateKey(dateKeyOf(completion.completed_at))}
            </span>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-fit p-5">
          <h2 className="mb-4 text-[17px] font-bold text-text">Työn tiedot</h2>
          <div className="space-y-3">
            <Fact icon="🕐" sub={`Kesto: ${minutes} min`}>
              {weekdayName(isoWeekday(dayKey))} {formatDateKey(dayKey)} klo{' '}
              <span className="tabular">{timeOf(job.starts_at)} – {timeOf(job.ends_at)}</span>
            </Fact>
            <Fact icon="🧰">{job.title}</Fact>
            <Fact icon="◎">{address || 'Ei osoitetta'}</Fact>
          </div>

          <p className="mt-5 text-[17px] font-bold text-text">
            Hinta: <span className="tabular">{eur(job.price_cents)}</span>
          </p>

          <SectionLabel>Tuotteet ja palvelut</SectionLabel>
          {lines.length === 0 ? (
            <p className="text-sm text-faint">
              Ei erittelyä — hinta on kokonaissumma. Viimeistely tekee rivit.
            </p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {lines.map((l, i) => (
                <li key={i} className="flex items-center gap-3 py-2 text-sm">
                  <span className="flex-1">
                    {l.quantity > 1 && <b>{l.quantity}× </b>}{l.name}
                  </span>
                  <span className="tabular text-muted">
                    {eur(l.quantity * l.unit_price_cents)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <SectionLabel>Sisäiset muistiinpanot</SectionLabel>
          <NoteForm id={job.id} />
          {notes.length === 0 ? (
            <p className="mt-3 text-sm text-faint">Ei merkintöjä.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {notes.map((n, i) => (
                <li key={i} className="rounded-lg border border-warn/25 bg-warn/8 px-3 py-2 text-sm text-text">
                  {n}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="h-fit p-5">
          <h2 className="mb-4 text-[17px] font-bold text-text">Asiakas</h2>
          <p className="font-bold text-text">{job.customer_name ?? '—'}</p>
          <div className="mt-3 space-y-2.5">
            {job.customer_phone && (
              <Fact icon="📞">
                <a href={`tel:${job.customer_phone.replace(/\s/g, '')}`}
                   className="text-accent hover:underline tabular">
                  {job.customer_phone}
                </a>
              </Fact>
            )}
            {job.customer_email && (
              <Fact icon="✉">
                <a href={`mailto:${job.customer_email}`} className="break-all text-accent hover:underline">
                  {job.customer_email}
                </a>
              </Fact>
            )}
            {address && <Fact icon="◎">{address}</Fact>}
          </div>
        </Card>
      </div>

      {job.campaign && (
        <Card>
          <CardHeader title="Mistä asiakas tuli" />
          <p className="px-4 py-3 text-sm text-muted">
            Kampanja <code className="font-mono text-text">{job.campaign}</code> ·{' '}
            {job.source === 'web' ? 'verkkovaraus' : 'hallinnasta luotu'}
          </p>
        </Card>
      )}
    </div>
  );
}

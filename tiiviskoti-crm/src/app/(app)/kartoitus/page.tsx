import Link from 'next/link';
import { requireStaff } from '@/lib/session';
import { Card, CardHeader, Empty, PageHead } from '@/components/ui';
import { listKartoitukset, listKartoitusJobs } from '@/lib/kartoitus';
import { formatInstant } from '@/lib/time';

/* =========================================================
   Kartoitus — kartoittajan työlista.

   Ylhäällä kalenterin kartoituskäynnit (aloita kartoitus suoraan
   käynniltä, jolloin asiakastiedot tulevat valmiiksi), alla tehdyt
   kartoitukset ja niiden tarjousten tila.
   ========================================================= */

export const dynamic = 'force-dynamic';

const eur = (c: number) => (c / 100).toLocaleString('fi-FI', { maximumFractionDigits: 0 }) + ' €';

function Tila({ status, accepted }: { status: string | null; accepted: boolean }) {
  const [txt, cls] = accepted ? ['Hyväksytty', 'bg-accent text-white']
    : status === 'sent' ? ['Lähetetty', 'bg-accent-dim text-accent']
    : status ? [status, 'bg-ink-700 text-muted']
    : ['Ei lähetetty', 'bg-ink-700 text-muted'];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>{txt}</span>;
}

export default async function KartoitusPage() {
  const staff = await requireStaff();
  const [jobs, done] = await Promise.all([listKartoitusJobs(staff), listKartoitukset(staff)]);

  return (
    <div className="space-y-6">
      <PageHead
        title="Kartoitus"
        sub="Täytä kartoitus paikan päällä, lähetä tarjous ja anna asiakkaan hyväksyä se heti."
        action={<Link href="/kartoitus/uusi" className="rounded-xl bg-accent px-4 py-3 text-sm font-extrabold text-white">+ Uusi kartoitus</Link>}
      />

      {done === null && (
        <p className="rounded-xl bg-[#FFF4E0] px-4 py-3 text-sm font-semibold text-warn">
          Tietokannasta puuttuu kartoitustaulu. Aja db/038_kartoitus_ja_hyvaksynta.sql Supabasen SQL-editorissa.
        </p>
      )}

      <Card>
        <CardHeader title="Kartoituskäynnit kalenterissa" />
        {jobs.length === 0 ? <Empty>Ei kartoituskäyntejä lähipäivinä.</Empty> : (
          <ul className="divide-y divide-line-soft">
            {jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-text">{j.customer_name ?? j.title}</div>
                  <div className="text-sm text-muted">
                    {formatInstant(j.starts_at)} · {[j.address, j.city].filter(Boolean).join(', ') || '—'}
                  </div>
                </div>
                {j.kartoitus_id ? (
                  <Link href={`/kartoitus/${j.kartoitus_id}`} className="rounded-xl border border-line px-3.5 py-2.5 text-sm font-bold text-text">Avaa kartoitus</Link>
                ) : (
                  <Link href={`/kartoitus/uusi?tyo=${j.id}`} className="rounded-xl bg-accent px-3.5 py-2.5 text-sm font-bold text-white">Aloita kartoitus</Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {done && (
        <Card>
          <CardHeader title="Tehdyt kartoitukset" />
          {done.length === 0 ? <Empty>Ei vielä kartoituksia.</Empty> : (
            <ul className="divide-y divide-line-soft">
              {done.map((k) => (
                <li key={k.id}>
                  <Link href={`/kartoitus/${k.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-ink-700">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-text">{k.data.customerName || 'Nimetön'}</div>
                      <div className="text-sm text-muted">
                        {formatInstant(k.updated_at)}{k.staff_name ? ` · ${k.staff_name}` : ''}
                        {k.offer_number ? ` · ${k.offer_number}` : ''}
                        {k.offer_total_cents ? ` · ${eur(k.offer_total_cents)}` : ''}
                      </div>
                    </div>
                    <Tila status={k.offer_status} accepted={!!k.accepted_at} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

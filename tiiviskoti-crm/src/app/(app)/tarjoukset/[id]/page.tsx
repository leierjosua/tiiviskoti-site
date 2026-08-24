import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireManager } from '@/lib/session';
import { getOffer } from '@/lib/data';
import { Card, CardHeader, PageHead } from '@/components/ui';
import { OFFER_STATUS, OfferStatusButtons, OfferStatusChip } from '../ui';

export const dynamic = 'force-dynamic';

const eur = (cents: number) =>
  (cents / 100).toLocaleString('fi-FI', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
const fmtDate = (d: Date | string | null) =>
  d ? new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(d)) : '—';

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  const offer = await getOffer(id);
  if (!offer) notFound();
  const talo = offer.kind === 'taloyhtio';

  return (
    <div className="space-y-6">
      <PageHead
        title={`Tarjous ${offer.offer_number}`}
        sub={<Link href="/tarjoukset" className="text-sm text-muted hover:text-text">← Tarjoukset</Link>}
        action={
          <div className="flex items-center gap-2">
            {/* Tyyppi näkyviin: sama tarjousnumerosarja palvelee molempia,
                joten pelkästä numerosta ei näe kummasta on kyse. */}
            <span className="inline-flex items-center rounded-full border border-line bg-ink-700 px-2.5 py-1 text-[12px] font-bold whitespace-nowrap text-muted">
              {talo ? 'Taloyhtiö' : 'Asiakas'}
            </span>
            <OfferStatusChip status={offer.error ? 'error' : offer.status} label={offer.error ? 'Lähetys epäonnistui' : OFFER_STATUS[offer.status]} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={talo ? 'Taloyhtiö' : 'Asiakas'} />
          <dl className="divide-y divide-line-soft text-sm">
            {[
              [talo ? 'Taloyhtiö' : 'Nimi', offer.customer_name],
              ...(talo ? [['Yhteyshenkilö', offer.contact_name ?? '—'] as [string, string]] : []),
              ['Sähköposti', offer.email],
              ['Puhelin', offer.phone ?? '—'],
              ['Osoite', [offer.address, offer.postal_code, offer.city].filter(Boolean).join(', ') || '—'],
              ['Lähetetty', fmtDate(offer.sent_at)],
              ['Voimassa', fmtDate(offer.valid_until)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-faint">{k}</dt>
                <dd className="text-right text-text">{v}</dd>
              </div>
            ))}
          </dl>
          {offer.customer_note && (
            <div className="border-t border-line px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">Vapaa sana — näkyi asiakkaalle</p>
              <p className="mt-1 whitespace-pre-line text-sm text-text">{offer.customer_note}</p>
            </div>
          )}
          {offer.notes && (
            <div className="border-t border-line px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">Sisäinen muistiinpano</p>
              <p className="mt-1 text-sm text-muted">{offer.notes}</p>
            </div>
          )}
          {offer.error && <p className="border-t border-line px-4 py-3 text-sm text-danger">Lähetysvirhe: {offer.error}</p>}
        </Card>

        <Card>
          <CardHeader title="Rivit" />
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line-soft">
              {offer.lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-4 py-2.5 text-text">{l.quantity > 1 ? `${l.quantity}× ` : ''}{l.name}</td>
                  <td className="px-4 py-2.5 text-right tabular text-muted">{eur(l.unit_price_cents * l.quantity)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line">
                <td className="px-4 py-3 font-bold text-text">Yhteensä</td>
                <td className="px-4 py-3 text-right font-bold tabular text-accent">{eur(offer.total_cents)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader title="Tila" />
        <div className="p-4">
          <OfferStatusButtons id={offer.id} status={offer.status} />
        </div>
      </Card>
    </div>
  );
}

import Link from 'next/link';
import { requireManager } from '@/lib/session';
import { listOffers } from '@/lib/data';
import { Button, Card, Empty, PageHead } from '@/components/ui';
import { OFFER_STATUS, OfferStatusChip } from './ui';

export const dynamic = 'force-dynamic';

const eur = (cents: number) =>
  (cents / 100).toLocaleString('fi-FI', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
const fmt = (d: Date) => new Intl.DateTimeFormat('fi-FI', {
  timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(d);

export default async function OffersPage() {
  await requireManager();
  const offers = await listOffers();

  return (
    <div className="space-y-6">
      <PageHead
        title="Tarjoukset"
        sub="Sähköpostilla lähetetyt tarjoukset uusille asiakkaille."
        action={<Link href="/tarjoukset/uusi"><Button>Uusi tarjous</Button></Link>}
      />

      <Card className="overflow-x-auto">
        {offers.length === 0 ? (
          <Empty>Ei tarjouksia vielä. Tee ensimmäinen “Uusi tarjous” -napista.</Empty>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th className="px-4 py-2 font-medium">Numero</th>
                <th className="px-4 py-2 font-medium">Lähetetty</th>
                <th className="px-4 py-2 font-medium">Asiakas</th>
                <th className="px-4 py-2 font-medium">Sähköposti</th>
                <th className="px-4 py-2 font-medium text-right">Summa</th>
                <th className="px-4 py-2 font-medium">Tila</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {offers.map((o) => (
                <tr key={o.id} className="hover:bg-ink-700">
                  <td className="px-4 py-2.5">
                    <Link href={`/tarjoukset/${o.id}`} className="font-semibold text-accent hover:underline">{o.offer_number}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted tabular">{o.sent_at ? fmt(o.sent_at) : (o.error ? 'virhe' : '—')}</td>
                  <td className="px-4 py-2.5">{o.customer_name}</td>
                  <td className="px-4 py-2.5 text-muted"><a href={`mailto:${o.email}`} className="hover:text-text">{o.email}</a></td>
                  <td className="px-4 py-2.5 text-right tabular font-semibold">{eur(o.total_cents)}</td>
                  <td className="px-4 py-2.5"><OfferStatusChip status={o.error ? 'error' : o.status} label={o.error ? 'Lähetys epäonnistui' : OFFER_STATUS[o.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

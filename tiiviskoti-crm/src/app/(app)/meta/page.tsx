import { requireManager } from '@/lib/session';
import { Card, CardHeader, Empty, PageHead, ErrorNote } from '@/components/ui';
import { getMetaStats } from '@/lib/meta';

/* =========================================================
   Meta-mainokset (Facebook/Instagram).

   Näyttää mainostilin tulokset viimeiseltä 30 päivältä suoraan Meta
   Marketing API:sta: kulut, näytöt, klikit ja konversiot (varaukset =
   Purchase). Konversiot tulevat pikselille CAPI:n kautta (create-booking.mjs),
   koska sivustolla ei ole selainpikseliä. Sisarnäkymä Ads-konversioille.
   ========================================================= */

export const dynamic = 'force-dynamic';

const eur = (cents: number) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
const num = (n: number) => new Intl.NumberFormat('fi-FI').format(n);

export default async function MetaPage() {
  await requireManager();
  const stats = await getMetaStats(30);
  const t = stats.totals;
  const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
  const cpc = t.linkClicks > 0 ? t.spendCents / t.linkClicks : 0;

  return (
    <div className="space-y-6">
      <PageHead
        title="Meta-mainokset"
        sub={<>Facebook- ja Instagram-mainosten tulokset viimeiseltä 30 päivältä. Varaukset (Purchase) tulevat Metan pikselille CAPI:n kautta.</>}
      />

      {!stats.configured && (
        <ErrorNote>
          META_ACCESS_TOKEN puuttuu tiiviskoti-crm:n ympäristömuuttujista. Lisää se (ja
          valinnainen META_AD_ACCOUNT_ID) Vercelin projektiasetuksiin, niin tulokset ilmestyvät tähän.
        </ErrorNote>
      )}
      {stats.configured && stats.error && <ErrorNote>Metan rajapinta: {stats.error}</ErrorNote>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-5">
          <div className="text-sm font-semibold text-muted">Käytetty (30 pv)</div>
          <div className="mt-2 text-[30px] leading-none font-extrabold text-text tabular">{eur(t.spendCents)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm font-semibold text-muted">Varauksia (Purchase)</div>
          <div className="mt-2 text-[30px] leading-none font-extrabold text-accent tabular">{num(t.purchases)}</div>
          <div className="mt-2 text-xs text-faint">{t.purchases > 0 ? `${eur(Math.round(t.spendCents / t.purchases))} / varaus` : 'ei vielä varauksia'}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm font-semibold text-muted">Näytöt</div>
          <div className="mt-2 text-[30px] leading-none font-extrabold text-text tabular">{num(t.impressions)}</div>
          <div className="mt-2 text-xs text-faint">CTR {ctr.toFixed(1)} %</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm font-semibold text-muted">Linkkiklikkaukset</div>
          <div className="mt-2 text-[30px] leading-none font-extrabold text-text tabular">{num(t.linkClicks)}</div>
          <div className="mt-2 text-xs text-faint">{cpc > 0 ? `${eur(Math.round(cpc))} / klikki` : '—'}</div>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        <CardHeader title="Mainoskohtaiset tulokset (30 pv)" />
        {stats.rows.length === 0 ? (
          <Empty>
            Ei mainosdataa vielä. Kun mainokset ovat pyörineet, tulokset ilmestyvät tähän itsestään.
          </Empty>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th className="px-4 py-2 font-medium">Mainos</th>
                <th className="px-4 py-2 font-medium">Käytetty</th>
                <th className="px-4 py-2 font-medium">Näytöt</th>
                <th className="px-4 py-2 font-medium">Klikit</th>
                <th className="px-4 py-2 font-medium">Varaukset</th>
                <th className="px-4 py-2 font-medium">Hinta / varaus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {stats.rows.map((r) => (
                <tr key={r.adId} className="hover:bg-ink-700">
                  <td className="px-4 py-2.5 font-semibold">{r.adName}</td>
                  <td className="px-4 py-2.5 tabular">{eur(r.spendCents)}</td>
                  <td className="px-4 py-2.5 tabular">{num(r.impressions)}</td>
                  <td className="px-4 py-2.5 tabular">{num(r.linkClicks || r.clicks)}</td>
                  <td className="px-4 py-2.5 tabular font-semibold text-accent">{num(r.purchases)}</td>
                  <td className="px-4 py-2.5 tabular">{r.purchases > 0 ? eur(Math.round(r.spendCents / r.purchases)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

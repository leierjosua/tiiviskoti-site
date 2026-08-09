import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { Card, CardHeader, Empty, PageHead, StatusBadge } from '@/components/ui';
import { CONVERSION_NAME } from './csv/format';

/* =========================================================
   Ads-konversiot.

   Näyttää ne työt jotka syntyivät Google Ads -mainosklikistä, ja antaa
   niistä Adsin konversiotuontiin kelpaavan CSV:n.

   MIKSI TÄMÄ NÄKYMÄ ON OLEMASSA: tiiviskoti.fi:llä ei ole gtag.js:ää eikä
   seurantaevästeitä (tietosuojaseloste lupaa niin), joten Google ei näe
   konversioita itse. Ne viedään käsin tästä. Ilman tätä näkymää tieto oli
   vain kannassa eikä sitä päässyt kukaan katsomaan.

   PERUTUT EIVÄT OLE KONVERSIOITA. Ne näkyvät listassa, jotta luku täsmää
   työlistan kanssa, mutta ne jätetään pois summista ja CSV:stä — peruttua
   kauppaa ei raportoida Googlelle.
   ========================================================= */

export const dynamic = 'force-dynamic';

type Row = {
  id: string; job_number: string; gclid: string; campaign: string | null;
  status: string; price_cents: number; created_at: Date; starts_at: Date;
  postal_code: string | null; full_name: string;
};

const eur = (cents: number) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    .format(cents / 100);

export default async function AdsPage() {
  await requireManager();

  const rows = await sql<Row[]>`
    select j.id, j.job_number, j.gclid, j.campaign, j.status, j.price_cents,
           j.created_at, j.starts_at, j.postal_code, c.full_name
      from tk.jobs j
      join tk.customers c on c.id = j.customer_id
     where j.gclid is not null
     order by j.created_at desc
     limit 300
  `;

  const laskettavat = rows.filter((r) => r.status !== 'cancelled');
  const arvo = laskettavat.reduce((s, r) => s + r.price_cents, 0);

  /* Kuluva kuukausi Helsingin ajassa — se on se luku jota Adsin
     kuukausiraporttiin verrataan. */
  const kk = new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', month: 'numeric', year: 'numeric' });
  const nyt = kk.format(new Date());
  const kuussa = laskettavat.filter((r) => kk.format(r.created_at) === nyt);

  const fmt = (d: Date) => new Intl.DateTimeFormat('fi-FI', {
    timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);

  return (
    <div className="space-y-6">
      <PageHead
        title="Ads-konversiot"
        sub={<>Varaukset jotka syntyivät Google Ads -mainosklikistä. Vie CSV ja lataa se Adsissa: <b>Tavoitteet → Konversiot → Lataukset</b>.</>}
        action={
          rows.length > 0 ? (
            <a
              href="/ads/csv"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-ink-800 px-3.5 py-2 text-sm font-semibold text-text transition-all hover:border-[#D2D9CE] hover:bg-ink-700"
            >
              Lataa CSV ({laskettavat.length})
            </a>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs font-semibold tracking-wide text-faint uppercase">Konversioita</div>
          <div className="mt-1 text-2xl font-extrabold text-text tabular">{laskettavat.length}</div>
          <div className="text-xs text-muted">{kuussa.length} tässä kuussa</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold tracking-wide text-faint uppercase">Kaupan arvo</div>
          <div className="mt-1 text-2xl font-extrabold text-accent tabular">{eur(arvo)}</div>
          <div className="text-xs text-muted">
            {kuussa.length > 0 ? `${eur(kuussa.reduce((s, r) => s + r.price_cents, 0))} tässä kuussa` : 'ei tässä kuussa'}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold tracking-wide text-faint uppercase">Keskikauppa</div>
          <div className="mt-1 text-2xl font-extrabold text-text tabular">
            {laskettavat.length > 0 ? eur(Math.round(arvo / laskettavat.length)) : '—'}
          </div>
          <div className="text-xs text-muted">Vertaa klikkihintaan Adsissa</div>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        <CardHeader title={`Konversiotapahtuma: ${CONVERSION_NAME}`} />
        {rows.length === 0 ? (
          <Empty>
            Ei vielä yhtään mainosklikistä syntynyttä varausta. Ne ilmestyvät tähän itsestään,
            kun mainoksesta tullut kävijä varaa ajan.
          </Empty>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th className="px-4 py-2 font-medium">Varattu</th>
                <th className="px-4 py-2 font-medium">Työ</th>
                <th className="px-4 py-2 font-medium">Asiakas</th>
                <th className="px-4 py-2 font-medium">Postinro</th>
                <th className="px-4 py-2 font-medium">Arvo</th>
                <th className="px-4 py-2 font-medium">Tila</th>
                <th className="px-4 py-2 font-medium">Klikin tunniste</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-ink-700">
                  <td className="px-4 py-2.5 text-muted tabular">{fmt(r.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <a href={`/tyot/${r.id}`} className="font-semibold text-accent hover:underline">
                      {r.job_number}
                    </a>
                  </td>
                  <td className="px-4 py-2.5">{r.full_name}</td>
                  <td className="px-4 py-2.5 tabular">{r.postal_code ?? '—'}</td>
                  <td className="px-4 py-2.5 tabular font-semibold">{eur(r.price_cents)}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                  {/* Koko gclid on pitkä eikä sitä lueta silmällä — riittää että
                      sen näkee olevan tallessa ja voi tarvittaessa kopioida. */}
                  <td className="px-4 py-2.5">
                    <code className="text-xs text-faint" title={r.gclid}>
                      {r.gclid.slice(0, 12)}…
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="text-xs leading-relaxed text-faint">
        Peruutetut varaukset näkyvät listassa mutta jäävät pois summista ja CSV:stä.
        Konversion arvo on työn loppusumma matkalisineen ja alennuksineen.
        Aikaleima on varauksen tekohetki, ei työn ajankohta — Ads liittää konversion
        klikkiin sen perusteella.
      </p>
    </div>
  );
}

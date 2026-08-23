import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { Button, Card, CardHeader, Empty, ErrorNote, PageHead, StatusBadge } from '@/components/ui';
import { adsMissingConfig } from '@/lib/google-ads';
import { CONVERSION_NAME } from './csv/format';
import { lahetaKonversiot } from './actions';

/* =========================================================
   Ads-konversiot.

   Näyttää ne työt jotka syntyivät Google Ads -mainosklikistä, ja antaa
   niistä Adsin konversiotuontiin kelpaavan CSV:n.

   MIKSI TÄMÄ NÄKYMÄ ON OLEMASSA: tiiviskoti.fi:llä ei ole gtag.js:ää eikä
   seurantaevästeitä (tietosuojaseloste lupaa niin), joten Google ei näe
   konversioita itse. Ilman tätä näkymää tieto oli vain kannassa eikä sitä
   päässyt kukaan katsomaan.

   LÄHETYS TAPAHTUU ITSESTÄÄN. Yöajo vie lähettämättömät konversiot Adsin
   rajapintaan (lib/ads-sync.ts), ja tämä sivu näyttää mitä on mennyt läpi
   ja mikä ei. CSV-lataus on jäljellä varatienä siltä varalta että
   rajapinta on poissa käytöstä — se ei tarkista lähetysmerkintää, joten
   käsin ladattaessa sama konversio voi mennä kahdesti. Adsin oma
   tunnistus tilausnumeron perusteella karsii tuplat, mutta CSV:tä ei ole
   syytä ladata ilman erityistä syytä.

   PERUTUT EIVÄT OLE KONVERSIOITA. Ne näkyvät listassa, jotta luku täsmää
   työlistan kanssa, mutta ne jätetään pois summista ja CSV:stä — peruttua
   kauppaa ei raportoida Googlelle.
   ========================================================= */

export const dynamic = 'force-dynamic';

type Row = {
  id: string; job_number: string; gclid: string; campaign: string | null;
  status: string; price_cents: number; created_at: Date; starts_at: Date;
  postal_code: string | null; full_name: string;
  ads_uploaded_at: Date | null; ads_upload_error: string | null;
};

const eur = (cents: number) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    .format(cents / 100);

export default async function AdsPage() {
  await requireManager();

  /* Lähetyssarakkeet tulevat migraatiosta 017. Jos sitä ei ole vielä ajettu,
     sivu ei saa kaatua — silloin se on ainoa paikka josta puuttuvan
     migraation huomaisi, ja kaatunut sivu kertoo vain "virhe". Luetaan
     ilman niitä ja sanotaan suoraan mitä pitää tehdä. */
  let puuttuuMigraatio = false;
  let rows: Row[];
  try {
    rows = await sql<Row[]>`
      select j.id, j.job_number, j.gclid, j.campaign, j.status, j.price_cents,
             j.created_at, j.starts_at, j.postal_code, c.full_name,
             j.ads_uploaded_at, j.ads_upload_error
        from tk.jobs j
        join tk.customers c on c.id = j.customer_id
       where j.gclid is not null
       order by j.created_at desc
       limit 300
    `;
  } catch (e) {
    // 42703 = saraketta ei ole.
    if (!(typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703')) throw e;
    puuttuuMigraatio = true;
    const vanhat = await sql<Omit<Row, 'ads_uploaded_at' | 'ads_upload_error'>[]>`
      select j.id, j.job_number, j.gclid, j.campaign, j.status, j.price_cents,
             j.created_at, j.starts_at, j.postal_code, c.full_name
        from tk.jobs j
        join tk.customers c on c.id = j.customer_id
       where j.gclid is not null
       order by j.created_at desc
       limit 300
    `;
    rows = vanhat.map((r) => ({ ...r, ads_uploaded_at: null, ads_upload_error: null }));
  }

  const laskettavat = rows.filter((r) => r.status !== 'cancelled');
  const arvo = laskettavat.reduce((s, r) => s + r.price_cents, 0);

  const lahetetyt = laskettavat.filter((r) => r.ads_uploaded_at !== null);
  const jonossa = laskettavat.filter((r) => r.ads_uploaded_at === null && !r.ads_upload_error);
  const virheelliset = laskettavat.filter((r) => r.ads_uploaded_at === null && r.ads_upload_error);
  const puuttuvatAsetukset = adsMissingConfig();

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
        sub={<>Varaukset jotka syntyivät Google Ads -mainosklikistä. Lähtevät Adsiin itsestään yöllä; tapahtuma <b>{CONVERSION_NAME}</b>.</>}
        action={
          rows.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {!puuttuuMigraatio && (
              <form action={lahetaKonversiot}>
                {/* Nappi näkyy myös kun jono on tyhjä: silloin sillä
                    yrittää uudelleen aiemmin epäonnistuneita. */}
                <Button type="submit">
                  Lähetä Adsiin{jonossa.length > 0 ? ` (${jonossa.length})` : ''}
                </Button>
              </form>
              )}
              <a
                href="/ads/csv"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-ink-800 px-3.5 py-2 text-sm font-semibold text-text transition-all hover:border-[#D2D9CE] hover:bg-ink-700"
              >
                Lataa CSV
              </a>
            </div>
          ) : undefined
        }
      />

      {puuttuuMigraatio && (
        <ErrorNote>
          Tietokannasta puuttuu lähetysmerkintä: aja <code>tiiviskoti-crm/db/017_ads_conversions.sql</code>{' '}
          Supabasen SQL-editorissa. Siihen asti konversiot on vietävä CSV:llä käsin.
        </ErrorNote>
      )}

      {!puuttuuMigraatio && puuttuvatAsetukset.length > 0 && (
        <ErrorNote>
          Automaattinen lähetys ei ole käytössä: Vercelin ympäristömuuttujista puuttuu{' '}
          {puuttuvatAsetukset.join(', ')}. Siihen asti konversiot on vietävä CSV:llä käsin.
        </ErrorNote>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className="text-sm font-semibold text-muted">Konversioita</div>
          <div className="mt-2 text-[30px] leading-none font-extrabold text-text tabular">{laskettavat.length}</div>
          <div className="mt-2 text-xs text-faint">{kuussa.length} tässä kuussa</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm font-semibold text-muted">Kaupan arvo</div>
          <div className="mt-2 text-[30px] leading-none font-extrabold text-accent tabular">{eur(arvo)}</div>
          <div className="mt-2 text-xs text-faint">
            {kuussa.length > 0 ? `${eur(kuussa.reduce((s, r) => s + r.price_cents, 0))} tässä kuussa` : 'ei tässä kuussa'}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm font-semibold text-muted">Keskikauppa</div>
          <div className="mt-2 text-[30px] leading-none font-extrabold text-text tabular">
            {laskettavat.length > 0 ? eur(Math.round(arvo / laskettavat.length)) : '—'}
          </div>
          <div className="mt-2 text-xs text-faint">Vertaa klikkihintaan Adsissa</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm font-semibold text-muted">Viety Adsiin</div>
          <div className="mt-2 text-[30px] leading-none font-extrabold text-text tabular">
            {lahetetyt.length}<span className="text-lg text-faint">/{laskettavat.length}</span>
          </div>
          <div className="mt-2 text-xs text-faint">
            {virheelliset.length > 0
              ? `${virheelliset.length} epäonnistui`
              : jonossa.length > 0 ? `${jonossa.length} lähtee yöllä` : 'kaikki perillä'}
          </div>
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
                <th className="px-4 py-2 font-medium">Adsiin</th>
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
                  {/* Peruttua ei lähetetä lainkaan, joten sen kohdalla ei
                      näytetä jonoa — se olisi lupaus jota ei pidetä. */}
                  <td className="px-4 py-2.5">
                    {r.status === 'cancelled' ? (
                      <span className="text-xs text-faint">ei lähetetä</span>
                    ) : r.ads_uploaded_at ? (
                      <span className="text-xs text-accent" title={fmt(r.ads_uploaded_at)}>Viety</span>
                    ) : r.ads_upload_error ? (
                      <span className="text-xs text-danger" title={r.ads_upload_error}>Virhe</span>
                    ) : (
                      <span className="text-xs text-muted">Jonossa</span>
                    )}
                  </td>
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
        Konversio lähtee Adsiin tunnin kuluttua varauksesta, jotta pian peruttu varaus ei ehdi
        raportoitua kauppana. Vie hiiri “Virhe”-merkin päälle nähdäksesi syyn.
        Peruutetut varaukset näkyvät listassa mutta jäävät pois summista ja CSV:stä.
        Konversion arvo on työn loppusumma matkalisineen ja alennuksineen.
        Aikaleima on varauksen tekohetki, ei työn ajankohta — Ads liittää konversion
        klikkiin sen perusteella.
      </p>
    </div>
  );
}

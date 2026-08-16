import Link from 'next/link';
import { requireManager } from '@/lib/session';
import { getSiteAnalytics, type Bucket } from '@/lib/analytics';
import { Card, Empty, PageHead } from '@/components/ui';

export const dynamic = 'force-dynamic';

const RANGES: Record<string, { days: number; label: string }> = {
  '7': { days: 7, label: '7 pv' },
  '30': { days: 30, label: '30 pv' },
  '90': { days: 90, label: '90 pv' },
};

const FUNNEL: { key: string; label: string }[] = [
  { key: 'postal', label: 'Postinumero' },
  { key: 'calc', label: 'Palvelut' },
  { key: 'cal', label: 'Kalenteri' },
  { key: 'form', label: 'Yhteystiedot' },
  { key: 'done', label: 'Vahvistus' },
];

function fmtDur(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

function Metric({ label, value, sub, tone = 'plain' }: {
  label: string; value: string; sub?: string; tone?: 'plain' | 'accent';
}) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className={`mt-2 text-[30px] leading-none font-extrabold tabular ${
        tone === 'accent' ? 'text-accent' : 'text-text'
      }`}>{value}</p>
      {sub && <p className="mt-2 text-xs text-faint">{sub}</p>}
    </Card>
  );
}

/* Vaakapalkkilista: avain + osuus suurimmasta. */
function BarList({ title, rows, unit = '' }: { title: string; rows: Bucket[]; unit?: string }) {
  const max = rows.reduce((m, r) => Math.max(m, r.n), 0) || 1;
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-text">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-faint">Ei dataa vielä.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-text">{r.key}</span>
                <span className="shrink-0 tabular text-muted">{r.n}{unit}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-line-soft">
                <div className="h-1.5 rounded-full bg-accent/70"
                     style={{ width: `${Math.round((r.n / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function SivustoAnalytics({
  searchParams,
}: { searchParams: Promise<{ d?: string }> }) {
  await requireManager();
  const { d } = await searchParams;
  const range = RANGES[d ?? '30'] ?? RANGES['30'];
  const fromIso = new Date(Date.now() - range.days * 86_400_000).toISOString();

  /* Jos taulua ei ole vielä (migraatio ajamatta) tai kysely muuten kaatuu,
     ei näytetä virhesivua vaan siisti ohje. */
  let a: Awaited<ReturnType<typeof getSiteAnalytics>> | null = null;
  try { a = await getSiteAnalytics(fromIso); } catch { a = null; }

  if (!a) {
    return (
      <div className="space-y-6">
        <PageHead title="Analytiikka · Sivusto" sub="Evästeetön, anonyymi kävijäseuranta tiiviskoti.fi:stä." />
        <Empty>
          Seurantaa ei ole vielä alustettu. Aja tietokantamigraatio
          <code className="mx-1 rounded bg-line-soft px-1.5 py-0.5 text-xs">db/011_web_analytics.sql</code>
          niin data alkaa kertyä.
        </Empty>
      </div>
    );
  }

  const hasData = a.pageviews > 0 || a.sessions > 0;
  const funnelTop = a.funnel.reduce((m, r) => Math.max(m, r.n), 0) || 1;

  return (
    <div className="space-y-6">
      <PageHead
        title="Analytiikka · Sivusto"
        sub="Evästeetön, anonyymi kävijäseuranta tiiviskoti.fi:stä."
        action={
          <div className="flex items-center gap-1 text-sm">
            {Object.entries(RANGES).map(([key, r]) => (
              <Link key={key} href={`/analytiikka/sivusto?d=${key}`}
                    className={`rounded-md border px-2.5 py-1.5 ${
                      (d ?? '30') === key ? 'border-accent text-accent' : 'border-line text-muted hover:text-text'
                    }`}>
                {r.label}
              </Link>
            ))}
          </div>
        }
      />

      {!hasData ? (
        <Empty>
          Ei kävijädataa vielä tältä ajalta. Seuranta kerää dataa kun se on
          julkaistu ja kävijöitä käy — palaa hetken päästä.
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Metric label="Sessiot" value={String(a.sessions)} sub={`${range.label}`} />
            <Metric label="Uniikit kävijät" value={String(a.visitors)} sub="anonyymit" />
            <Metric label="Sivunäytöt" value={String(a.pageviews)} />
            <Metric label="Keskim. kesto" value={fmtDur(a.avgSessionSec)} sub="per käynti" />
            <Metric label="Konversiot" value={String(a.conversions)} tone="accent" sub="verkkovaraukset" />
            <Metric label="Konversioaste" value={`${a.convRate} %`} tone="accent" sub="varaus / sessio" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <BarList title="Liikennelähteet" rows={a.sources} />
            <BarList title="Top landing-sivut" rows={a.landing} />
            <BarList title="Suosituimmat sivut" rows={a.topPages} />
            <BarList title="CTA-klikkaukset" rows={a.cta} />
            <BarList title="Laitteet" rows={a.devices} />
            <BarList title="Selaimet" rows={a.browsers} />
          </div>

          {/* Konversiofunneli: montako eri kävijää ehti mihinkin varausvaiheeseen. */}
          <Card className="p-5">
            <p className="text-sm font-semibold text-text">Konversiofunneli</p>
            {a.funnel.length === 0 ? (
              <p className="mt-3 text-xs text-faint">Ei varausvaihedataa vielä.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {FUNNEL.map((step) => {
                  const n = a.funnel.find((f) => f.key === step.key)?.n ?? 0;
                  return (
                    <li key={step.key} className="text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-text">{step.label}</span>
                        <span className="shrink-0 tabular text-muted">{n} kävijää</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-line-soft">
                        <div className="h-2 rounded-full bg-accent"
                             style={{ width: `${Math.round((n / funnelTop) * 100)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Scroll-syvyys: kuinka moni vieritti kuinka pitkälle. */}
          <Card className="p-5">
            <p className="text-sm font-semibold text-text">Scroll-syvyys</p>
            <p className="mt-1 text-xs text-faint">Keskimäärin {a.scroll.avg} % · {a.scroll.total} mittausta</p>
            <div className="mt-3 grid grid-cols-4 gap-3">
              {([['25 %', a.scroll.p25], ['50 %', a.scroll.p50], ['75 %', a.scroll.p75], ['100 %', a.scroll.p100]] as const).map(
                ([label, n]) => {
                  const pct = a.scroll.total ? Math.round((n / a.scroll.total) * 100) : 0;
                  return (
                    <div key={label} className="rounded-lg border border-line-soft p-3 text-center">
                      <p className="text-[22px] font-extrabold tabular text-text">{pct} %</p>
                      <p className="text-xs text-faint">vieritti ≥ {label}</p>
                    </div>
                  );
                },
              )}
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <BarList title="Mistä keikka tulee" rows={a.jobSource} unit=" kpl" />
            <BarList title="Konversiot kampanjoittain" rows={a.jobCampaign} unit=" kpl" />
          </div>
        </>
      )}
    </div>
  );
}

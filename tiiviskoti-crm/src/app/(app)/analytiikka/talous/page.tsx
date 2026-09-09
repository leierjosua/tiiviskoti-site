import Link from 'next/link';
import { requireManager } from '@/lib/session';
import { getTalous } from '@/lib/talous';
import { parseRange, rangeText, RANGES, type TalousMetrics } from '@/lib/talous-laskenta';
import { PageHead, cx } from '@/components/ui';
import { AnalyticsTabs } from '../tabs';
import { CostSplit, eur, Metric, MonthChart, Section } from './ui';

export const dynamic = 'force-dynamic';

export default async function TalousPage({
  searchParams,
}: { searchParams: Promise<{ r?: string }> }) {
  await requireManager();
  const { r } = await searchParams;
  const rangeKey = parseRange(r);
  const t = await getTalous(rangeKey);
  const { now, prev, range, settings } = t;

  const p = <K extends keyof TalousMetrics>(k: K) => (prev ? (prev[k] as number) : null);

  const rulesEmpty =
    settings.tekijaBp === 0 && settings.laiteBp === 0 && settings.komissioBp === 0 &&
    settings.provisioBp === 0 && settings.kiinteatCentsMonth === 0;
  const noCosts = now.kulutCents === 0;

  return (
    <div className="space-y-6">
      <PageHead
        title="Analytiikka"
        sub={
          <>
            {range.label} · {rangeText(range.fromKey, range.toKey)}
            {prev && range.prevFromKey && range.prevToKey && (
              <> · muutos vs. {rangeText(range.prevFromKey, range.prevToKey)}</>
            )}
          </>
        }
        action={
          <Link
            href="/analytiikka/talous/asetukset"
            className="rounded-lg border border-line bg-ink-800 px-3.5 py-2 text-sm font-semibold text-text transition-colors hover:bg-ink-700"
          >
            Kuluasetukset
          </Link>
        }
      />

      <AnalyticsTabs current="/analytiikka/talous" />

      {/* Jaksovalitsin. Sama paikka kaikilla jaksoilla, jotta valinta ei
          hyppää sen mukaan mikä on valittuna. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((opt) => (
          <Link
            key={opt.key}
            href={`/analytiikka/talous?r=${opt.key}`}
            aria-current={opt.key === rangeKey ? 'true' : undefined}
            className={cx(
              'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
              opt.key === rangeKey
                ? 'border-accent bg-accent-dim text-accent'
                : 'border-line bg-ink-800 text-muted hover:text-text',
            )}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {!t.migrated && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          <b>Kulutaulut puuttuvat.</b>
          <span className="mt-1 block text-warn/85">
            Aja <code className="rounded bg-warn/10 px-1.5 py-0.5 text-xs">db/030_talous.sql</code>{' '}
            Supabasen SQL-editorissa (postgres-roolilla). Siihen asti myynti näkyy oikein,
            mutta kulut ja tulos ovat nollia.
          </span>
        </div>
      )}

      {t.migrated && rulesEmpty && noCosts && (
        <div className="rounded-lg border border-info/40 bg-info/10 px-4 py-3 text-sm text-info">
          <b>Kuluja ei ole vielä asetettu.</b>
          <span className="mt-1 block text-info/85">
            Kate ja tulos ovat toistaiseksi sama kuin liikevaihto.{' '}
            <Link href="/analytiikka/talous/asetukset" className="font-semibold underline underline-offset-2">
              Aseta kuluprosentit ja kiinteät kulut
            </Link>{' '}
            — sen jälkeen luvut ovat todellisia.
          </span>
        </div>
      )}

      {t.meta.auto && !t.meta.ok && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          <b>Meta-mainoskuluja ei saatu haettua.</b>
          <span className="mt-1 block text-warn/85">
            {t.meta.error} — markkinointikulussa on nyt vain käsin kirjatut menot.
          </span>
        </div>
      )}

      <Section title="Myynti" tone="accent">
        <Metric label="Kokonaismyynti (sis. alv)" value={eur(now.myyntiCents)}
                nowValue={now.myyntiCents} prevValue={p('myyntiCents')} big />
        <Metric label={`Liikevaihto (alv 0 %)`} value={eur(now.liikevaihtoCents)}
                nowValue={now.liikevaihtoCents} prevValue={p('liikevaihtoCents')}
                sub={`alv ${(settings.vatBp / 100).toFixed(1).replace('.', ',')} %`} big />
        <Metric label="Varaukset" value={String(now.varaukset)}
                nowValue={now.varaukset} prevValue={p('varaukset')} big />
        <Metric label="Keskim. varausarvo" value={eur(now.keskiarvoCents)}
                nowValue={now.keskiarvoCents} prevValue={p('keskiarvoCents')} big />
      </Section>

      <Section title="Kulut" tone="warn">
        <Metric label="Tekijäkulut" value={eur(now.tekijaCents)} tone="cost"
                nowValue={now.tekijaCents} prevValue={p('tekijaCents')} />
        <Metric label="Markkinointi" value={eur(now.markkinointiCents)} tone="cost"
                nowValue={now.markkinointiCents} prevValue={p('markkinointiCents')}
                sub={t.meta.auto && t.meta.ok ? `sis. Meta ${eur(t.meta.spendCents)}` : undefined} />
        <Metric label="Laitekustannukset" value={eur(now.laiteCents)} tone="cost"
                nowValue={now.laiteCents} prevValue={p('laiteCents')} />
        <Metric label="Myyntikomissiot" value={eur(now.komissioCents)} tone="cost"
                nowValue={now.komissioCents} prevValue={p('komissioCents')} />
        <Metric label="Kiinteät kulut" value={eur(now.kiinteatCents)} tone="cost"
                nowValue={now.kiinteatCents} prevValue={p('kiinteatCents')} />
        <Metric label="Markkinointiprovisio" value={eur(now.provisioCents)} tone="cost"
                nowValue={now.provisioCents} prevValue={p('provisioCents')} />
        <Metric label="Kulut yhteensä" value={eur(now.kulutCents)} tone="cost"
                nowValue={now.kulutCents} prevValue={p('kulutCents')} />
      </Section>

      <Section title="Tulos" tone="info">
        <Metric label="Kate" value={eur(now.kateCents)} tone="result"
                nowValue={now.kateCents} prevValue={p('kateCents')}
                sub="liikevaihto − tekijä-, laite- ja komissiokulut" big />
        <Metric label="Kate %" value={`${now.katePct.toFixed(1).replace('.', ',')} %`} tone="result"
                nowValue={Math.round(now.katePct * 10)} prevValue={prev ? Math.round(prev.katePct * 10) : null}
                big />
        <Metric label="Tulos" value={eur(now.tulosCents)} tone="result"
                nowValue={now.tulosCents} prevValue={p('tulosCents')}
                sub="liikevaihto − kaikki kulut" big />
        <Metric label="Tulos %" value={
                  now.liikevaihtoCents > 0
                    ? `${((now.tulosCents / now.liikevaihtoCents) * 100).toFixed(1).replace('.', ',')} %`
                    : '—'
                } tone="result"
                nowValue={now.liikevaihtoCents > 0 ? Math.round((now.tulosCents / now.liikevaihtoCents) * 1000) : 0}
                prevValue={prev && prev.liikevaihtoCents > 0
                  ? Math.round((prev.tulosCents / prev.liikevaihtoCents) * 1000) : null}
                big />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <MonthChart months={t.months} />
        <CostSplit m={now} />
      </div>

      <p className="text-xs leading-relaxed text-faint">
        Myynti on vahvistettujen ja tehtyjen töiden summa työn päivän mukaan; peruutetut ja
        vielä vahvistamattomat eivät ole mukana, eikä ilmainen kartoituskäynti.
        Kuluprosentit lasketaan liikevaihdosta ja kiinteät kulut jaetaan jaksolle päivien
        suhteessa. Käsin kirjatut kulut lisätään päälle samaan kategoriaan.
      </p>
    </div>
  );
}

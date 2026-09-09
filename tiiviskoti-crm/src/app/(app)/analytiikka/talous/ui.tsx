import { Card, cx } from '@/components/ui';
import type { MonthPoint, TalousMetrics } from '@/lib/talous-laskenta';

export const eur = (cents: number) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    .format(cents / 100);

/* =========================================================
   Talousnäkymä: myynti, kulut ja tulos yhdellä ruudulla.

   Kortit on ryhmitelty kolmeen osioon (myynti → kulut → tulos), koska ne
   luetaan siinä järjestyksessä: ylin kertoo mitä tuli, keskimmäinen mihin
   se meni ja alin mitä jäi. Sama järjestys myös laskutoimituksena, joten
   sivun voi lukea ylhäältä alas ilman selitystä.

   MUUTOSPROSENTIN VÄRI EI OLE SUUNTA VAAN MERKITYS: myynnin kasvu on
   vihreä ja kulun kasvu punainen, vaikka kumpikin nuoli osoittaa ylös.
   Suuntaa varten on nuoli; väri kertoo onko se hyvä uutinen.
   ========================================================= */

type Tone = 'sales' | 'cost' | 'result';

export function Delta({ now, prev, tone }: { now: number; prev: number | null; tone: Tone }) {
  if (prev === null) return null;
  if (prev === 0) {
    // Nollasta ei voi laskea kasvuprosenttia. Kerrotaan tilanne sanoilla,
    // ei loputtomana prosenttilukuna.
    if (now === 0) return <p className="mt-2 text-xs font-semibold text-faint">— 0 %</p>;
    return <p className="mt-2 text-xs font-semibold text-faint">uusi</p>;
  }

  const pct = Math.round(((now - prev) / Math.abs(prev)) * 100);
  const up = pct > 0;
  const flat = pct === 0;
  const good = tone === 'cost' ? !up : up;

  return (
    <p className={cx(
      'mt-2 text-xs font-semibold tabular',
      flat ? 'text-faint' : good ? 'text-accent' : 'text-danger',
    )}>
      <span aria-hidden>{flat ? '—' : up ? '↗' : '↘'}</span>{' '}
      {pct > 0 ? '+' : ''}{pct} %
      <span className="sr-only"> verrattuna edelliseen jaksoon</span>
    </p>
  );
}

export function Metric({ label, value, prevValue, nowValue, tone = 'sales', sub, big }: {
  label: string;
  value: string;
  nowValue: number;
  prevValue: number | null;
  tone?: Tone;
  sub?: string;
  big?: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="text-[12px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className={cx(
        'mt-2 leading-none font-extrabold tabular text-text',
        big ? 'text-[30px]' : 'text-[26px]',
      )}>
        {value}
      </p>
      <Delta now={nowValue} prev={prevValue} tone={tone} />
      {sub && <p className="mt-1.5 text-xs text-faint">{sub}</p>}
    </Card>
  );
}

const SECTION_TONES = {
  accent: { bar: 'bg-accent', text: 'text-accent', panel: 'bg-accent/6' },
  warn:   { bar: 'bg-warn',   text: 'text-warn',   panel: 'bg-warn/6' },
  info:   { bar: 'bg-info',   text: 'text-info',   panel: 'bg-info/6' },
} as const;

export function Section({ title, tone, children }: {
  title: string; tone: keyof typeof SECTION_TONES; children: React.ReactNode;
}) {
  const t = SECTION_TONES[tone];
  return (
    <section className={cx('rounded-(--radius-card) p-3', t.panel)}>
      <h2 className={cx('mb-2.5 flex items-center gap-2 px-1 text-[12px] font-extrabold tracking-widest uppercase', t.text)}>
        <span className={cx('h-3.5 w-1 rounded-full', t.bar)} />
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}

/* Kuukausisarja pylväinä. Myynti ja kulut vierekkäin samalla asteikolla,
   tulos lukuna alla — kolmas pylväs tekisi kuvasta sotkuisen, ja tulos on
   joka tapauksessa se luku joka luetaan tarkkana eikä silmämääräisenä. */
export function MonthChart({ months }: { months: MonthPoint[] }) {
  const max = months.reduce((m, p) => Math.max(m, p.myyntiCents, p.kulutCents), 0) || 1;
  const h = (cents: number) => `${Math.max(Math.round((cents / max) * 100), cents > 0 ? 2 : 0)}%`;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-bold text-text">Kuukausittain</h2>
        <p className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> Myynti
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-warn/70" /> Kulut
          </span>
        </p>
      </div>

      {/* Pylväiden korkeus tulee prosenttina emosta, joten jokaisen tason
          on oltava korkeudeltaan määritelty aina riviin asti — muuten
          h-full ratkeaa automaattikorkeutta vasten eikä pylvästä näy. */}
      <div className="mt-4 flex h-48 items-stretch gap-1.5 overflow-x-auto">
        {months.map((p) => (
          <div key={p.key} className="flex min-w-[34px] flex-1 flex-col items-center gap-1">
            <div className="flex w-full flex-1 items-end justify-center gap-[3px]">
              <div
                className="w-[42%] rounded-t bg-accent"
                style={{ height: h(p.myyntiCents) }}
                title={`${p.label} · myynti ${eur(p.myyntiCents)}`}
              />
              <div
                className="w-[42%] rounded-t bg-warn/70"
                style={{ height: h(p.kulutCents) }}
                title={`${p.label} · kulut ${eur(p.kulutCents)}`}
              />
            </div>
            {/* Akselilla pelkkä kuukausi: vuosiluku toistuisi 12 kertaa
                eikä mahtuisi puolen leveyden korttiin. Vuosi näkyy
                taulukossa ja pylvään pikaohjeessa. */}
            <span className="text-[11px] whitespace-nowrap text-faint">{p.label.split(' ')[0]}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 -mx-5 overflow-x-auto border-t border-line-soft">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-faint">
              <th className="py-2 pl-5 font-semibold">Kuukausi</th>
              <th className="py-2 text-right font-semibold">Myynti</th>
              <th className="py-2 text-right font-semibold">Kulut</th>
              <th className="py-2 pr-5 text-right font-semibold">Tulos</th>
            </tr>
          </thead>
          <tbody>
            {[...months].reverse().map((p) => (
              <tr key={p.key} className="border-t border-line-soft">
                <td className="py-2 pl-5 text-text">{p.label}</td>
                <td className="py-2 text-right tabular text-text">{eur(p.myyntiCents)}</td>
                <td className="py-2 text-right tabular text-muted">{eur(p.kulutCents)}</td>
                <td className={cx(
                  'py-2 pr-5 text-right font-bold tabular',
                  p.tulosCents < 0 ? 'text-danger' : 'text-text',
                )}>
                  {eur(p.tulosCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Kulujen jakauma: mihin liikevaihdon euro meni. */
export function CostSplit({ m }: { m: TalousMetrics }) {
  const parts = [
    { label: 'Tekijäkulut',          cents: m.tekijaCents,       color: 'bg-accent' },
    { label: 'Laitekustannukset',    cents: m.laiteCents,        color: 'bg-info' },
    { label: 'Myyntikomissiot',      cents: m.komissioCents,     color: 'bg-warn' },
    { label: 'Markkinointi',         cents: m.markkinointiCents, color: 'bg-danger' },
    { label: 'Markkinointiprovisio', cents: m.provisioCents,     color: 'bg-muted' },
    { label: 'Kiinteät kulut',       cents: m.kiinteatCents,     color: 'bg-faint' },
  ].filter((p) => p.cents !== 0);

  const base = m.liikevaihtoCents;
  if (base <= 0 || parts.length === 0) return null;

  return (
    <Card className="p-5">
      <h2 className="text-[17px] font-bold text-text">Mihin liikevaihto meni</h2>
      <p className="mt-1 text-xs text-faint">
        Osuus liikevaihdosta ({eur(base)}). Loppu on tulos.
      </p>
      <ul className="mt-4 space-y-2.5">
        {parts.map((p) => {
          const pct = (p.cents / base) * 100;
          return (
            <li key={p.label} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-text">{p.label}</span>
                <span className="shrink-0 tabular text-muted">
                  {eur(p.cents)} · {pct.toFixed(1)} %
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-line-soft">
                <div className={cx('h-1.5 rounded-full', p.color)}
                     style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
              </div>
            </li>
          );
        })}
        <li className="border-t border-line-soft pt-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-bold text-text">Tulos</span>
            <span className={cx('shrink-0 font-bold tabular',
              m.tulosCents < 0 ? 'text-danger' : 'text-accent')}>
              {eur(m.tulosCents)} · {((m.tulosCents / base) * 100).toFixed(1)} %
            </span>
          </div>
        </li>
      </ul>
    </Card>
  );
}

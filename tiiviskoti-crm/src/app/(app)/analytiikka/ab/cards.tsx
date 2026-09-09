import { stepLabel, type AbTestResult } from '@/lib/ab';
import { formatDateKey } from '@/lib/time';
import { Card, cx } from '@/components/ui';
import { DeleteButton } from '@/components/delete-button';
import { SubmitButton } from '@/components/submit';
import { deleteAbTest, endAbTest, reopenAbTest } from './actions';

/* =========================================================
   Yhden testin kortti.

   TULOS EI OLE PELKKÄ PROSENTTI. Kaksi lukua ilman p-arvoa saa aina
   näyttämään siltä että toinen voittaa, koska kaksi lukua on harvoin
   täsmälleen sama. Siksi kortti kertoo myös onko ero sattuman rajoissa ja
   paljonko otosta vielä puuttuu — ja päättämisnappi on ihmisen käden
   takana, ei automaattinen.
   ========================================================= */

const pct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')} %`;

const pValue = (p: number) =>
  p < 0.001 ? 'p < 0,001' : `p = ${p.toFixed(3).replace('.', ',')}`;

/** Kuinka moninkertainen voittaja on häviäjään nähden. */
function ratio(t: AbTestResult): string | null {
  const { rateA, rateB } = t.stats;
  const hi = Math.max(rateA, rateB);
  const lo = Math.min(rateA, rateB);
  if (lo <= 0 || hi <= 0) return null;
  return `${(hi / lo).toFixed(1).replace('.', ',')}×`;
}

export function ArmRow({ label, base, hit, rate, leader, tag }: {
  label: string; base: number; hit: number; rate: number; leader: boolean; tag: string;
}) {
  return (
    <div className={cx(
      'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border px-3 py-2.5',
      leader ? 'border-accent/40 bg-accent-dim' : 'border-line-soft bg-ink-800',
    )}>
      <span className="min-w-0 text-sm">
        <b className={cx('mr-1.5', leader ? 'text-accent' : 'text-muted')}>{tag}</b>
        <span className="text-text">{label}</span>
      </span>
      <span className="shrink-0 text-sm tabular text-muted">
        {hit} / {base} ·{' '}
        <b className={cx('text-[15px]', leader ? 'text-accent' : 'text-text')}>{pct(rate)}</b>
      </span>
    </div>
  );
}

export function Verdict({ t }: { t: AbTestResult }) {
  const { stats } = t;
  const kerroin = ratio(t);
  const voittaja = stats.leader === 'a' ? t.label_a : t.label_b;

  if (stats.smallestArm === 0) {
    return (
      <p className="rounded-lg border border-line bg-ink-700 px-3 py-2.5 text-sm text-muted">
        Ei vielä dataa. Tarkista että sivu lähettää valitun askeleen ja että polkukuvio{' '}
        <code className="rounded bg-line-soft px-1 py-0.5 text-xs">{t.path_pattern}</code> osuu.
      </p>
    );
  }

  if (stats.significant) {
    return (
      <p className="rounded-lg border border-accent/35 bg-accent-dim px-3 py-2.5 text-sm text-accent">
        <b>Ero ei ole enää sattumaa</b> ({pValue(stats.p)}).{' '}
        {kerroin && <>Voittaja on <b>{voittaja}</b>, {kerroin} parempi. </>}
        Tämän voi päättää.
      </p>
    );
  }

  const puuttuu = Number.isFinite(stats.needPerArm)
    ? Math.max(stats.needPerArm - stats.smallestArm, 0)
    : null;

  return (
    <div className="rounded-lg border border-line bg-ink-700 px-3 py-2.5 text-sm text-muted">
      <b className="text-text">Ei eroa vielä</b> ({pValue(stats.p)}) — nykyiset luvut mahtuvat
      sattumaan.{' '}
      {puuttuu === null ? (
        <>Versiot ovat käytännössä tasan, eikä kumpaakaan voi julistaa voittajaksi millään otoskoolla.</>
      ) : (
        <>
          Tämän kokoisen eron todistamiseen tarvitaan noin{' '}
          <b className="text-text tabular">{stats.needPerArm}</b> näyttöä per versio
          (nyt {stats.smallestArm}).{' '}
          {t.daysLeft !== null && t.daysLeft > 0 && (
            <>Nykyvauhdilla noin <b className="text-text">{t.daysLeft} päivää</b> lisää.</>
          )}
        </>
      )}
    </div>
  );
}

export function TestCard({ t }: { t: AbTestResult }) {
  const running = t.ended_on === null;
  const winnerLabel = t.winner === 'a' ? t.label_a : t.winner === 'b' ? t.label_b : 'Ei eroa';

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] leading-tight font-bold text-text">{t.name}</h3>
          <p className="mt-1 text-xs text-faint">
            {formatDateKey(t.started_on)}
            {t.ended_on ? ` – ${formatDateKey(t.ended_on)}` : ' →'} · {t.daysRun} pv ·{' '}
            {stepLabel(t.metric_step)} / {stepLabel(t.base_step)}
          </p>
        </div>
        <span className={cx(
          'shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-bold whitespace-nowrap',
          running
            ? 'border-accent/35 bg-accent-dim text-accent'
            : 'border-line bg-ink-700 text-muted',
        )}>
          {running ? 'Käynnissä' : `Voittaja: ${winnerLabel}`}
        </span>
      </div>

      {t.hypothesis && (
        <p className="mt-3 border-l-2 border-line pl-3 text-sm leading-relaxed text-muted">
          {t.hypothesis}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {/* Johtava versio korostetaan VASTA kun ero on merkitsevä. Vihreä
            palkki pienen ja sattumanvaraisen eron kohdalla lukisi
            "B voittaa", ja juuri siitä syntyy testin lopettaminen liian
            aikaisin väärän version kanssa. */}
        <ArmRow tag="A" label={t.label_a} base={t.a.base} hit={t.a.hit}
                rate={t.stats.rateA} leader={t.stats.significant && t.stats.leader === 'a'} />
        <ArmRow tag="B" label={t.label_b} base={t.b.base} hit={t.b.hit}
                rate={t.stats.rateB} leader={t.stats.significant && t.stats.leader === 'b'} />
      </div>

      <div className="mt-3"><Verdict t={t} /></div>

      {t.notes && <p className="mt-3 text-xs leading-relaxed text-faint">{t.notes}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
        {running ? (
          <>
            <span className="mr-1 text-xs text-faint">Päätä testi:</span>
            {(['a', 'b', 'none'] as const).map((w) => (
              <form key={w} action={endAbTest}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="winner" value={w} />
                <SubmitButton variant="outline" className="px-3 py-1.5 text-xs"
                              pendingLabel="Päätetään…">
                  {w === 'a' ? 'A voittaa' : w === 'b' ? 'B voittaa' : 'Ei eroa'}
                </SubmitButton>
              </form>
            ))}
          </>
        ) : (
          <form action={reopenAbTest}>
            <input type="hidden" name="id" value={t.id} />
            <SubmitButton variant="ghost" className="px-3 py-1.5 text-xs" pendingLabel="Avataan…">
              Avaa uudelleen
            </SubmitButton>
          </form>
        )}
        <span className="flex-1" />
        <DeleteButton id={t.id} action={deleteAbTest} nimi={t.name} />
      </div>
    </Card>
  );
}

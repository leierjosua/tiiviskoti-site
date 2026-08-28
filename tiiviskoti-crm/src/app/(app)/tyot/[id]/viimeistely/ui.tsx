'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CATALOG, SATISFACTION, eur, finalTotal, lineSum, linesTotal, type Line,
} from '@/lib/completion';
import { cx, ErrorNote } from '@/components/ui';
import { completeJob } from './actions';

/* =========================================================
   Viimeistelyvelho.

   Neljä askelta, joista toinen on ehdollinen: useimmat keikat menevät
   niin kuin ne varattiin, ja niiltä ei pidä kysyä riviään rivi kerrallaan.
   Siksi ensimmäinen kysymys on "muuttuiko mikään" — ei "mitä tehtiin".

   Yksi selainkomponentti eikä neljä sivua: velho on yksi päätös joka
   tallennetaan kerralla. Askelten välissä ei ole mitään mitä kannattaisi
   tallentaa keskeneräisenä, ja pakettiauton verkolla jokainen
   sivulataus on sekunti seisomista.
   ========================================================= */

type JobInfo = {
  id: string;
  jobNumber: string;
  title: string;
  startsAt: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
};

type Step = 'polku' | 'muokkaa' | 'maksu' | 'yhteenveto';

const STEP_LABELS: Record<Step, string> = {
  polku: 'Polku', muokkaa: 'Muokkaa', maksu: 'Maksu', yhteenveto: 'Yhteenveto',
};

/** '12,50' → 1250 senttiä. Pilkku ja piste kelpaavat kumpikin. */
function centsOf(text: string): number {
  const n = Number(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-faint uppercase">{label}</p>
      <p className="mt-0.5 font-semibold text-text">{children || '—'}</p>
    </div>
  );
}

/* Iso valintakortti. Askeleet 1 ja 3 ovat kumpikin yksi kysymys ja kaksi
   vastausta, joten ne saavat saman muodon — asentaja oppii sen kerran. */
function ChoiceCard({ emoji, title, sub, onClick, tone = 'plain' }: {
  emoji: string; title: string; sub: string; onClick: () => void; tone?: 'plain' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-(--radius-card) border bg-ink-800 p-5 text-left transition-all',
        'hover:-translate-y-px hover:shadow-(--shadow-card)',
        tone === 'danger' ? 'border-line hover:border-danger' : 'border-line hover:border-accent',
      )}
    >
      <span aria-hidden className="text-[22px]">{emoji}</span>
      <p className="mt-2 font-bold text-text">{title}</p>
      <p className="text-sm text-muted">{sub}</p>
    </button>
  );
}

export function ViimeistelyWizard({ job, initialLines }: { job: JobInfo; initialLines: Line[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>('polku');
  const [path, setPath] = useState<'vakio' | 'muokkaa' | null>(null);
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [paid, setPaid] = useState<boolean | null>(null);
  const [discount, setDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [satisfaction, setSatisfaction] = useState<1 | 2 | 3 | null>(null);
  const [sendReceiptMail, setSendReceiptMail] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const steps: Step[] = path === 'muokkaa'
    ? ['polku', 'muokkaa', 'maksu', 'yhteenveto']
    : ['polku', 'maksu', 'yhteenveto'];

  const discountCents = centsOf(discount);
  const subtotal = linesTotal(lines);
  const total = finalTotal(lines, discountCents);

  const lineOf = (catalogId: string) => lines.find((l) => l.catalogId === catalogId);

  const bump = (catalogId: string, delta: number) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.catalogId === catalogId);
      if (i === -1) {
        if (delta <= 0) return prev;
        const item = CATALOG.find((c) => c.id === catalogId)!;
        return [...prev, {
          catalogId, name: item.name, quantity: 1, unitPriceCents: item.priceCents,
        }];
      }
      const next = [...prev];
      const q = next[i].quantity + delta;
      if (q <= 0) return next.filter((_, k) => k !== i);
      next[i] = { ...next[i], quantity: q };
      return next;
    });
  };

  const freeLines = lines.filter((l) => l.catalogId === null);

  const patchFree = (index: number, patch: Partial<Line>) => {
    setLines((prev) => {
      let seen = -1;
      return prev.map((l) => {
        if (l.catalogId !== null) return l;
        seen += 1;
        return seen === index ? { ...l, ...patch } : l;
      });
    });
  };

  const removeFree = (index: number) => {
    setLines((prev) => {
      let seen = -1;
      return prev.filter((l) => {
        if (l.catalogId !== null) return true;
        seen += 1;
        return seen !== index;
      });
    });
  };

  const groups = useMemo(() => ({
    palvelu: CATALOG.filter((c) => c.group === 'palvelu'),
    lisapalvelu: CATALOG.filter((c) => c.group === 'lisapalvelu'),
  }), []);

  /* Kuitti seuraa maksuvalintaa. Maksamattomasta keikasta lähtevä kuitti
     kertoisi asiakkaalle että hän on maksanut — se on väärä viesti, ja
     juuri se jonka ehdolla oleva valintaruutu lähettäisi vahingossa. */
  const choosePaid = (value: boolean) => {
    setPaid(value);
    setSendReceiptMail(value && Boolean(job.customerEmail));
    setStep('yhteenveto');
  };

  const submit = () => {
    setError(undefined);
    startTransition(async () => {
      const res = await completeJob({
        id: job.id,
        lines: lines.map((l) => ({
          catalogId: l.catalogId, name: l.name,
          quantity: l.quantity, unitPriceCents: l.unitPriceCents,
        })),
        discountCents,
        discountReason,
        paid: paid === true,
        satisfaction,
        sendReceiptMail: sendReceiptMail && Boolean(job.customerEmail),
      });
      if (res.error) { setError(res.error); return; }
      router.push(`/tyot/${job.id}`);
      router.refresh();
    });
  };

  const address = [job.address, job.postalCode, job.city].filter(Boolean).join(', ');
  const startsAt = new Date(job.startsAt);
  const when = startsAt.toLocaleString('fi-FI', {
    weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki',
  });

  /* Askelmerkit. Takaisin saa hypätä, eteenpäin ei — eteenpäin on
     päätös, ja päätöksen ohittaminen jättäisi kentän tyhjäksi. */
  const stepper = (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => {
        const at = steps.indexOf(step);
        const done = i < at;
        return (
          <button
            key={s}
            type="button"
            disabled={i > at}
            onClick={() => setStep(s)}
            className={cx(
              'rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
              s === step
                ? 'bg-accent text-accent-ink'
                : done
                  ? 'text-accent hover:bg-accent-dim'
                  : 'text-faint',
            )}
          >
            {done && <span aria-hidden className="mr-1">✓</span>}
            {STEP_LABELS[s]}
          </button>
        );
      })}
    </div>
  );

  const catalogGrid = (items: typeof CATALOG, key: string) => {
    const expanded = showAll[key];
    const visible = expanded ? items : items.slice(0, 4);
    return (
      <>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-text">
            {key === 'palvelu' ? 'Palvelut' : 'Lisäpalvelut'}
          </h2>
          {items.length > 4 && (
            <button type="button"
                    onClick={() => setShowAll((v) => ({ ...v, [key]: !expanded }))}
                    className="text-sm font-semibold text-accent hover:underline">
              {expanded ? 'Näytä vähemmän' : 'Näytä kaikki'}
            </button>
          )}
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {visible.map((item) => {
            const line = lineOf(item.id);
            const qty = line?.quantity ?? 0;
            /* Rivin oma yksikköhinta voittaa katalogin: varaushinnastossa
               väliovi on 89 €, mutta saman käynnin toisesta kohteesta
               veloitettiin 59 €. Katalogin hinta kortissa väittäisi että
               rivi maksaa enemmän kuin se maksaa. */
            const unit = line?.unitPriceCents ?? item.priceCents;
            return (
              <div key={item.id}
                   className={cx(
                     'flex items-center gap-3 rounded-lg border bg-ink-800 p-3.5 transition-colors',
                     qty > 0 ? 'border-accent' : 'border-line',
                   )}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-text">{item.name}</p>
                  <p className="text-xs text-faint tabular">
                    {eur(unit)}{item.minutes ? ` · ${item.minutes} min` : ''}
                  </p>
                </div>
                {qty > 0 ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" aria-label={`Vähennä: ${item.name}`}
                            onClick={() => bump(item.id, -1)}
                            className="h-8 w-8 rounded-md border border-line text-lg leading-none text-muted hover:text-text">
                      −
                    </button>
                    <span className="w-6 text-center font-bold tabular">{qty}</span>
                    <button type="button" aria-label={`Lisää: ${item.name}`}
                            onClick={() => bump(item.id, 1)}
                            className="h-8 w-8 rounded-md border border-line text-lg leading-none text-muted hover:text-text">
                      +
                    </button>
                  </div>
                ) : (
                  <button type="button" aria-label={`Lisää: ${item.name}`}
                          onClick={() => bump(item.id, 1)}
                          className="h-8 w-8 shrink-0 rounded-md border border-line text-lg leading-none text-muted hover:border-accent hover:text-accent">
                    +
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <Link href={`/tyot/${job.id}`} aria-label="Takaisin varaukseen"
              className="text-muted hover:text-text">←</Link>
        <h1 className="text-[22px] font-extrabold tracking-tight text-text tabular">
          Viimeistely {job.jobNumber}
        </h1>
      </header>

      {step !== 'polku' && stepper}
      {error && <ErrorNote>{error}</ErrorNote>}

      {step === 'polku' && (
        <>
          <div className="rounded-(--radius-card) border border-line bg-ink-800 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Labeled label="Asiakas">{job.customerName}</Labeled>
              <Labeled label="Palvelu">{job.title}</Labeled>
              <Labeled label="Aika">{when}</Labeled>
              <Labeled label="Hinta">{eur(subtotal)}</Labeled>
              <Labeled label="Osoite">{address}</Labeled>
              <Labeled label="Puhelin">{job.customerPhone}</Labeled>
              <Labeled label="Sähköposti">{job.customerEmail}</Labeled>
            </div>
            {lines.length > 0 && (
              <p className="mt-4 border-t border-line-soft pt-3 text-sm text-faint">
                Tilattu: {lines.map((l) => (l.quantity > 1 ? `${l.quantity}× ` : '') + l.name).join(', ')}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              emoji="✅" title="Vakiokeikka" sub="Ei muutoksia"
              onClick={() => { setPath('vakio'); setStep('maksu'); }}
            />
            <ChoiceCard
              emoji="✏️" title="Muokkaa" sub="Lisää veloituksia"
              onClick={() => { setPath('muokkaa'); setStep('muokkaa'); }}
            />
          </div>
        </>
      )}

      {step === 'muokkaa' && (
        <div className="space-y-6">
          <section>{catalogGrid(groups.palvelu, 'palvelu')}</section>
          <section>{catalogGrid(groups.lisapalvelu, 'lisapalvelu')}</section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[17px] font-bold text-text">Muut veloitukset</h2>
              <button
                type="button"
                onClick={() => setLines((p) => [...p, {
                  catalogId: null, name: '', quantity: 1, unitPriceCents: 0,
                }])}
                className="text-sm font-semibold text-accent hover:underline"
              >
                + Lisää rivi
              </button>
            </div>
            {freeLines.length === 0 ? (
              <p className="text-sm text-faint">Ei lisäveloituksia.</p>
            ) : (
              <ul className="space-y-2">
                {freeLines.map((l, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <input
                      value={l.name}
                      onChange={(e) => patchFree(i, { name: e.target.value })}
                      placeholder="Selite, esim. matkalisä"
                      className="min-w-0 flex-1 rounded-lg border border-line bg-ink-800 px-3 py-2 text-sm
                                 focus:border-accent focus:outline-none"
                    />
                    <input
                      value={String(l.unitPriceCents / 100).replace('.', ',')}
                      onChange={(e) => patchFree(i, { unitPriceCents: centsOf(e.target.value) })}
                      inputMode="decimal"
                      className="w-28 rounded-lg border border-line bg-ink-800 px-3 py-2 text-sm tabular
                                 focus:border-accent focus:outline-none"
                    />
                    <button type="button" onClick={() => removeFree(i)}
                            aria-label="Poista rivi"
                            className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-danger">
                      Poista
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-[17px] font-bold text-text">
            Yhteensä: <span className="tabular">{eur(subtotal)}</span>
          </p>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setStep('polku')}
                    className="rounded-lg px-4 py-2.5 text-sm font-semibold text-muted hover:text-text">
              Takaisin
            </button>
            <button type="button" onClick={() => setStep('maksu')}
                    className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink hover:bg-[#1A6340]">
              Seuraava
            </button>
          </div>
        </div>
      )}

      {step === 'maksu' && (
        <div className="space-y-4">
          <p className="rounded-(--radius-card) border border-line bg-ink-800 px-5 py-4 font-semibold text-text">
            Lopullinen hinta: <span className="tabular">{eur(subtotal)}</span>
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              emoji="💳" title="Maksettu" sub="Asiakas on maksanut"
              onClick={() => choosePaid(true)}
            />
            <ChoiceCard
              emoji="⏳" title="Ei maksettu" sub="Laskutetaan jälkikäteen" tone="danger"
              onClick={() => choosePaid(false)}
            />
          </div>

          <button type="button" onClick={() => setStep(path === 'muokkaa' ? 'muokkaa' : 'polku')}
                  className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-muted hover:text-text">
            Takaisin
          </button>
        </div>
      )}

      {step === 'yhteenveto' && (
        <div className="space-y-4">
          <div className="rounded-(--radius-card) border border-line bg-ink-800 p-5">
            <h2 className="mb-4 text-[17px] font-bold text-text">Yhteenveto</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Labeled label="Asiakas">{job.customerName}</Labeled>
              <Labeled label="Palvelu">{job.title}</Labeled>
              <Labeled label="Päivämäärä">
                {startsAt.toLocaleDateString('fi-FI', { timeZone: 'Europe/Helsinki' })}
              </Labeled>
            </div>
          </div>

          <div className="rounded-(--radius-card) border border-line bg-ink-800 p-5">
            <h2 className="mb-3 text-[17px] font-bold text-text">Hintaerittely</h2>
            <ul className="divide-y divide-line-soft">
              {lines.map((l, i) => (
                <li key={i} className="flex items-center gap-3 py-2 text-sm">
                  <span className="flex-1">
                    {l.quantity > 1 && <b>{l.quantity}× </b>}{l.name || 'Rivi'}
                  </span>
                  <span className="tabular text-muted">{eur(lineSum(l))}</span>
                </li>
              ))}
              {discountCents > 0 && (
                <li className="flex items-center gap-3 py-2 text-sm text-accent">
                  <span className="flex-1">{discountReason.trim() || 'Alennus'}</span>
                  <span className="tabular">−{eur(discountCents)}</span>
                </li>
              )}
            </ul>
            <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
              <span className="flex-1 font-bold text-text">Yhteensä</span>
              <span className="text-[19px] font-extrabold tabular text-accent">{eur(total)}</span>
            </div>
          </div>

          <div className="rounded-(--radius-card) border border-line bg-ink-800 p-5">
            <h2 className="mb-3 text-[17px] font-bold text-text">Alennus</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold tracking-wide text-faint uppercase">
                  Summa (€)
                </span>
                <input value={discount} onChange={(e) => setDiscount(e.target.value)}
                       inputMode="decimal" placeholder="0,00"
                       className="w-full rounded-lg border border-line bg-ink-800 px-3 py-2.5 text-sm tabular
                                  focus:border-accent focus:outline-none" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold tracking-wide text-faint uppercase">
                  Syy
                </span>
                <input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)}
                       placeholder="esim. kanta-asiakas, reklamaatio…"
                       className="w-full rounded-lg border border-line bg-ink-800 px-3 py-2.5 text-sm
                                  focus:border-accent focus:outline-none" />
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-(--radius-card) border border-line bg-ink-800 px-5 py-4">
            <span className="flex-1 font-semibold text-text">Maksutila</span>
            <span className={cx(
              'rounded-full border px-3 py-1.5 text-sm font-bold',
              paid ? 'border-accent/35 bg-accent-dim text-accent' : 'border-warn/35 bg-warn/10 text-warn',
            )}>
              {paid ? 'Maksettu' : 'Ei maksettu'}
            </span>
          </div>

          <div className="rounded-(--radius-card) border border-line bg-ink-800 p-5">
            <h2 className="mb-3 text-[17px] font-bold text-text">Asiakastyytyväisyys</h2>
            <div className="flex flex-wrap gap-2">
              {SATISFACTION.map((s) => (
                <button key={s.value} type="button"
                        onClick={() => setSatisfaction(satisfaction === s.value ? null : s.value)}
                        aria-pressed={satisfaction === s.value}
                        className={cx(
                          'w-28 rounded-lg border px-3 py-3 text-center transition-colors',
                          satisfaction === s.value
                            ? 'border-accent bg-accent-dim'
                            : 'border-line hover:border-accent',
                        )}>
                  <span aria-hidden className="block text-[22px]">{s.emoji}</span>
                  <span className="mt-1 block text-sm font-semibold text-text">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Kuitti vaatii sähköpostiosoitteen. Ilman sitä valinta olisi
              lupaus jota ei voi pitää, joten se näytetään lukittuna. */}
          <label className={cx(
            'flex items-center gap-3 rounded-(--radius-card) border border-line bg-ink-800 px-5 py-4',
            job.customerEmail ? 'cursor-pointer' : 'opacity-60',
          )}>
            <input type="checkbox" checked={sendReceiptMail && Boolean(job.customerEmail)}
                   disabled={!job.customerEmail}
                   onChange={(e) => setSendReceiptMail(e.target.checked)}
                   className="h-5 w-5 accent-[#217A4E]" />
            <span className="font-semibold text-text">
              Lähetä sähköpostikuitti asiakkaalle
              {!job.customerEmail && (
                <span className="block text-sm font-normal text-faint">
                  Asiakkaalta puuttuu sähköpostiosoite.
                </span>
              )}
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setStep('maksu')} disabled={pending}
                    className="rounded-lg px-4 py-2.5 text-sm font-semibold text-muted hover:text-text disabled:opacity-45">
              Takaisin
            </button>
            <button type="button" onClick={submit} disabled={pending}
                    className="flex-1 rounded-lg bg-accent px-5 py-3 text-sm font-bold text-accent-ink
                               hover:bg-[#1A6340] disabled:opacity-45">
              {pending ? 'Viimeistellään…' : '✓ Viimeistele'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

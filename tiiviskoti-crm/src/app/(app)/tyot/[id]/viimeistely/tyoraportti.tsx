'use client';

import { useState } from 'react';
import { cx, ErrorNote } from '@/components/ui';
import {
  WORK_STEPS, answeredCount, missingSteps, reportProblems,
  type StepAnswer, type StepKey, type WorkReport,
} from '@/lib/work-report';

/* =========================================================
   Velhon Työraportti-askel — paperilomakkeen "Työraportti A4" sisältö
   puhelimen ruudulle.

   Puhelinta käytetään yhdellä kädellä, usein hanskat kädessä. Siksi
   jokainen napautettava kohta on vähintään 44 px korkea ja työvaiheissa
   on kaksi isoa nappia rivillä eikä pieniä valintaruutuja.

   Jatka-nappi EI ole `disabled`: lukittu nappi ei kerro miksi se on
   lukittu. Kesken olevana se on himmennetty, ja painallus näyttää mitkä
   rivit puuttuvat ja vierittää ensimmäiseen.
   ========================================================= */

const LABEL = 'mb-1.5 block text-xs font-semibold tracking-wide text-faint uppercase';
const INPUT =
  'min-h-11 w-full rounded-lg border border-line bg-ink-800 px-3 py-2.5 text-base text-text ' +
  'placeholder:text-faint focus:border-accent focus:outline-none';

function TextField({ label, value, onChange, required, placeholder, inputMode, type = 'text', id }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean;
  placeholder?: string; inputMode?: 'decimal' | 'numeric' | 'tel' | 'text'; type?: string; id?: string;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className={LABEL}>{label}{required && <span className="text-danger"> *</span>}</span>
      <input id={id} type={type} value={value} inputMode={inputMode} placeholder={placeholder}
             onChange={(e) => onChange(e.currentTarget.value)}
             className={cx(INPUT, 'tabular')} />
    </label>
  );
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const set = (n: number) => onChange(Math.max(0, Math.min(999, n)));
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 font-semibold text-text">{label}</span>
      <button type="button" aria-label={`Vähennä: ${label}`} onClick={() => set(value - 1)}
              className="h-11 w-11 rounded-lg border border-line bg-ink-800 text-xl leading-none text-muted hover:text-text">
        −
      </button>
      <input value={String(value)} inputMode="numeric" aria-label={`${label} kpl`}
             onChange={(e) => {
               const n = parseInt(e.currentTarget.value.replace(/\D/g, '') || '0', 10);
               set(Number.isFinite(n) ? n : 0);
             }}
             className="h-11 w-14 rounded-lg border border-line bg-ink-800 text-center text-base font-bold tabular
                        focus:border-accent focus:outline-none" />
      <button type="button" aria-label={`Lisää: ${label}`} onClick={() => set(value + 1)}
              className="h-11 w-11 rounded-lg border border-line bg-ink-800 text-xl leading-none text-muted hover:text-text">
        +
      </button>
    </div>
  );
}

const nowHHMM = () =>
  new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' })
    .replace('.', ':');

export function TyoraporttiStep({
  report, onChange, onBack, onNext, tableMissing, scheduled,
}: {
  report: WorkReport;
  onChange: (r: WorkReport) => void;
  onBack: () => void;
  onNext: () => void;
  tableMissing: boolean;
  scheduled: string;
}) {
  const [tried, setTried] = useState(false);
  const patch = (p: Partial<WorkReport>) => onChange({ ...report, ...p });
  const setStep = (key: StepKey, v: StepAnswer) =>
    onChange({ ...report, steps: { ...report.steps, [key]: v } });

  const done = answeredCount(report.steps);
  const missing = missingSteps(report.steps);
  const missingKeys = new Set<string>(missing.map((s) => s.key));
  const problems = reportProblems(report);
  const ready = problems.length === 0;

  const next = () => {
    if (ready) { onNext(); return; }
    setTried(true);
    /* Ensimmäinen puuttuva työvaihe näkyviin; jos vaiheet ovat kunnossa,
       virhelista ruudun alalaidassa kertoo loput. */
    const first = missing[0];
    const el = first ? document.getElementById(`vaihe-${first.key}`) : document.getElementById('raportti-virheet');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="space-y-5">
      {tableMissing && (
        <ErrorNote>
          Tietokannasta puuttuu työraporttien taulu (db/033_job_reports.sql). Raporttia ei voi tallentaa
          ennen kuin toimisto ajaa migraation.
        </ErrorNote>
      )}

      <section className="rounded-(--radius-card) border border-line bg-ink-800 p-4 sm:p-5">
        <h2 className="mb-3 text-[17px] font-bold text-text">Työraportti</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Päivämäärä" type="date" required value={report.workDate}
                     onChange={(v) => patch({ workDate: v })} />
          <TextField label="Asentaja(t)" required value={report.installers}
                     onChange={(v) => patch({ installers: v })} />
          <TextField label="Asiakas / taloyhtiö" value={report.customerName}
                     onChange={(v) => patch({ customerName: v })} />
          <TextField label="Puhelin" inputMode="tel" value={report.customerPhone}
                     onChange={(v) => patch({ customerPhone: v })} />
          <TextField label="Osoite" value={report.address} onChange={(v) => patch({ address: v })} />
          <TextField label="Rappu / huoneisto" value={report.unit} placeholder="esim. B 12"
                     onChange={(v) => patch({ unit: v })} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <TextField label="Aloitus klo" type="time" required value={report.startedAt}
                       onChange={(v) => patch({ startedAt: v })} />
          </div>
          <div>
            <TextField label="Lopetus klo" type="time" required value={report.finishedAt}
                       onChange={(v) => patch({ finishedAt: v })} />
            {!report.finishedAt && (
              <button type="button" onClick={() => patch({ finishedAt: nowHHMM() })}
                      className="mt-1 min-h-11 text-sm font-semibold text-accent hover:underline">
                Nyt
              </button>
            )}
          </div>
          <div className="col-span-2 sm:col-span-1">
            <TextField label="Matka-aika (h)" inputMode="decimal" placeholder="esim. 1,5"
                       value={report.travelHours} onChange={(v) => patch({ travelHours: v })} />
          </div>
        </div>
        <p className="mt-2 text-xs text-faint tabular">Varattu aika {scheduled}. Kirjaa todelliset ajat.</p>
      </section>

      <section className="rounded-(--radius-card) border border-line bg-accent-dim/60 p-4 sm:p-5">
        <h2 className="mb-3 text-xs font-bold tracking-wide text-accent uppercase">Kohteet</h2>
        <div className="space-y-2.5">
          <Counter label="Ikkunat" value={report.windows} onChange={(n) => patch({ windows: n })} />
          <Counter label="Parvekeovet" value={report.balconyDoors} onChange={(n) => patch({ balconyDoors: n })} />
          <Counter label="Ulko-/muut ovet" value={report.otherDoors} onChange={(n) => patch({ otherDoors: n })} />
        </div>
      </section>

      <section className="rounded-(--radius-card) border border-line bg-ink-800 p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-bold tracking-wide text-accent uppercase">Työvaihe</h2>
          <span className={cx('text-sm font-semibold tabular', done === WORK_STEPS.length ? 'text-accent' : 'text-muted')}>
            {done}/{WORK_STEPS.length} kohtaa merkitty
          </span>
        </div>
        <ol className="divide-y divide-line-soft">
          {WORK_STEPS.map((s, i) => {
            const v = report.steps[s.key];
            const flag = tried && missingKeys.has(s.key);
            return (
              <li key={s.key} id={`vaihe-${s.key}`}
                  className={cx('scroll-mt-24 py-3', flag && '-mx-2 rounded-lg bg-warn/8 px-2')}>
                <p className="mb-2 text-[15px] leading-snug text-text">
                  <span className="mr-1.5 text-faint tabular">{i + 1}.</span>{s.label}
                  {flag && <span className="ml-1.5 text-sm font-semibold text-warn">— merkitse</span>}
                </p>
                <div role="radiogroup" aria-label={s.label} className="grid grid-cols-2 gap-2">
                  {([['done', 'Tehty'], ['na', 'Ei tarpeen']] as const).map(([val, text]) => {
                    const on = v === val;
                    return (
                      <button key={val} type="button" role="radio" aria-checked={on}
                              onClick={() => setStep(s.key, val)}
                              className={cx(
                                'min-h-11 rounded-lg border px-3 py-2 text-[15px] font-semibold transition-colors',
                                on && val === 'done' && 'border-accent bg-accent text-accent-ink',
                                on && val === 'na' && 'border-muted bg-ink-600 text-text',
                                !on && 'border-line bg-ink-800 text-muted hover:border-accent hover:text-text',
                                flag && !on && 'border-warn/50',
                              )}>
                        {on && <span aria-hidden className="mr-1">✓</span>}{text}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-(--radius-card) border border-line bg-ink-800 p-4 sm:p-5">
        <h2 className="mb-3 text-xs font-bold tracking-wide text-accent uppercase">Materiaalit</h2>
        <div className="grid grid-cols-3 gap-3">
          <TextField label="Tiivistettä (m)" inputMode="decimal" value={report.sealantM}
                     onChange={(v) => patch({ sealantM: v })} />
          <TextField label="Silikonia (kpl)" inputMode="numeric" value={report.siliconePcs}
                     onChange={(v) => patch({ siliconePcs: v })} />
          <TextField label="Akryyliä (kpl)" inputMode="numeric" value={report.acrylicPcs}
                     onChange={(v) => patch({ acrylicPcs: v })} />
        </div>

        <label className="mt-4 block">
          <span className={LABEL}>Huomiot / lisätyöt</span>
          <textarea value={report.notes} rows={3} onChange={(e) => patch({ notes: e.currentTarget.value })}
                    placeholder="esim. makuuhuoneen ikkunan karmi lahonnut, suositeltu korjausta"
                    className={cx(INPUT, 'leading-relaxed')} />
        </label>

        <div className="mt-4">
          <TextField label="Asiakkaan kuittaus ja nimenselvennys" required value={report.customerAckName}
                     placeholder="Asiakkaan nimi" onChange={(v) => patch({ customerAckName: v })} />
          <p className="mt-1.5 text-xs text-faint">Asiakas on nähnyt työn ja kuittaa sen nimellään.</p>
        </div>
      </section>

      {tried && !ready && (
        <div id="raportti-virheet" role="alert"
             className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm font-medium text-danger">
          <>
            <span className="block font-semibold">Raportti on kesken:</span>
            <ul className="mt-1 list-disc pl-5">
              {missing.length > 0 && (
                <li>Merkitsemättä {missing.length} työvaihetta: {missing.map((s) => s.label).join(', ')}</li>
              )}
              {problems.filter((p) => !p.startsWith('Merkitse jokainen')).map((p) => <li key={p}>{p}</li>)}
            </ul>
          </>
        </div>
      )}

      {/* Jatka-palkki pysyy ruudun alalaidassa: lomake on pitkä, eikä
          laskurin ja napin pidä kadota vierityksen mukana. */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-ink-900/95 px-4 py-3 backdrop-blur
                      pb-[max(0.75rem,env(safe-area-inset-bottom))] md:mx-0 md:rounded-lg md:border">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack}
                  className="min-h-11 rounded-lg px-3 text-sm font-semibold text-muted hover:text-text">
            Takaisin
          </button>
          <span className="flex-1 text-sm text-muted tabular">
            <b className={done === WORK_STEPS.length ? 'text-accent' : 'text-text'}>{done}/{WORK_STEPS.length}</b> kohtaa merkitty
          </span>
          {/* Ei aria-disabled: nappi TEKEE jotain myös kesken ollessa (näyttää
              puutteet), joten sitä ei saa ilmoittaa ruudunlukijalle lukituksi. */}
          <button type="button" onClick={next} data-ready={ready ? 'true' : 'false'}
                  className={cx(
                    'min-h-11 rounded-lg bg-accent px-5 text-sm font-bold text-accent-ink hover:bg-[#1A6340]',
                    !ready && 'opacity-45',
                  )}>
            Jatka
          </button>
        </div>
      </div>
    </div>
  );
}

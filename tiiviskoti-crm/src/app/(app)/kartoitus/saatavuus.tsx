'use client';

import { useEffect, useState } from 'react';
import { Card, cx } from '@/components/ui';
import { asentajienSaatavuus, type SaatavuusDay } from './actions';
import { StepHeader } from './step-header';

/* =========================================================
   Asentajien vapaat ajat kartoituslomakkeella.

   Kartoittaja voi sanoa asiakkaalle heti "tiistaina klo 9 pääsemme",
   eikä luvata aikaa jota ei ole. Ajat lasketaan samalla tavalla kuin
   varauksessa, joten näkyvä aika on oikeasti varattavissa — mutta EI
   varata vielä: se varataan kun asiakas on hyväksynyt (kartoituksen
   sivulla "Varaa tämä aika"). Muuten jokainen kartoitus lukitsisi ajan.

   Päivä kerrallaan, asentaja riveittäin: ikäihmiselle helpompi lukea
   kuin ruudukko. Oletuksena vain asiakkaan alueen asentajat.
   ========================================================= */

export type Valinta = { iso: string; label: string; calendarId: string; name: string };

export function AsentajienSaatavuus({ step, postalCode, minutes, value, onPick, disabled }: {
  step: number;
  postalCode: string;
  minutes: number;
  value?: { iso?: string; calendarId?: string };
  onPick: (v: Valinta | null) => void;
  disabled?: boolean;
}) {
  const [days, setDays] = useState<SaatavuusDay[] | null>(null);
  const [error, setError] = useState(false);
  const [kaikki, setKaikki] = useState(false);
  const [naytaPaivia, setNaytaPaivia] = useState(5);

  useEffect(() => {
    let alive = true;
    setDays(null); setError(false);
    asentajienSaatavuus(postalCode, minutes, 21)
      .then((r) => alive && setDays(r))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [postalCode, minutes]);

  const alueella = /^\d{5}$/.test(postalCode);
  const shown = (days ?? [])
    .map((d) => ({ ...d, staff: d.staff.filter((s) => kaikki || s.inArea) }))
    .filter((d) => d.staff.length > 0);
  const kesto = minutes >= 60 ? `${String(Math.round(minutes / 30) / 2).replace('.', ',')} h` : `${minutes} min`;

  return (
    <Card className="scroll-mt-24" id={`osio-${step}`}>
      <StepHeader n={step} title="Asentajien vapaat ajat"
        hint={`Ajat joihin työ (${kesto}) mahtuu. Napauta aikaa, niin se tulee tarjoukseen ehdotettuna aikana.`} />
      <div className="space-y-4 px-5 py-4">
        {alueella && (
          <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-[12px] bg-ink-700 p-1">
            {[false, true].map((v) => (
              <button key={String(v)} type="button" role="radio" aria-checked={kaikki === v}
                onClick={() => setKaikki(v)}
                className={cx('no-min min-h-12 rounded-[9px] px-3 text-[16px]',
                  kaikki === v ? 'bg-white font-bold text-text shadow-[0_1px_3px_rgba(0,0,0,.15)]' : 'font-medium text-muted')}>
                {v ? 'Kaikki asentajat' : `Alueen ${postalCode} asentajat`}
              </button>
            ))}
          </div>
        )}

        {value?.iso && (
          <div className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-accent bg-accent-dim px-4 py-3">
            <span aria-hidden className="text-[22px] text-accent">✓</span>
            <div className="flex-1 text-[17px] font-semibold text-accent">Valittu aika on tarjouksessa.</div>
            {!disabled && (
              <button type="button" onClick={() => onPick(null)}
                className="no-min min-h-11 rounded-[10px] px-3 text-[16px] font-semibold text-accent underline underline-offset-2">
                Poista
              </button>
            )}
          </div>
        )}

        {error && <p className="text-[17px] text-danger">Aikoja ei saatu haettua. Tarkista yhteys ja lataa sivu uudelleen.</p>}
        {!error && days === null && <p className="text-[17px] text-muted">Haetaan vapaita aikoja…</p>}
        {!error && days !== null && shown.length === 0 && (
          <p className="text-[17px] text-muted">
            {alueella && !kaikki
              ? 'Alueen asentajilla ei ole vapaita aikoja kolmeen viikkoon. Katso kaikki asentajat yltä.'
              : 'Ei vapaita aikoja kolmeen viikkoon. Asentajien pitää ilmoittaa ajat Omat ajat -sivulla.'}
          </p>
        )}

        {shown.slice(0, naytaPaivia).map((d) => (
          <section key={d.dayKey} className="space-y-2">
            <h3 className="text-[19px] font-bold text-text capitalize">{d.label}</h3>
            {d.staff.map((s) => (
              <div key={s.calendarId} className="rounded-[14px] bg-ink-700 p-3">
                <div className="mb-2 text-[16px] font-semibold text-text">
                  {s.name}{!s.inArea && <span className="font-normal text-faint"> · muu alue</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.slots.map((sl) => {
                    const on = value?.iso === sl.iso && value?.calendarId === s.calendarId;
                    return (
                      <button key={sl.iso} type="button" disabled={disabled} aria-pressed={on}
                        onClick={() => onPick(on ? null : { iso: sl.iso, label: `${d.label} klo ${sl.time}`, calendarId: s.calendarId, name: s.name })}
                        className={cx('no-min min-h-12 min-w-[76px] rounded-[12px] border-[1.5px] px-3 text-[18px] font-semibold tabular-nums',
                          on ? 'border-accent bg-accent text-white' : 'border-line bg-white text-text')}>
                        {sl.time}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ))}

        {shown.length > naytaPaivia && (
          <button type="button" onClick={() => setNaytaPaivia((n) => n + 5)}
            className="w-full rounded-[14px] border-[1.5px] border-line bg-white px-4 text-[17px] font-semibold text-accent">
            Näytä lisää päiviä
          </button>
        )}
      </div>
    </Card>
  );
}

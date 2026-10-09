'use client';

import dynamic from 'next/dynamic';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { createArea, deleteArea, updateArea, type ActionState } from './actions';
import { Button, ErrorNote, Field, Input, cx } from '@/components/ui';
import { SubmitButton } from '@/components/submit';
import { postalsWithin, postinumero } from '@/lib/postinumerot';

const AlueKartta = dynamic(() => import('./alue-kartta').then((m) => m.AlueKartta), {
  ssr: false,
  loading: () => <div className="h-[380px] w-full animate-pulse rounded-lg border border-line bg-ink-700" />,
});

export type AreaData = {
  id: string; name: string; postal_prefixes: string[];
  travel_fee_cents: number; active: boolean;
  center_postal: string | null; radius_km: string | null; excluded_postals: string[];
  calendar_ids: string[]; jobs: number;
};

/** Valittavat kalenterit. `otherAreas` = muut alueet joihin kalenteri jo kuuluu. */
export type CalendarOption = { id: string; label: string; otherAreas: { id: string; name: string }[] };

const km = (n: number) => n.toLocaleString('fi-FI', { maximumFractionDigits: 1 });

function Note({ state }: { state: ActionState }) {
  return (
    <>
      <ErrorNote>{state.error}</ErrorNote>
      {state.ok && (
        <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
          {state.ok}
        </p>
      )}
    </>
  );
}

/** Lyhyt kuvaus alueesta listaan: mistä postinumerot tulevat. */
export function areaSummary(area: AreaData): string {
  if (area.center_postal && area.radius_km) {
    const c = postinumero(area.center_postal);
    const ex = area.excluded_postals.length;
    return `${area.center_postal}${c ? ` ${c.name}` : ''} + ${km(Number(area.radius_km))} km · `
      + `${area.postal_prefixes.length} postinumeroa${ex ? ` · ${ex} poissuljettu` : ''}`;
  }
  return `Etuliitteet ${area.postal_prefixes.join(' ')}`;
}

export function AreaCard({ area, calendars }: { area: AreaData; calendars: CalendarOption[] }) {
  const [open, setOpen] = useState(false);
  const names = calendars.filter((c) => area.calendar_ids.includes(c.id)).map((c) => c.label);

  return (
    <div className={cx('border-b border-line-soft last:border-0', !area.active && 'opacity-60')}>
      <div className="flex flex-wrap items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-text">{area.name}</b>
            {!area.active && <span className="rounded bg-ink-700 px-1.5 py-0.5 text-xs text-muted">Ei käytössä</span>}
            {area.travel_fee_cents > 0 && (
              <span className="text-xs text-faint tabular">+{area.travel_fee_cents / 100} € matkalisä</span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted">{areaSummary(area)}</p>
          <p className={cx('mt-0.5 text-xs', names.length ? 'text-faint' : 'text-warn')}>
            {names.length
              ? names.join(', ')
              : 'Ei yhtään asentajaa — tälle alueelle ei voi varata aikaa.'}
            {area.jobs > 0 && ` · ${area.jobs} työtä`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" className="text-xs" onClick={() => setOpen((o) => !o)}>
            {open ? 'Sulje' : 'Muokkaa'}
          </Button>
          <DeleteArea id={area.id} name={area.name} hasJobs={area.jobs > 0} />
        </div>
      </div>
      {open && (
        <div className="border-t border-line-soft bg-ink-900/40 px-4 py-4">
          <AreaEditor area={area} calendars={calendars} onSaved={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

export function NewArea({ calendars }: { calendars: CalendarOption[] }) {
  const [open, setOpen] = useState(false);
  // Uusi lomake joka avauksella — muuten edellisen alueen tiedot jäisivät kenttiin.
  const [key, setKey] = useState(0);
  return (
    <>
      <Button type="button" onClick={() => { setKey((k) => k + 1); setOpen((o) => !o); }}>
        {open ? 'Sulje' : '+ Lisää alue'}
      </Button>
      {open && (
        <div className="col-span-full w-full">
          <AreaEditor key={key} calendars={calendars} onSaved={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

export function AreaEditor({ area, calendars, onSaved }: {
  area?: AreaData;
  calendars: CalendarOption[];
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    area ? updateArea : createArea, {});
  const [mode, setMode] = useState<'prefix' | 'distance'>(
    area && !area.center_postal ? 'prefix' : 'distance');
  const [center, setCenter] = useState(area?.center_postal ?? '');
  const [radius, setRadius] = useState(area?.radius_km ? String(Number(area.radius_km)) : '20');
  const [excluded, setExcluded] = useState<Set<string>>(new Set(area?.excluded_postals ?? []));
  const [selected, setSelected] = useState<Set<string>>(new Set(area?.calendar_ids ?? []));

  useEffect(() => { if (state.ok) onSaved?.(); }, [state, onSaved]);

  const radiusKm = Number(radius.replace(',', '.'));
  const result = useMemo(
    () => (mode === 'distance' && /^\d{5}$/.test(center) ? postalsWithin(center, radiusKm, excluded) : null),
    [mode, center, radiusKm, excluded],
  );
  const centerUnknown = mode === 'distance' && /^\d{5}$/.test(center) && !postinumero(center);

  function toggle(code: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  return (
    <form action={action} className="space-y-4">
      {area && <input type="hidden" name="id" value={area.id} />}
      <input type="hidden" name="mode" value={mode} />
      <Note state={state} />

      <Field label="Alueen nimi">
        <Input name="name" required defaultValue={area?.name}
               placeholder={mode === 'distance' ? 'Nestori — Järvenpää, Hyvinkää' : 'Pirkanmaa'} />
      </Field>

      <div>
        <span className="mb-1.5 block text-sm font-semibold text-text">Valintatapa</span>
        <div className="inline-flex rounded-lg border border-line bg-ink-800 p-1">
          {([['prefix', 'Postinumerot'], ['distance', 'Etäisyys postinumerosta']] as const).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)}
                    className={cx('rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      mode === m ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'prefix' ? (
        <Field
          label="Postinumeron etuliitteet"
          hint='Välilyönnein tai pilkuin. "33 34" kattaa kaikki 33xxx ja 34xxx. Tarkempi etuliite voittaa matkalisässä, joten yksittäisen kunnan voi hinnoitella erikseen.'
        >
          <Input name="prefixes" required defaultValue={area?.postal_prefixes.join(' ')} placeholder="33 34" />
        </Field>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Keskipostinumero"
                   hint={postinumero(center) ? `${postinumero(center)!.name}, ${postinumero(center)!.kunta}` : 'Esim. asentajan kotipostinumero'}>
              <Input name="centerPostal" required inputMode="numeric" maxLength={5} pattern="\d{5}"
                     value={center} onChange={(e) => setCenter(e.target.value.replace(/\D/g, ''))}
                     placeholder="05470" />
            </Field>
            <Field label="Säde (km)" hint="Linnuntie. Ajomatka on tyypillisesti 1,2–1,4 × tämä.">
              <Input name="radiusKm" required type="number" min={1} max={300} step={1}
                     value={radius} onChange={(e) => setRadius(e.target.value)} />
            </Field>
          </div>
          <input type="hidden" name="excluded" value={[...excluded].join(',')} />

          {centerUnknown && <ErrorNote>Postinumeroa {center} ei löydy.</ErrorNote>}
          {result && (
            <div className="space-y-2">
              <AlueKartta result={result} radiusKm={radiusKm} onToggle={toggle} />
              <p className="text-sm text-text">
                <b>{result.included.length}</b> postinumeroa · {km(radiusKm)} km
                {result.excluded.length > 0 && (
                  <span className="text-danger"> · {result.excluded.length} poissuljettu</span>
                )}
                <span className="text-faint"> · noin {result.asukkaat.toLocaleString('fi-FI')} asukasta</span>
              </p>
              <p className="text-xs text-faint">
                Klikkaa kartalla postinumeropistettä sulkeaksesi sen pois alueesta. Klikkaa uudelleen palauttaaksesi.
              </p>
              {result.excluded.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.excluded.map((code) => (
                    <button key={code} type="button" onClick={() => toggle(code)}
                            title="Palauta alueeseen"
                            className="rounded-full border border-danger/40 px-2 py-0.5 text-xs text-danger hover:bg-danger/8">
                      {code} {postinumero(code)?.name} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <Field label="Matkalisä (€)" hint="Työn hinnan päälle. 0 = ei lisää.">
          <Input name="travelFee" type="number" min={0} max={2000} step={5}
                 defaultValue={area ? area.travel_fee_cents / 100 : 0} />
        </Field>
        {area && (
          <label className="flex items-center gap-2 self-center text-sm">
            <input type="checkbox" name="active" defaultChecked={area.active}
                   className="h-4 w-4 accent-[var(--color-accent)]" />
            Käytössä
          </label>
        )}
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-semibold text-text">Kuka palvelee aluetta</span>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {calendars.map((c) => {
            const others = c.otherAreas.filter((o) => o.id !== area?.id);
            return (
              <label key={c.id}
                     className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-2 text-sm has-checked:border-accent has-checked:bg-accent/10">
                <input type="checkbox" name="calendarIds" value={c.id}
                       checked={selected.has(c.id)}
                       onChange={(e) => setSelected((prev) => {
                         const next = new Set(prev);
                         if (e.target.checked) next.add(c.id); else next.delete(c.id);
                         return next;
                       })}
                       className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
                <span className="min-w-0">
                  <span className="block">{c.label}</span>
                  {others.length > 0 && (
                    <span className="block text-xs text-faint">myös: {others.map((o) => o.name).join(', ')}</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
        {/* Saatavuus on alueiden unioni: säde ei rajaa mitään, jos sama asentaja
            on yhä laajemmassa alueessa. Tämä on helpoin tapa luulla rajanneensa. */}
        {mode === 'distance' && calendars.some((c) => selected.has(c.id) && c.otherAreas.some((o) => o.id !== area?.id)) && (
          <p className="mt-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
            Asentaja saa ajat <b>kaikista</b> alueistaan. Jos hän on myös laajemmassa alueessa (esim. Uusimaa),
            tämä säde ei rajaa hänen alueitaan — poista hänet silloin siitä alueesta.
          </p>
        )}
      </div>

      <Button type="submit" disabled={pending || (mode === 'distance' && !result)}>
        {pending ? 'Tallennetaan…' : area ? 'Tallenna' : 'Luo alue'}
      </Button>
    </form>
  );
}

export function DeleteArea({ id, name, hasJobs }: { id: string; name: string; hasJobs: boolean }) {
  return (
    <form action={deleteArea} className="inline">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost" className="px-2 py-1 text-xs" pendingLabel="…"
              title={hasJobs
                ? `${name}: alueella on töitä, joten se vain poistetaan käytöstä`
                : `Poista ${name}`}>
        {hasJobs ? 'Poista käytöstä' : 'Poista'}
      </SubmitButton>
    </form>
  );
}

'use client';

import { startTransition, useActionState, useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, Input, Textarea, cx } from '@/components/ui';
import { computePricing, EXTRAS, TYPES } from '@/lib/pricing';
import { DEFAULT_INCLUSIONS } from '@/lib/inclusions';
import {
  HAVAINNOT, KOHDE_IDS, MATERIAALIT, TALOTYYPIT, type HavaintoKey, type KartoitusData,
} from '@/lib/kartoitus-schema';
import { lookupTravelFee } from '../tarjoukset/actions';
import { saveKartoitus, type KartoitusState } from './actions';
import { KartoitusPhotos } from './photos';

/* =========================================================
   Kartoituslomake puhelimelle.

   Järjestys seuraa paperilomaketta (Kartoituslomake A4), mutta kohteiden
   määrät ovat hinnaston askeltimia: niistä syntyy tarjouksen hinta
   suoraan, eikä summaa tarvitse laskea päässä paikan päällä.

   Alapalkissa on aina summa ja kaksi nappia. Kartoittaja seisoo asiakkaan
   eteisessä — tärkein toiminto ei saa olla sivun lopussa.
   ========================================================= */

export type KartoitusInitial = Partial<KartoitusData>;

const eur = (n: number) => n.toLocaleString('fi-FI', { maximumFractionDigits: 2 }) + ' €';

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={on}
      className={cx(
        'min-h-11 rounded-xl border-[1.5px] px-3.5 py-2 text-left text-[15px] font-semibold transition-colors',
        on ? 'border-accent bg-accent text-white' : 'border-line bg-ink-800 text-text hover:border-accent/60',
      )}
    >{children}</button>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))}
        className="grid h-11 w-11 place-items-center rounded-xl border border-line text-xl font-bold text-text active:bg-ink-700" aria-label="Vähemmän">−</button>
      <input
        inputMode="numeric" value={value || ''} placeholder="0"
        onChange={(e) => onChange(Math.min(999, Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0)))}
        className="h-11 w-14 rounded-xl border border-line bg-ink-800 text-center text-lg font-bold tabular-nums text-text focus:border-accent focus:outline-none"
      />
      <button type="button" onClick={() => onChange(value + 1)}
        className="grid h-11 w-11 place-items-center rounded-xl border border-line text-xl font-bold text-text active:bg-ink-700" aria-label="Enemmän">+</button>
    </div>
  );
}

export function KartoitusForm({ id, jobId, initial, locked, photoUrls = {} }: {
  id?: string; jobId?: string; initial: KartoitusInitial; locked?: boolean;
  /** Tallennettujen kuvien allekirjoitetut osoitteet, polku → osoite. */
  photoUrls?: Record<string, string>;
}) {
  /* Uuden kartoituksen tunniste keksitään heti, jotta kuvat voi ladata
     ennen ensimmäistä tallennusta (polku kartoitus/<tunniste>/…). */
  const [draftId] = useState(() => id ?? crypto.randomUUID());
  const [state, action, pending] = useActionState<KartoitusState, FormData>(saveKartoitus, {});
  const [d, setD] = useState<KartoitusData>(() => ({
    customerKind: 'asiakas', customerName: '', email: '', postalCode: '',
    counts: {}, extras: {}, kohteet: {}, havainnot: [], alennus: 0,
    photos: {}, extraPhotos: [],
    inclusions: DEFAULT_INCLUSIONS,
    ...initial,
  } as KartoitusData));
  const set = <K extends keyof KartoitusData>(k: K, v: KartoitusData[K]) => setD((p) => ({ ...p, [k]: v }));
  const setCount = (k: string, n: number) => setD((p) => ({ ...p, counts: { ...p.counts, [k]: n } }));
  const setKohde = (k: string, f: 'materiaali' | 'huomio', v: string) =>
    setD((p) => ({ ...p, kohteet: { ...p.kohteet, [k]: { ...p.kohteet[k], [f]: v || undefined } } }));

  /* Matkalisä postinumerosta, kuten tarjouslaskurissa. */
  const [travel, setTravel] = useState<{ cents: number; area: string | null }>({ cents: 0, area: null });
  useEffect(() => {
    if (!/^\d{5}$/.test(d.postalCode)) { setTravel({ cents: 0, area: null }); return; }
    let alive = true;
    lookupTravelFee(d.postalCode).then((r) => alive && setTravel(r)).catch(() => {});
    return () => { alive = false; };
  }, [d.postalCode]);

  const pricing = useMemo(() => computePricing(d.counts, d.extras, {
    travelFee: travel.cents / 100, discount: d.alennus, discountLabel: 'Kartoitusalennus',
  }), [d.counts, d.extras, d.alennus, travel.cents]);
  const autoHours = Math.round((pricing.minutes / 60) * 2) / 2;


  const toggleHavainto = (h: HavaintoKey) =>
    set('havainnot', d.havainnot.includes(h) ? d.havainnot.filter((x) => x !== h) : [...d.havainnot, h]);
  const toggleInclusion = (i: string) =>
    set('inclusions', d.inclusions.includes(i) ? d.inclusions.filter((x) => x !== i) : [...d.inclusions, i]);
  const allInclusions = useMemo(() => [...new Set([...DEFAULT_INCLUSIONS, ...d.inclusions])], [d.inclusions]);

  const types = TYPES.filter((t) => (KOHDE_IDS as readonly string[]).includes(t.id));
  const qtyExtras = EXTRAS.filter((e) => e.per === 'kpl');
  const boolExtras = EXTRAS.filter((e) => e.per !== 'kpl');

  const sec = 'space-y-4 px-4 py-4';
  const lbl = 'mb-1.5 block text-sm font-semibold text-text';

  return (
    /* onSubmit eikä <form action>: action-lomake tyhjennetään Reactissa
       jokaisen kutsun jälkeen, jolloin "Tallenna" näytti tyhjentävän kentät
       vaikka tiedot olivat tallessa. Painettu nappi (mode) tulee submitterista. */
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => action(fd));
      }}
      className="space-y-4 pb-36"
    >
      <input type="hidden" name="payload" value={JSON.stringify(d)} />
      {id && <input type="hidden" name="id" value={id} />}
      {jobId && <input type="hidden" name="jobId" value={jobId} />}
      {!id && <input type="hidden" name="draftId" value={draftId} />}

      <fieldset disabled={locked} className="space-y-4">
      {/* ---------- asiakas ---------- */}
      <Card>
        <CardHeader title="Asiakas" />
        <div className={sec}>
          <div className="flex gap-2">
            <Chip on={d.customerKind === 'asiakas'} onClick={() => set('customerKind', 'asiakas')}>Yksityinen</Chip>
            <Chip on={d.customerKind === 'taloyhtio'} onClick={() => set('customerKind', 'taloyhtio')}>Taloyhtiö</Chip>
          </div>
          <label className="block"><span className={lbl}>{d.customerKind === 'taloyhtio' ? 'Taloyhtiö' : 'Nimi'}</span>
            <Input value={d.customerName} onChange={(e) => set('customerName', e.target.value)} autoComplete="off" /></label>
          {d.customerKind === 'taloyhtio' && (
            <label className="block"><span className={lbl}>Yhteyshenkilö (isännöitsijä / pj)</span>
              <Input value={d.contactName ?? ''} onChange={(e) => set('contactName', e.target.value)} /></label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className={lbl}>Puhelin</span>
              <Input type="tel" value={d.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></label>
            <label className="block"><span className={lbl}>Sähköposti</span>
              <Input type="email" inputMode="email" value={d.email} onChange={(e) => set('email', e.target.value)} /></label>
          </div>
          <label className="block"><span className={lbl}>Osoite</span>
            <Input value={d.address ?? ''} onChange={(e) => set('address', e.target.value)} /></label>
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <label className="block"><span className={lbl}>Postinro</span>
              <Input inputMode="numeric" maxLength={5} value={d.postalCode} onChange={(e) => set('postalCode', e.target.value.replace(/\D/g, ''))} /></label>
            <label className="block"><span className={lbl}>Kaupunki</span>
              <Input value={d.city ?? ''} onChange={(e) => set('city', e.target.value)} /></label>
          </div>
        </div>
      </Card>

      {/* ---------- kohde ---------- */}
      <Card>
        <CardHeader title="Kohde" />
        <div className={sec}>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TALOTYYPIT).map(([k, v]) => (
              <Chip key={k} on={d.talotyyppi === k} onClick={() => set('talotyyppi', d.talotyyppi === k ? undefined : k as KartoitusData['talotyyppi'])}>{v}</Chip>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className={lbl}>Rak. vuosi</span>
              <Input inputMode="numeric" value={d.rakennusvuosi ?? ''} onChange={(e) => set('rakennusvuosi', e.target.value)} /></label>
            <label className="block"><span className={lbl}>Kerroksia</span>
              <Input inputMode="numeric" value={d.kerroksia ?? ''} onChange={(e) => set('kerroksia', e.target.value)} /></label>
            <label className="block"><span className={lbl}>Huoneistoja</span>
              <Input inputMode="numeric" value={d.huoneistoja ?? ''} onChange={(e) => set('huoneistoja', e.target.value)} /></label>
          </div>
        </div>
      </Card>

      {/* ---------- kohteet ---------- */}
      <Card>
        <CardHeader title="Kohteet" action={<span className="text-xs text-faint">määrä · materiaali · huomio</span>} />
        <div className="divide-y divide-line-soft">
          {types.map((t) => {
            const n = d.counts[t.id] ?? 0;
            return (
              <div key={t.id} className="space-y-2.5 px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-bold text-text">{t.name}</div>
                    <div className="text-xs text-faint">{t.tiers ? `${t.tiers[t.tiers.length - 1].price}–${t.price} €` : `${t.price} €`} / kpl</div>
                  </div>
                  <Stepper value={n} onChange={(v) => setCount(t.id, v)} />
                </div>
                {n > 0 && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {MATERIAALIT.map((m) => (
                        <button key={m} type="button"
                          onClick={() => setKohde(t.id, 'materiaali', d.kohteet[t.id]?.materiaali === m ? '' : m)}
                          className={cx('rounded-full border px-3 py-1.5 text-[13px] font-semibold',
                            d.kohteet[t.id]?.materiaali === m ? 'border-accent bg-accent-dim text-accent' : 'border-line text-muted')}>
                          {m}
                        </button>
                      ))}
                    </div>
                    <Input placeholder="Huomio (esim. keittiön ikkuna vuotaa alakarmista)" value={d.kohteet[t.id]?.huomio ?? ''}
                      onChange={(e) => setKohde(t.id, 'huomio', e.target.value)} />
                  </>
                )}
                {t.id === 'ikkuna' && n > 0 && (
                  <div className="rounded-xl bg-ink-700 p-3">
                    <div className="mb-2 text-sm font-semibold text-text">Puitteita ikkunassa</div>
                    <div className="flex gap-2">
                      <Chip on={d.ikkunaPuitteet === '2'} onClick={() => set('ikkunaPuitteet', '2')}>2 puitetta</Chip>
                      <Chip on={d.ikkunaPuitteet === '3'} onClick={() => set('ikkunaPuitteet', '3')}>3 puitetta</Chip>
                    </div>
                    <p className="mt-2 text-xs text-faint">Hintaan kuuluvat sisäpuitteen ja sisäkarmin tiivisteet. Ulkopuite +20 € / ikkuna (Lisätyöt). Kolmas puite hinnoitellaan erikseen: kirjaa se Lisätiedot-kenttään.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ---------- lisätyöt ---------- */}
      <Card>
        <CardHeader title="Lisätyöt" />
        <div className="divide-y divide-line-soft">
          {qtyExtras.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="text-[15px] font-semibold text-text">{e.name}</div>
                <div className="text-xs text-faint">+{e.price} € / {e.unit}{e.note ? ` ${e.note}` : ''}</div>
              </div>
              <Stepper value={d.counts[`extra_${e.id}`] ?? 0} onChange={(v) => setCount(`extra_${e.id}`, v)} />
            </div>
          ))}
          {boolExtras.map((e) => (
            <label key={e.id} className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="text-[15px] font-semibold text-text">{e.name}</div>
                <div className="text-xs text-faint">+{e.price} € / {e.unit}</div>
              </div>
              <input type="checkbox" className="h-6 w-6 accent-[#217A4E]" checked={!!d.extras[e.id]}
                onChange={(ev) => set('extras', { ...d.extras, [e.id]: ev.target.checked })} />
            </label>
          ))}
        </div>
      </Card>

      {/* ---------- havainnot ---------- */}
      <Card>
        <CardHeader title="Havainnot" />
        <div className="flex flex-wrap gap-2 px-4 py-4">
          {(Object.entries(HAVAINNOT) as [HavaintoKey, string][]).map(([k, v]) => (
            <Chip key={k} on={d.havainnot.includes(k)} onClick={() => toggleHavainto(k)}>{v}</Chip>
          ))}
        </div>
      </Card>

      {/* ---------- kuvat ---------- */}
      <KartoitusPhotos
        kid={draftId}
        saved={!!id}
        value={{ photos: d.photos ?? {}, extraPhotos: d.extraPhotos ?? [] }}
        onChange={(update) => setD((p) => ({ ...p, ...update({ photos: p.photos ?? {}, extraPhotos: p.extraPhotos ?? [] }) }))}
        urls={photoUrls}
        disabled={locked}
      />

      {/* ---------- työhön kuuluu ---------- */}
      <Card>
        <CardHeader title="Työhön kuuluu" action={<span className="text-xs text-faint">näkyy tarjouksessa</span>} />
        <div className="divide-y divide-line-soft">
          {allInclusions.map((i) => (
            <label key={i} className="flex cursor-pointer items-start gap-3 px-4 py-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#217A4E]" checked={d.inclusions.includes(i)} onChange={() => toggleInclusion(i)} />
              <span className={d.inclusions.includes(i) ? 'text-text' : 'text-faint line-through'}>{i}</span>
            </label>
          ))}
        </div>
      </Card>

      {/* ---------- hinta ja aika ---------- */}
      <Card>
        <CardHeader title="Hinta-arvio ja aika" />
        <div className={sec}>
          <ul className="space-y-1 text-sm">
            {pricing.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-muted">{l.qty > 1 ? `${l.qty}× ` : ''}{l.name}</span>
                <span className="tabular-nums font-semibold text-text">{eur(l.sum)}</span>
              </li>
            ))}
            {pricing.lines.length === 0 && <li className="text-faint">Lisää kohteet yllä.</li>}
          </ul>
          {travel.area && <p className="text-xs text-faint">Alue: {travel.area}</p>}
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={lbl}>Alennus €</span>
              <Input inputMode="decimal" value={d.alennus || ''} placeholder="0"
                onChange={(e) => set('alennus', Math.max(0, Number(e.target.value.replace(',', '.')) || 0))} /></label>
            <label className="block"><span className={lbl}>Arvioitu kesto h</span>
              <Input inputMode="decimal" value={d.kestoH ?? ''} placeholder={autoHours ? String(autoHours).replace('.', ',') : ''}
                onChange={(e) => set('kestoH', e.target.value)} /></label>
          </div>
          <label className="block"><span className={lbl}>Ehdotettu aika</span>
            <Input value={d.ehdotettuAika ?? ''} placeholder="esim. ti 28.10. klo 9" onChange={(e) => set('ehdotettuAika', e.target.value)} /></label>
        </div>
      </Card>

      <Card>
        <CardHeader title="Lisätiedot" />
        <div className={sec}>
          <label className="block"><span className={lbl}>Asiakkaalle (näkyy tarjouksessa)</span>
            <Textarea rows={3} value={d.lisatiedot ?? ''} onChange={(e) => set('lisatiedot', e.target.value)} /></label>
          <label className="block"><span className={lbl}>Sisäinen muistiinpano (vain toimisto)</span>
            <Textarea rows={2} value={d.sisainen ?? ''} onChange={(e) => set('sisainen', e.target.value)} /></label>
        </div>
      </Card>
      </fieldset>

      {/* ---------- alapalkki ---------- */}
      {!locked && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto max-w-3xl">
            {(state.error || state.ok) && (
              <p className={cx('mb-2 text-sm font-semibold', state.error ? 'text-danger' : 'text-accent')}>{state.error ?? state.ok}</p>
            )}
            <div className="flex items-center gap-2">
              <div className="mr-auto">
                <div className="text-[11px] font-semibold text-faint uppercase">Yhteensä</div>
                <div className="text-xl font-extrabold tabular-nums text-text">{eur(pricing.total)}</div>
              </div>
              <button type="submit" name="mode" value="save" disabled={pending}
                className="rounded-xl border border-line bg-white px-4 py-3 text-sm font-bold text-text disabled:opacity-50">Tallenna</button>
              <button type="submit" name="mode" value="send" disabled={pending || pricing.total <= 0 || !d.email}
                className="rounded-xl bg-accent px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50">
                {pending ? 'Lähetetään…' : id ? 'Lähetä tarjous' : 'Lähetä tarjous'}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button, Card, CardHeader, ErrorNote, Field, Input, OkNote, Textarea, cx } from '@/components/ui';
import { SubmitButton } from '@/components/submit';
import { TYPES, EXTRAS, computePricing } from '@/lib/pricing';
import { sendProspectOffer, lookupTravelFee, type ActionState } from '../actions';

const eur = (n: number) => n.toLocaleString('fi-FI', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';

function Stepper({ value, onChange, name }: { value: number; onChange: (v: number) => void; name: string }) {
  const set = (v: number) => onChange(Math.max(0, v));
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => set(value - 1)}
        className="h-8 w-8 shrink-0 rounded-lg border border-line text-muted hover:text-text disabled:opacity-40"
        disabled={value <= 0} aria-label="Vähennä">−</button>
      <input name={name} type="number" min={0} value={value}
        onChange={(e) => set(parseInt(e.target.value, 10) || 0)}
        className="tabular h-8 w-14 rounded-lg border border-line bg-ink-800 text-center text-sm text-text focus:border-accent focus:outline-none" />
      <button type="button" onClick={() => set(value + 1)}
        className="h-8 w-8 shrink-0 rounded-lg border border-line text-muted hover:text-text" aria-label="Lisää">+</button>
    </div>
  );
}

export function OfferBuilder() {
  const [state, action] = useActionState<ActionState, FormData>(sendProspectOffer, {});

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [extras, setExtras] = useState<Record<string, boolean>>({});
  const [kahva, setKahva] = useState(0);
  const [postal, setPostal] = useState('');
  const [travel, setTravel] = useState<{ cents: number; area: string | null }>({ cents: 0, area: null });

  // Matkalisä alueesta, kun postinumero on täydellinen.
  useEffect(() => {
    if (!/^\d{5}$/.test(postal)) { setTravel({ cents: 0, area: null }); return; }
    let live = true;
    lookupTravelFee(postal).then((r) => { if (live) setTravel(r); });
    return () => { live = false; };
  }, [postal]);

  const countsForCalc = { ...counts, extra_kahva: kahva };
  const pricing = computePricing(countsForCalc, extras, { travelFee: travel.cents / 100 });

  const setCount = (id: string, v: number) => setCounts((c) => ({ ...c, [id]: v }));

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
      {/* Vasen: asiakas + palvelut */}
      <div className="space-y-6">
        <Card>
          <CardHeader title="Asiakas" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Nimi"><Input name="customerName" required placeholder="Etunimi Sukunimi" /></Field>
            <Field label="Sähköposti"><Input name="email" type="email" required placeholder="asiakas@example.com" /></Field>
            <Field label="Puhelin"><Input name="phone" type="tel" placeholder="040 123 4567" /></Field>
            <Field label="Osoite"><Input name="address" placeholder="Katu 1" /></Field>
            <Field label="Postinumero" hint={travel.area ? `Alue: ${travel.area}${travel.cents ? ` · matkalisä ${eur(travel.cents / 100)}` : ' · ei matkalisää'}` : undefined}>
              <Input name="postalCode" inputMode="numeric" maxLength={5} value={postal}
                onChange={(e) => setPostal(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="04400" />
            </Field>
            <Field label="Kaupunki"><Input name="city" placeholder="Järvenpää" /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Palvelut" action={<span className="text-xs text-faint">{pricing.count} kohdetta</span>} />
          <div className="divide-y divide-line">
            {TYPES.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text">{t.name}</div>
                  <div className="text-xs text-faint">{t.desc} · {t.tiers ? `alk. ${eur(t.tiers[t.tiers.length - 1].price)}/kpl` : `${eur(t.price)}/kpl`}{t.combo ? ` (${eur(t.combo)} yhdistettynä)` : ''}</div>
                </div>
                <Stepper name={`qty_${t.id}`} value={counts[t.id] ?? 0} onChange={(v) => setCount(t.id, v)} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Lisätyöt" />
          <div className="divide-y divide-line">
            {EXTRAS.filter((e) => e.per !== 'kpl').map((e) => (
              <label key={e.id} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text">{e.name}</div>
                  <div className="text-xs text-faint">{eur(e.price)} / {e.unit}</div>
                </div>
                <input type="checkbox" name={`extra_${e.id}`} checked={!!extras[e.id]}
                  onChange={(ev) => setExtras((x) => ({ ...x, [e.id]: ev.target.checked }))}
                  className="h-5 w-5 accent-accent" />
              </label>
            ))}
            {EXTRAS.filter((e) => e.per === 'kpl').map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text">{e.name}</div>
                  <div className="text-xs text-faint">{eur(e.price)} / {e.unit}{e.note ? ` ${e.note}` : ''}</div>
                </div>
                <Stepper name={`qty_extra_${e.id}`} value={kahva} onChange={setKahva} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Lisätiedot" />
          <div className="p-4">
            <Field label="Sisäinen muistiinpano" hint="Vapaaehtoinen — tallentuu tarjoukselle, ei näy asiakkaalle.">
              <Textarea name="notes" rows={3} placeholder="Esim. sovittu alennus, erityistoiveet…" />
            </Field>
          </div>
        </Card>
      </div>

      {/* Oikea: yhteenveto (sticky) */}
      <Card className="lg:sticky lg:top-6">
        <CardHeader title="Tarjous" />
        <div className="space-y-3 p-4">
          {pricing.lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Valitse palveluita nähdäksesi hinnan.</p>
          ) : (
            <div className="space-y-1.5">
              {pricing.lines.map((l) => (
                <div key={l.kind + l.id} className="flex justify-between gap-3 text-sm">
                  <span className="text-muted">{l.qty > 1 ? `${l.qty}× ` : ''}{l.name}</span>
                  <span className="tabular whitespace-nowrap text-text">{eur(l.sum)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
            <span className="text-text">Yhteensä</span>
            <span className="tabular text-accent">{eur(pricing.total)}</span>
          </div>
          <p className="text-xs text-faint">Sis. ALV 25,5 %. Työn osuus eritellään PDF:ssä kotitalousvähennystä varten. Voimassa 14 pv.</p>

          <SubmitButton className="w-full" pendingLabel="Lähetetään…" disabled={pricing.total <= 0}>
            Lähetä tarjous sähköpostilla
          </SubmitButton>
          {state.error && <ErrorNote>{state.error}</ErrorNote>}
          {state.ok && <OkNote>{state.ok}</OkNote>}
        </div>
      </Card>
    </form>
  );
}

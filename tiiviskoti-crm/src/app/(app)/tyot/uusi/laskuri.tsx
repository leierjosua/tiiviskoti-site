'use client';

import { useMemo, useState } from 'react';
import { TYPES, EXTRAS, computePricing, type CustomLine } from '@/lib/pricing';

/* =========================================================
   Tilatut tuotteet uuden työn lomakkeella.

   MIKSI TÄMÄ ON OLEMASSA: ilman rivejä työn hinta oli nolla, ja
   varausvahvistuksessa luki asiakkaalle "0,00 €". Puhelimessa sovittu
   keikka tarvitsee saman hinnan kuin verkkovaraus — muuten kuitti,
   liikevaihto ja vahvistus perustuvat eri lukuun kuin mistä sovittiin.

   HINTA LASKETAAN PALVELIMELLA UUDESTAAN. Tästä lähtee vain se mitä
   valittiin (kappalemäärät, lisät, vapaat rivit), ei summaa. Selaimen
   lähettämä hinta olisi asiakkaan muokattavissa.

   Sama hinnasto kuin tarjouslaskurissa ja sivuston varauksessa, joten
   ikkunan määräporras ja 149 €:n minimi pätevät automaattisesti.
   ========================================================= */

const eur = (v: number) =>
  v.toLocaleString('fi-FI', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';

export function TilatutTuotteet({ suositeltuKesto }: { suositeltuKesto?: (min: number) => void }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [extras, setExtras] = useState<Record<string, boolean>>({});
  const [kahva, setKahva] = useState(0);
  const [custom, setCustom] = useState<CustomLine[]>([]);
  const [auki, setAuki] = useState(false);

  const pricing = useMemo(
    () => computePricing({ ...counts, extra_kahva: kahva }, extras, { custom }),
    [counts, extras, kahva, custom],
  );

  const valittu = pricing.count > 0 || custom.some((c) => c.name.trim() && c.unit > 0);

  /* Palvelin saa valinnat, ei summaa. Tyhjä kenttä = ei rivejä, jolloin
     työ syntyy kuten ennenkin ilman hintaa. */
  const arvo = valittu
    ? JSON.stringify({
        counts: { ...counts, ...(kahva > 0 ? { extra_kahva: kahva } : {}) },
        extras,
        custom: custom.filter((c) => c.name.trim() && c.unit > 0),
      })
    : '';

  const setCount = (id: string, n: number) =>
    setCounts((c) => ({ ...c, [id]: Math.max(0, n) }));

  return (
    <div className="rounded-md border border-line bg-ink-800">
      <input type="hidden" name="tuotteet" value={arvo} />

      <button
        type="button"
        onClick={() => setAuki((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-text">
          Tilatut tuotteet
          <span className="ml-2 text-xs font-normal text-muted">
            {valittu ? `${pricing.count} kpl · ${eur(pricing.total)}` : 'ei valintoja — hinta jää nollaan'}
          </span>
        </span>
        <span className="text-xs text-muted">{auki ? 'Piilota' : 'Avaa'}</span>
      </button>

      {auki && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          <div className="space-y-2">
            {TYPES.map((t) => (
              <div key={t.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-sm">
                  <span className="text-text">{t.name}</span>
                  <span className="ml-2 text-xs text-faint">
                    {t.tiers ? 'määräporras' : `${t.price} €`}
                  </span>
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setCount(t.id, (counts[t.id] ?? 0) - 1)}
                          className="size-7 rounded border border-line text-muted hover:text-text">−</button>
                  <input
                    type="number" min={0} max={999} value={counts[t.id] ?? 0}
                    onChange={(e) => setCount(t.id, parseInt(e.target.value, 10) || 0)}
                    className="w-14 rounded border border-line bg-ink-900 px-2 py-1 text-center text-sm tabular"
                  />
                  <button type="button" onClick={() => setCount(t.id, (counts[t.id] ?? 0) + 1)}
                          className="size-7 rounded border border-line text-muted hover:text-text">+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-line-soft pt-3">
            {EXTRAS.map((e) => (
              e.id === 'kahva' ? (
                <div key={e.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 text-sm text-text">
                    {e.name} <span className="text-xs text-faint">{e.price} €/kpl</span>
                  </span>
                  <input
                    type="number" min={0} max={99} value={kahva}
                    onChange={(ev) => setKahva(Math.max(0, parseInt(ev.target.value, 10) || 0))}
                    className="w-14 rounded border border-line bg-ink-900 px-2 py-1 text-center text-sm tabular"
                  />
                </div>
              ) : (
                <label key={e.id} className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox" checked={!!extras[e.id]}
                    onChange={(ev) => setExtras((x) => ({ ...x, [e.id]: ev.target.checked }))}
                    className="size-4 accent-accent"
                  />
                  <span className="text-text">{e.name}</span>
                  <span className="text-xs text-faint">{e.price} €/{e.unit ?? 'kpl'}</span>
                </label>
              )
            ))}
          </div>

          <div className="space-y-2 border-t border-line-soft pt-3">
            {custom.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input
                  placeholder="Muu sovittu" value={c.name}
                  onChange={(e) => setCustom((l) => l.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  className="min-w-0 flex-1 rounded border border-line bg-ink-900 px-2 py-1 text-sm"
                />
                <input
                  type="number" min={1} value={c.qty} title="kpl"
                  onChange={(e) => setCustom((l) => l.map((x, j) => j === i ? { ...x, qty: Math.max(1, parseInt(e.target.value, 10) || 1) } : x))}
                  className="w-14 rounded border border-line bg-ink-900 px-2 py-1 text-center text-sm tabular"
                />
                <input
                  type="number" min={0} step="0.01" value={c.unit} title="€/kpl"
                  onChange={(e) => setCustom((l) => l.map((x, j) => j === i ? { ...x, unit: Math.max(0, Number(e.target.value) || 0) } : x))}
                  className="w-20 rounded border border-line bg-ink-900 px-2 py-1 text-center text-sm tabular"
                />
                <button type="button" onClick={() => setCustom((l) => l.filter((_, j) => j !== i))}
                        className="px-2 text-muted hover:text-red-400">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setCustom((l) => [...l, { name: '', qty: 1, unit: 0 }])}
                    className="text-xs text-accent hover:underline">+ Vapaa rivi</button>
          </div>

          {valittu && (
            <div className="space-y-1 border-t border-line pt-3 text-sm">
              {pricing.lines.map((l) => (
                <div key={l.kind + l.id} className="flex justify-between gap-3">
                  <span className="min-w-0 text-muted">
                    {l.qty > 1 ? `${l.qty}× ` : ''}{l.name}
                  </span>
                  <span className="shrink-0 tabular">{eur(l.sum)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-line-soft pt-2 font-semibold">
                <span>Yhteensä</span>
                <span className="tabular text-accent">{eur(pricing.total)}</span>
              </div>
              {/* Hinnaston työaika-arvio. Kesto valitaan yhä itse, koska
                  vapaat rivit eivät kerro mitään ajasta. */}
              <p className="pt-1 text-xs text-faint">
                Työaika-arvio {pricing.minutes} min
                {suositeltuKesto && pricing.minutes > 0 && (
                  <button type="button" onClick={() => suositeltuKesto(pricing.minutes)}
                          className="ml-2 text-accent hover:underline">käytä kestona</button>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

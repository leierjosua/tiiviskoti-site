'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button, Card, CardHeader, ErrorNote, Field, Input, OkNote, Textarea, cx } from '@/components/ui';
import { SubmitButton } from '@/components/submit';
import { TYPES, EXTRAS, computePricing, type CustomLine } from '@/lib/pricing';
import { DEFAULT_INCLUSIONS, MAX_INCLUSIONS, MAX_INCLUSION_LEN } from '@/lib/inclusions';
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

const MAX_CUSTOM_LINES = 12;

/* Sama laskuri palvelee molempia tarjoustyyppejä. Ero on siinä mitä
   asiakaskortissa kysytään ja miten tyhjä rivi sanoitetaan — hinnasto,
   lisätyöt ja summan laskenta ovat identtiset, koska taloyhtiö ostaa saman
   työn isompana eränä (ikkunan määräporras hoitaa alennuksen itsestään). */
/** Laskurin tila jonka luonnos säilöö, jotta työn voi jatkaa myöhemmin. */
export type DraftState = {
  counts?: Record<string, number>;
  extras?: Record<string, boolean>;
  custom?: CustomLine[];
  kahva?: number;
  postal?: string;
  discount?: number;
  discountLabel?: string;
  inclusions?: string[];
  asiakas?: Record<string, string>;
};

export function OfferBuilder({ kind = 'asiakas', offerId, draft, asiakas }: {
  kind?: 'asiakas' | 'taloyhtio';
  /** Avatun luonnoksen tunniste — tallennus päivittää sen uuden luomisen sijaan. */
  offerId?: string;
  draft?: DraftState;
  /* Asiakaskentät tulevat tarjouksen omilta sarakkeilta, ei draft_statesta:
     ne tallentuvat sinne joka tapauksessa, eikä samaa tietoa kannata
     säilöä kahteen paikkaan jossa ne voivat erota toisistaan. */
  asiakas?: {
    customerName?: string; contactName?: string; email?: string; phone?: string;
    address?: string; city?: string; notes?: string; customerNote?: string;
  };
}) {
  const talo = kind === 'taloyhtio';
  const [state, action] = useActionState<ActionState, FormData>(sendProspectOffer, {});
  const [custom, setCustom] = useState<CustomLine[]>(
    draft?.custom?.length ? draft.custom : [{ name: '', qty: 1, unit: 0 }],
  );
  /* Vakiolista tarjouksen mukana: nämä kuuluvat jokaiseen tiivistykseen,
     mutta rivejä voi muokata, poistaa ja lisätä — jokainen kohde on vähän
     erilainen, ja tarjoukseen kirjoitettu lupaus on juuri se mitä
     kohteessa tehdään. */
  const [inclusions, setInclusions] = useState<string[]>(draft?.inclusions ?? [...DEFAULT_INCLUSIONS]);

  const [counts, setCounts] = useState<Record<string, number>>(draft?.counts ?? {});
  const [extras, setExtras] = useState<Record<string, boolean>>(draft?.extras ?? {});
  const [kahva, setKahva] = useState(draft?.kahva ?? 0);
  const [postal, setPostal] = useState(draft?.postal ?? '');
  const [travel, setTravel] = useState<{ cents: number; area: string | null }>({ cents: 0, area: null });
  const [discount, setDiscount] = useState(draft?.discount ?? 0);
  const [discountLabel, setDiscountLabel] = useState(draft?.discountLabel ?? '');

  // Matkalisä alueesta, kun postinumero on täydellinen.
  useEffect(() => {
    if (!/^\d{5}$/.test(postal)) { setTravel({ cents: 0, area: null }); return; }
    let live = true;
    lookupTravelFee(postal).then((r) => { if (live) setTravel(r); });
    return () => { live = false; };
  }, [postal]);

  const countsForCalc = { ...counts, extra_kahva: kahva };
  const pricing = computePricing(countsForCalc, extras, {
    travelFee: travel.cents / 100,
    discount,
    discountLabel,
    custom,
  });

  const setCustomAt = (i: number, patch: Partial<CustomLine>) =>
    setCustom((rows) => rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  const setCount = (id: string, v: number) => setCounts((c) => ({ ...c, [id]: v }));

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
      <input type="hidden" name="kind" value={kind} />
      {offerId ? <input type="hidden" name="offerId" value={offerId} /> : null}
      {/* Laskurin tila kulkee mukana lomakkeella, jotta luonnos aukeaa
          samanlaisena. Lasketut rivit eivät riitä: niistä ei näe mitkä
          kohteet oli valittu. */}
      <input type="hidden" name="draftState" value={JSON.stringify({
        counts, extras, custom, kahva, postal, discount, discountLabel, inclusions,
      })} />

      {/* Vasen: asiakas + palvelut */}
      <div className="space-y-6">
        <Card>
          <CardHeader title={talo ? 'Taloyhtiö' : 'Asiakas'} />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label={talo ? 'Taloyhtiön nimi' : 'Nimi'}>
              <Input name="customerName" defaultValue={asiakas?.customerName} required placeholder={talo ? 'As Oy Esimerkkitie 5' : 'Etunimi Sukunimi'} />
            </Field>
            {talo && (
              <Field label="Yhteyshenkilö" hint="Isännöitsijä tai hallituksen puheenjohtaja — tarjous lähetetään hänelle.">
                <Input name="contactName" defaultValue={asiakas?.contactName} placeholder="Etunimi Sukunimi" />
              </Field>
            )}
            <Field label="Sähköposti"><Input name="email" defaultValue={asiakas?.email} type="email" required placeholder={talo ? 'isannoitsija@example.com' : 'asiakas@example.com'} /></Field>
            <Field label="Puhelin"><Input name="phone" defaultValue={asiakas?.phone} type="tel" placeholder="040 123 4567" /></Field>
            <Field label={talo ? 'Kiinteistön osoite' : 'Osoite'}><Input name="address" defaultValue={asiakas?.address} placeholder="Katu 1" /></Field>
            <Field label="Postinumero" hint={travel.area ? `Alue: ${travel.area}${travel.cents ? ` · matkalisä ${eur(travel.cents / 100)}` : ' · ei matkalisää'}` : undefined}>
              <Input name="postalCode" inputMode="numeric" maxLength={5} value={postal}
                onChange={(e) => setPostal(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="04400" />
            </Field>
            <Field label="Kaupunki"><Input name="city" defaultValue={asiakas?.city} placeholder="Järvenpää" /></Field>
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
          <CardHeader
            title="Vapaat rivit"
            action={<span className="text-xs text-faint">Mitä katalogista ei löydy</span>}
          />
          <div className="divide-y divide-line">
            {custom.map((row, i) => {
              const sum = (Number(row.unit) || 0) * Math.max(0, row.qty || 0);
              return (
                <div key={i} className="grid gap-3 p-4 sm:grid-cols-[1fr_84px_110px_auto] sm:items-end">
                  {/* Otsikot vain ensimmäisellä rivillä, mutta jokaisella
                      kentällä on aria-label — muuten ruudunlukija lukisi
                      pelkkiä nimettömiä numerokenttiä. */}
                  <div>
                    {i === 0 && <span className="mb-1.5 block text-sm font-semibold text-text">Kuvaus</span>}
                    <Input
                      name={`custom_name_${i}`} value={row.name} maxLength={120} aria-label={`Rivin ${i + 1} kuvaus`}
                      onChange={(e) => setCustomAt(i, { name: e.target.value })}
                      placeholder={talo ? 'Esim. Rappukäytävän ulko-ovet, 3 rappua' : 'Esim. Erikoismittainen parvekeovi'} />
                  </div>
                  <div>
                    {i === 0 && <span className="mb-1.5 block text-sm font-semibold text-text">Kpl</span>}
                    <Input
                      name={`custom_qty_${i}`} type="number" min={0} step="1" value={row.qty || ''} aria-label={`Rivin ${i + 1} kappalemäärä`}
                      onChange={(e) => setCustomAt(i, { qty: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      className="tabular text-center" placeholder="1" />
                  </div>
                  <div>
                    {i === 0 && <span className="mb-1.5 block text-sm font-semibold text-text">à-hinta (€)</span>}
                    <Input
                      name={`custom_unit_${i}`} type="number" step="0.01" value={row.unit || ''} aria-label={`Rivin ${i + 1} yksikköhinta euroina`}
                      onChange={(e) => setCustomAt(i, { unit: Number(e.target.value.replace(',', '.')) || 0 })}
                      className="tabular text-right" placeholder="0" />
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end sm:pb-2">
                    <span className="tabular text-sm font-semibold text-text sm:min-w-[76px] sm:text-right">
                      {sum ? eur(sum) : '—'}
                    </span>
                    <button
                      type="button" aria-label="Poista rivi"
                      onClick={() => setCustom((r) => (r.length > 1 ? r.filter((_, n) => n !== i) : [{ name: '', qty: 1, unit: 0 }]))}
                      className="h-8 w-8 shrink-0 rounded-lg border border-line text-muted hover:text-danger">×</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-line p-3">
            <Button
              type="button" variant="outline" className="text-xs"
              disabled={custom.length >= MAX_CUSTOM_LINES}
              onClick={() => setCustom((r) => [...r, { name: '', qty: 1, unit: 0 }])}>
              + Lisää rivi
            </Button>
            {custom.length >= MAX_CUSTOM_LINES && (
              <span className="ml-3 text-xs text-faint">Enintään {MAX_CUSTOM_LINES} vapaata riviä.</span>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Alennus" action={discount > 0 ? <span className="text-xs font-semibold text-accent">−{eur(discount)}</span> : undefined} />
          <div className="grid gap-4 p-4 sm:grid-cols-[160px_1fr]">
            <Field label="Alennus (€)" hint="Vähennetään loppusummasta.">
              <Input name="discount" type="number" min={0} step="1" value={discount || ''}
                onChange={(e) => setDiscount(Math.max(0, parseInt(e.target.value, 10) || 0))} placeholder="0" />
            </Field>
            <Field label="Alennuksen nimi" hint="Näkyy asiakkaalle rivinä (esim. Kanta-asiakasalennus).">
              <Input name="discountLabel" value={discountLabel}
                onChange={(e) => setDiscountLabel(e.target.value)} placeholder="Alennus" />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Työhön sisältyy"
            action={
              <button
                type="button"
                onClick={() => setInclusions([...DEFAULT_INCLUSIONS])}
                className="text-xs text-muted hover:text-text"
              >
                Palauta oletukset
              </button>
            }
          />
          <div className="p-4">
            <p className="mb-3 text-xs text-faint">
              NÄKYY ASIAKKAALLE — tulee tarjouksen PDF:ään ja sähköpostiin summan alle.
              Muokkaa, poista tai lisää rivejä tämän kohteen mukaan.
            </p>
            <div className="space-y-2">
              {inclusions.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span aria-hidden className="text-accent">•</span>
                  <Input
                    name={`inclusion_${i}`} value={row} maxLength={MAX_INCLUSION_LEN}
                    aria-label={`Sisältyy-rivi ${i + 1}`}
                    onChange={(e) => setInclusions((r) => r.map((v, n) => (n === i ? e.target.value : v)))}
                    placeholder="Esim. Vanhojen tiivisteiden poisto ja pintojen puhdistus" />
                  <button
                    type="button" aria-label={`Poista sisältyy-rivi ${i + 1}`}
                    onClick={() => setInclusions((r) => r.filter((_, n) => n !== i))}
                    className="h-8 w-8 shrink-0 rounded-lg border border-line text-muted hover:text-danger">×</button>
                </div>
              ))}
              {inclusions.length === 0 && (
                <p className="text-sm text-muted">Osio jätetään pois tarjouksesta.</p>
              )}
            </div>
            <div className="mt-3">
              <Button
                type="button" variant="outline" className="text-xs"
                disabled={inclusions.length >= MAX_INCLUSIONS}
                onClick={() => setInclusions((r) => [...r, ''])}>
                + Lisää rivi
              </Button>
              {inclusions.length >= MAX_INCLUSIONS && (
                <span className="ml-3 text-xs text-faint">Enintään {MAX_INCLUSIONS} riviä.</span>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Lisätiedot" />
          <div className="p-4">
            <Field
              label="Vapaa sana asiakkaalle"
              hint="NÄKYY ASIAKKAALLE — tulee tarjouksen PDF:ään ja sähköpostiin rivien alle."
            >
              <Textarea name="customerNote" defaultValue={asiakas?.customerNote} rows={4} maxLength={2000}
                placeholder="Esim. mitä sovittiin puhelimessa, miten työ etenee, mitä hinta kattaa…" />
            </Field>
            <div className="mt-4">
              <Field label="Sisäinen muistiinpano" hint="Vapaaehtoinen — tallentuu tarjoukselle, ei näy asiakkaalle.">
                <Textarea name="notes" defaultValue={asiakas?.notes} rows={3} placeholder="Esim. sovittu alennus, erityistoiveet…" />
              </Field>
            </div>
          </div>
        </Card>
      </div>

      {/* Oikea: yhteenveto (sticky) */}
      <Card className="lg:sticky lg:top-6">
        <CardHeader title="Tarjous" />
        <div className="space-y-3 p-4">
          {pricing.lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Valitse palveluita tai lisää vapaa rivi nähdäksesi hinnan.</p>
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

          <SubmitButton className="w-full" pendingLabel="Lähetetään…" disabled={pricing.total <= 0}
            name="mode" value="send">
            {offerId ? 'Lähetä tämä tarjous sähköpostilla' : 'Lähetä tarjous sähköpostilla'}
          </SubmitButton>

          {/* Sama lomake, sama hinnoittelu — vain loppu eroaa. `mode` kulkee
              napin omana arvona, joten kentän arvo ratkeaa siitä kumpaa
              painetaan eikä erillistä tilaa tarvita. */}
          <SubmitButton className="w-full" variant="outline" pendingLabel="Tallennetaan…"
            disabled={pricing.total <= 0} name="mode" value="draft">
            Tallenna luonnos
          </SubmitButton>
          <p className="text-xs text-faint">
            Luonnosta ei lähetetä asiakkaalle. Se tallentuu Tarjoukset-listaan, josta työtä voi
            jatkaa myöhemmin — kaikki valinnat säilyvät. PDF:n voi ladata ja tarjouksen lähettää
            silloin kun se on valmis.
          </p>
          {state.error && <ErrorNote>{state.error}</ErrorNote>}
          {state.ok && <OkNote>{state.ok}</OkNote>}
        </div>
      </Card>
    </form>
  );
}

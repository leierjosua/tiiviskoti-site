'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createJob, type ActionState } from '../actions';
import { Button, ErrorNote, Field, Input, Select, Textarea, cx } from '@/components/ui';
import { dateKeyOf, formatDateKey, isoWeekday, timeOf, weekdayShort } from '@/lib/time';

type Prefill = {
  customerName: string; email: string; phone: string;
  postalCode: string; address: string; city: string; notes: string; title: string;
};

/* Tarjous josta aika laitetaan. Vain näyttöä varten — työn tiedot tulevat
   esitäyttönä, ja rivit sekä summa haetaan kannasta tallennuksen yhteydessä. */
type OfferHead = { id: string; number: string; total: string; customer: string };

export function NewJobForm({
  calendars, calendarId, calendarId2, duration, durations, slots, leadId, offer, prefill,
}: {
  calendars: { id: string; label: string }[];
  calendarId: string;
  calendarId2: string;
  duration: number;
  durations: number[];
  slots: string[];
  leadId?: string;
  offer?: OfferHead;
  prefill?: Prefill;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(createJob, {});
  const [selected, setSelected] = useState<string | null>(null);

  // Kalenterin ja keston vaihto hakee vapaat ajat uudelleen palvelimelta,
  // koska laskenta on siellä.
  const reload = (next: { kalenteri?: string; kalenteri2?: string; kesto?: number }) => {
    /* Esitäyttö kulkee mukana kun kalenteri tai kesto vaihtuu — muuten
       liidistä tulleet tiedot katoaisivat ensimmäisestä valinnasta. */
    const params = new URLSearchParams({
      kalenteri: next.kalenteri ?? calendarId,
      kesto: String(next.kesto ?? duration),
    });
    const toinen = next.kalenteri2 ?? calendarId2;
    if (toinen) params.set('kalenteri2', toinen);
    /* Tarjouksesta tullut varaus säilyttää tarjouksen: ilman tätä toisen
       asentajan valinta pudottaisi linkin ja työ jäisi irralleen. */
    if (offer) params.set('tarjous', offer.id);
    if (leadId) params.set('liidi', leadId);
    if (prefill?.customerName) params.set('nimi', prefill.customerName);
    if (prefill?.email) params.set('email', prefill.email);
    if (prefill?.phone) params.set('puhelin', prefill.phone);
    if (prefill?.postalCode) params.set('postinumero', prefill.postalCode);
    if (prefill?.address) params.set('osoite', prefill.address);
    if (prefill?.notes) params.set('muistiinpano', prefill.notes);
    setSelected(null);
    router.replace(`/tyot/uusi?${params}`);
  };

  const byDay = new Map<string, string[]>();
  for (const iso of slots) {
    const key = dateKeyOf(new Date(iso));
    const list = byDay.get(key) ?? [];
    list.push(iso);
    byDay.set(key, list);
  }

  return (
    <form action={action} className="grid gap-6 p-4 lg:grid-cols-2">
      <input type="hidden" name="calendarId" value={calendarId} />
      <input type="hidden" name="calendarId2" value={calendarId2} />
      <input type="hidden" name="durationMinutes" value={duration} />
      <input type="hidden" name="startsAt" value={selected ?? ''} />
      {leadId ? <input type="hidden" name="leadId" value={leadId} /> : null}
      {offer ? <input type="hidden" name="offerId" value={offer.id} /> : null}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Asentaja">
            <Select value={calendarId} onChange={(e) => reload({ kalenteri: e.target.value })}>
              {calendars.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Kesto">
            <Select value={duration} onChange={(e) => reload({ kesto: Number(e.target.value) })}>
              {durations.map((d) => (
                <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} h`}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Toinen asentaja on oma valintansa eikä monivalinta: keikalla on
            päävastuullinen, jonka työlle hinta ja rivit kirjataan. Pari saa
            oman rivin omaan kalenteriinsa, jotta hänenkin aikansa varautuu. */}
        <Field label="Toinen asentaja">
          <Select value={calendarId2} onChange={(e) => reload({ kalenteri2: e.target.value })}>
            <option value="">— ei toista —</option>
            {calendars.filter((c) => c.id !== calendarId).map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
        </Field>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">
            {calendarId2 ? 'Vapaat ajat — molemmille yhteiset' : 'Vapaat ajat'}
          </span>
          {byDay.size === 0 ? (
            <p className="rounded-md border border-line px-3 py-6 text-center text-sm text-faint">
              {calendarId2
                ? 'Ei aikaa joka sopii molemmille. Kokeile lyhyempää kestoa tai tee keikka yksin.'
                : 'Ei vapaita aikoja. Tarkista kalenterin työajat.'}
            </p>
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto rounded-md border border-line p-3">
              {[...byDay.entries()].map(([day, isos]) => (
                <div key={day}>
                  <p className="mb-1 text-xs text-faint">
                    {weekdayShort(isoWeekday(day))} {formatDateKey(day)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {isos.map((iso) => (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setSelected(iso)}
                        className={cx(
                          'rounded border px-2 py-1 text-xs tabular transition-colors',
                          selected === iso
                            ? 'border-accent bg-accent text-accent-ink'
                            : 'border-line text-muted hover:border-accent/50 hover:text-text',
                        )}
                      >
                        {timeOf(new Date(iso))}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <ErrorNote>{state.error}</ErrorNote>

        {offer && (
          <div className="rounded-lg border border-accent/35 bg-accent-dim px-4 py-3 text-sm">
            <p className="font-semibold text-accent">Tarjous {offer.number} — {offer.total}</p>
            <p className="mt-1 text-muted">
              {offer.customer}. Tarjouksen rivit ja summa siirtyvät työlle, ja tarjous
              merkitään hyväksytyksi kun aika on tallennettu.
            </p>
          </div>
        )}

        <Field label="Työn nimi">
          <Input name="title" defaultValue={prefill?.title || 'Tiivistetyö'} required />
        </Field>
        <Field label="Asiakas">
          <Input name="customerName" defaultValue={prefill?.customerName} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sähköposti">
            <Input name="email" defaultValue={prefill?.email} type="email" />
          </Field>
          <Field label="Puhelin">
            <Input name="phone" defaultValue={prefill?.phone} type="tel" />
          </Field>
        </div>
        <Field label="Osoite">
          <Input name="address" defaultValue={prefill?.address} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Postinumero">
            <Input name="postalCode" defaultValue={prefill?.postalCode} inputMode="numeric" />
          </Field>
          <Field label="Kaupunki">
            <Input name="city" defaultValue={prefill?.city} />
          </Field>
        </div>
        <Field label="Muistiinpanot">
          <Textarea name="notes" rows={3} defaultValue={prefill?.notes} />
        </Field>

        <Button type="submit" disabled={pending || !selected} className="w-full">
          {!selected
            ? 'Valitse ensin aika'
            : pending
              ? 'Tallennetaan…'
              : calendarId2 ? 'Luo työ kahdelle asentajalle' : 'Luo työ'}
        </Button>
      </div>
    </form>
  );
}

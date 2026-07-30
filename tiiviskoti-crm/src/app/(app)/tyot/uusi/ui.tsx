'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createJob, type ActionState } from '../actions';
import { Button, ErrorNote, Field, Input, Select, Textarea, cx } from '@/components/ui';
import { dateKeyOf, formatDateKey, isoWeekday, timeOf, weekdayShort } from '@/lib/time';

export function NewJobForm({
  calendars, calendarId, duration, durations, slots,
}: {
  calendars: { id: string; label: string }[];
  calendarId: string;
  duration: number;
  durations: number[];
  slots: string[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(createJob, {});
  const [selected, setSelected] = useState<string | null>(null);

  // Kalenterin ja keston vaihto hakee vapaat ajat uudelleen palvelimelta,
  // koska laskenta on siellä.
  const reload = (next: { kalenteri?: string; kesto?: number }) => {
    const params = new URLSearchParams({
      kalenteri: next.kalenteri ?? calendarId,
      kesto: String(next.kesto ?? duration),
    });
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
      <input type="hidden" name="durationMinutes" value={duration} />
      <input type="hidden" name="startsAt" value={selected ?? ''} />

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

        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">Vapaat ajat</span>
          {byDay.size === 0 ? (
            <p className="rounded-md border border-line px-3 py-6 text-center text-sm text-faint">
              Ei vapaita aikoja. Tarkista kalenterin työajat.
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

        <Field label="Työn nimi">
          <Input name="title" defaultValue="Tiivistetyö" required />
        </Field>
        <Field label="Asiakas">
          <Input name="customerName" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sähköposti">
            <Input name="email" type="email" />
          </Field>
          <Field label="Puhelin">
            <Input name="phone" type="tel" />
          </Field>
        </div>
        <Field label="Osoite">
          <Input name="address" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Postinumero">
            <Input name="postalCode" inputMode="numeric" />
          </Field>
          <Field label="Kaupunki">
            <Input name="city" />
          </Field>
        </div>
        <Field label="Muistiinpanot">
          <Textarea name="notes" rows={3} />
        </Field>

        <Button type="submit" disabled={pending || !selected} className="w-full">
          {!selected ? 'Valitse ensin aika' : pending ? 'Tallennetaan…' : 'Luo työ'}
        </Button>
      </div>
    </form>
  );
}

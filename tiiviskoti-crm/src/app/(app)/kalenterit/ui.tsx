'use client';

import { useActionState, useState } from 'react';
import {
  addException, addHours, createCalendar, deleteException, deleteHours, updateCalendar,
  type ActionState,
} from './actions';
import { setCalendarAreas } from '../alueet/actions';
import { Button, ErrorNote, Field, Input, Select } from '@/components/ui';
import { SubmitButton } from '@/components/submit';
import { weekdayShort } from '@/lib/time';

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

export function CreateCalendarForm({ staff }: { staff: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCalendar, {});

  return (
    <form action={action} className="space-y-4">
      <Note state={state} />
      <Field label="Työntekijä">
        <Select name="staffId" required>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <Field label="Kalenterin nimi" hint="Esim. “Asennukset, Uusimaa”.">
        <Input name="name" required />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Luodaan…' : 'Luo kalenteri'}
      </Button>
    </form>
  );
}

export function CalendarSettingsForm({ calendar }: {
  calendar: {
    id: string; name: string; slot_minutes: number;
    lead_time_hours: number; horizon_days: number; active: boolean;
  };
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateCalendar, {});

  return (
    <form action={action} className="space-y-4 p-4">
      <Note state={state} />
      <input type="hidden" name="id" value={calendar.id} />

      <Field label="Nimi">
        <Input name="name" defaultValue={calendar.name} required />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Alkuajat välein" hint="min">
          <Input name="slotMinutes" type="number" min={5} max={480} step={5}
                 defaultValue={calendar.slot_minutes} required />
        </Field>
        <Field label="Varoaika" hint="tuntia">
          <Input name="leadTimeHours" type="number" min={0} max={2000}
                 defaultValue={calendar.lead_time_hours} required />
        </Field>
        <Field label="Kalenteri auki" hint="vrk">
          <Input name="horizonDays" type="number" min={1} max={365}
                 defaultValue={calendar.horizon_days} required />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={calendar.active}
               className="h-4 w-4 accent-[var(--color-accent)]" />
        Kalenteri käytössä
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? 'Tallennetaan…' : 'Tallenna asetukset'}
      </Button>
    </form>
  );
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export function AddHoursForm({ calendarId }: { calendarId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addHours, {});

  return (
    <form action={action} className="space-y-4 p-4">
      <Note state={state} />
      <input type="hidden" name="calendarId" value={calendarId} />

      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted">Viikonpäivät</span>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((day) => (
            <label key={day}
                   className="cursor-pointer rounded-md border border-line px-2.5 py-1.5 text-xs
                              has-checked:border-accent has-checked:bg-accent/10 has-checked:text-accent">
              <input type="checkbox" name="weekdays" value={day} className="sr-only"
                     defaultChecked={day <= 5} />
              {weekdayShort(day)}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Alkaa">
          <Input name="startTime" type="time" defaultValue="08:00" required />
        </Field>
        <Field label="Päättyy">
          <Input name="endTime" type="time" defaultValue="16:00" required />
        </Field>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Lisätään…' : 'Lisää työaika'}
      </Button>
    </form>
  );
}

/** Mitä alueita tämä kalenteri palvelee. Ilman yhtään aluetta kalenteriin ei
 *  voi varata verkosta, joten se sanotaan suoraan. */
export function CalendarAreasForm({ calendarId, areas, selected }: {
  calendarId: string;
  areas: { id: string; name: string; travelFeeCents: number }[];
  selected: string[];
}) {
  const [pending, setPending] = useState(false);

  if (areas.length === 0) {
    return (
      <p className="p-4 text-sm text-faint">
        Ei alueita. Luo alue kohdasta <b className="text-muted">Palvelualueet</b>, niin voit liittää
        sen tähän kalenteriin.
      </p>
    );
  }

  return (
    <form action={setCalendarAreas} onSubmit={() => setPending(true)} className="space-y-4 p-4">
      <input type="hidden" name="calendarId" value={calendarId} />
      <div className="space-y-1.5">
        {areas.map((a) => (
          <label key={a.id}
                 className="flex cursor-pointer items-center gap-2.5 rounded-md border border-line px-3 py-2 text-sm has-checked:border-accent has-checked:bg-accent/10">
            <input type="checkbox" name="areaIds" value={a.id}
                   defaultChecked={selected.includes(a.id)}
                   className="h-4 w-4 accent-[var(--color-accent)]" />
            <span className="flex-1">{a.name}</span>
            {a.travelFeeCents > 0 && (
              <span className="text-xs text-faint tabular">
                +{(a.travelFeeCents / 100).toLocaleString('fi-FI')} € matkalisä
              </span>
            )}
          </label>
        ))}
      </div>
      {selected.length === 0 && (
        <p className="text-xs text-warn">
          Tähän kalenteriin ei voi varata aikaa verkosta ennen kuin vähintään yksi alue on valittu.
        </p>
      )}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? 'Tallennetaan…' : 'Tallenna alueet'}
      </Button>
    </form>
  );
}

export function DeleteRow({ id, calendarId, kind }: {
  id: string; calendarId: string; kind: 'hours' | 'exception';
}) {
  return (
    <form action={kind === 'hours' ? deleteHours : deleteException} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="calendarId" value={calendarId} />
      <SubmitButton variant="ghost" className="px-2 py-0.5 text-xs" pendingLabel="…">Poista</SubmitButton>
    </form>
  );
}

export function AddExceptionForm({ calendarId }: { calendarId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addException, {});
  const [wholeDay, setWholeDay] = useState(true);
  const [kind, setKind] = useState('closed');

  return (
    <form action={action} className="space-y-4 p-4">
      <Note state={state} />
      <input type="hidden" name="calendarId" value={calendarId} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Päivä">
          <Input name="date" type="date" required />
        </Field>
        <Field label="Tyyppi">
          <Select name="kind" value={kind} onChange={(e) => {
            setKind(e.target.value);
            if (e.target.value === 'open') setWholeDay(false);
          }}>
            <option value="closed">Poissa (loma, sairaus)</option>
            <option value="open">Ylimääräinen työaika</option>
          </Select>
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="wholeDay" checked={wholeDay}
               disabled={kind === 'open'}
               onChange={(e) => setWholeDay(e.target.checked)}
               className="h-4 w-4 accent-[var(--color-accent)]" />
        Koko päivä
      </label>

      {!wholeDay && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Alkaa">
            <Input name="startTime" type="time" defaultValue="12:00" required />
          </Field>
          <Field label="Päättyy">
            <Input name="endTime" type="time" defaultValue="16:00" required />
          </Field>
        </div>
      )}

      <Field label="Muistiinpano">
        <Input name="note" placeholder="Vapaaehtoinen" />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Tallennetaan…' : 'Lisää poikkeus'}
      </Button>
    </form>
  );
}

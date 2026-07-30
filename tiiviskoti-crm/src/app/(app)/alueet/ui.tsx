'use client';

import { useActionState } from 'react';
import { createArea, deleteArea, updateArea, type ActionState } from './actions';
import { Button, ErrorNote, Field, Input } from '@/components/ui';
import { SubmitButton } from '@/components/submit';

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

export function CreateAreaForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createArea, {});

  return (
    <form action={action} className="space-y-4">
      <Note state={state} />
      <Field label="Alueen nimi">
        <Input name="name" required placeholder="Pirkanmaa" />
      </Field>
      <Field
        label="Postinumeron etuliitteet"
        hint='Välilyömin tai pilkuin. "33 34" kattaa kaikki 33xxx ja 34xxx. Pisin osuma voittaa, joten yksittäisen kunnan voi eriyttää tarkemmalla etuliitteellä.'
      >
        <Input name="prefixes" required placeholder="33 34" />
      </Field>
      <Field label="Matkalisä (€)" hint="Lisätään työn hinnan päälle. 0 = ei lisää.">
        <Input name="travelFee" type="number" min={0} max={2000} step={5} defaultValue={0} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Luodaan…' : 'Luo alue'}
      </Button>
    </form>
  );
}

export function AreaRow({ area }: {
  area: {
    id: string; name: string; postal_prefixes: string[];
    travel_fee_cents: number; active: boolean; calendars: number; prefix_count: number;
  };
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateArea, {});

  return (
    <form action={action} className="border-b border-line-soft px-4 py-3 last:border-0">
      <input type="hidden" name="id" value={area.id} />
      <Note state={state} />
      <div className="grid items-end gap-3 md:grid-cols-[1.1fr_1.6fr_100px_auto_auto]">
        <Field label="Nimi">
          <Input name="name" defaultValue={area.name} required />
        </Field>
        <Field label="Etuliitteet">
          <Input name="prefixes" defaultValue={area.postal_prefixes.join(' ')} required />
        </Field>
        <Field label="Matkalisä €">
          <Input name="travelFee" type="number" min={0} step={5}
                 defaultValue={area.travel_fee_cents / 100} />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm whitespace-nowrap">
          <input type="checkbox" name="active" defaultChecked={area.active}
                 className="h-4 w-4 accent-[var(--color-accent)]" />
          Käytössä
        </label>
        <div className="flex gap-2 pb-1">
          <Button type="submit" variant="outline" disabled={pending} className="text-xs">
            {pending ? '…' : 'Tallenna'}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-faint">
        {area.calendars === 0
          ? 'Ei yhtään kalenteria — tälle alueelle ei voi varata aikaa.'
          : `${area.calendars} kalenteri${area.calendars > 1 ? 'a' : ''} palvelee tätä aluetta.`}
      </p>
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

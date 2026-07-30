'use client';

import { useActionState } from 'react';
import { addStaff, setStaffActive, type ActionState } from './actions';
import { Button, ErrorNote, Field, Input, Select } from '@/components/ui';
import { SubmitButton } from '@/components/submit';

export function AddStaffForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(addStaff, {});

  return (
    <form action={action} className="space-y-4">
      <ErrorNote>{state.error}</ErrorNote>
      {state.ok && (
        <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
          {state.ok}
        </p>
      )}

      <Field label="Nimi">
        <Input name="fullName" required />
      </Field>
      <Field label="Sähköposti" hint="Sama osoite kuin Supabase Auth -tunnuksessa.">
        <Input name="email" type="email" required />
      </Field>
      <Field label="Puhelin">
        <Input name="phone" type="tel" />
      </Field>
      <Field label="Rooli">
        <Select name="role" defaultValue="installer">
          <option value="installer">Asentaja</option>
          <option value="admin">Toimisto</option>
          <option value="owner">Omistaja</option>
        </Select>
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Lisätään…' : 'Lisää'}
      </Button>
    </form>
  );
}

export function ToggleActive({ id, active }: { id: string; active: boolean }) {
  return (
    <form action={setStaffActive} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? 'false' : 'true'} />
      <SubmitButton variant="ghost" className="px-2 py-1 text-xs" pendingLabel="…">
        {active ? 'Poista käytöstä' : 'Palauta käyttöön'}
      </SubmitButton>
    </form>
  );
}

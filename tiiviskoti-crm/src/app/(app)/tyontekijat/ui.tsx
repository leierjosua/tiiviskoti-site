'use client';

import { useActionState, useState } from 'react';
import { addStaff, setStaffActive, setStaffPassword, type ActionState } from './actions';
import { Button, ErrorNote, Field, Input, OkNote, Select } from '@/components/ui';
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

/* Salasanan arpominen selaimessa. `crypto.getRandomValues` eikä
   `Math.random`: jälkimmäinen ei ole kryptografisesti turvallinen, ja tästä
   syntyy oikea tunnus oikealle ihmiselle.

   Merkistöstä on jätetty pois toisiinsa sekoittuvat 0/O ja 1/l/I — salasana
   luetaan tässä ääneen tai kirjoitetaan lapulle, ja väärin luettu merkki on
   tavallisin syy sille ettei kirjautuminen onnistu. */
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePassword(length = 16): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]).join('');
}

export function SetPasswordForm({ people, configured }: {
  people: { id: string; full_name: string; email: string }[];
  configured: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setStaffPassword, {});
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);

  if (!configured) {
    return (
      <div className="space-y-2 text-sm text-muted">
        <p className="font-semibold text-text">Ei käytössä tässä ympäristössä.</p>
        <p className="leading-relaxed">
          Salasanan asetus vaatii Supabasen salaisen avaimen. Hae se Supabasen hallinnasta
          kohdasta <b>Project Settings → API Keys</b> ja vie se tiiviskoti-crm-projektin
          ympäristömuuttujaan <code className="font-mono text-xs">SUPABASE_SECRET_KEY</code>.
        </p>
      </div>
    );
  }

  if (people.length === 0) {
    return <p className="text-sm text-muted">Lisää ensin työntekijä.</p>;
  }

  return (
    <form action={action} className="space-y-4">
      <ErrorNote>{state.error}</ErrorNote>
      <OkNote>{state.ok}</OkNote>

      <Field label="Kenelle">
        <Select name="staffId" defaultValue="">
          <option value="" disabled>Valitse työntekijä</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name} · {p.email}</option>
          ))}
        </Select>
      </Field>

      <Field
        label="Uusi salasana"
        hint="Vähintään 12 merkkiä. Kerro se henkilölle itse — sitä ei lähetetä mihinkään."
      >
        <Input
          name="password"
          type={visible ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={12}
          maxLength={72}
          autoComplete="new-password"
          required
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => { setPassword(generatePassword()); setVisible(true); }}
        >
          Arvo salasana
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
        >
          {visible ? 'Piilota' : 'Näytä'}
        </Button>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Asetetaan…' : 'Aseta salasana'}
      </Button>

      <p className="text-xs leading-relaxed text-faint">
        Jos henkilöllä ei vielä ole Supabase Auth -tunnusta, se luodaan samalla.
        Vanha salasana lakkaa toimimasta heti.
      </p>
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

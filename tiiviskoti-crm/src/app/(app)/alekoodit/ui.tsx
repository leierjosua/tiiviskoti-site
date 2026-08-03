'use client';

import { useActionState, useState } from 'react';
import { createCode, deleteCode, updateCode, type ActionState } from './actions';
import { Button, ErrorNote, Field, Input, OkNote, Select } from '@/components/ui';
import { SubmitButton } from '@/components/submit';
import type { CodeData } from './page';

function Note({ state }: { state: ActionState }) {
  return (
    <>
      <ErrorNote>{state.error}</ErrorNote>
      <OkNote>{state.ok}</OkNote>
    </>
  );
}

/* Päivämääräkentän arvo Helsingin ajassa. Suora toISOString() antaisi
   alkupäivälle edellisen päivän, koska 00:00+03:00 on UTC:ssä 21:00
   edellisenä päivänä. */
const dayInput = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date(d))
    : '';

/** Määrä-/prosenttikentät vaihtuvat tyypin mukaan: näkyvissä on vain se
 *  kenttä joka oikeasti vaikuttaa, jottei toinen jää harhaanjohtavasti
 *  näkymään arvolla joka ei tee mitään. */
function ValueFields({ kind, amount, percent }: {
  kind: 'fixed' | 'percent'; amount: number; percent: number;
}) {
  return kind === 'percent' ? (
    <Field label="Alennus %">
      <Input name="percent" type="number" min={1} max={100} step={1} defaultValue={percent || 10} />
      <input type="hidden" name="amount" value={0} />
    </Field>
  ) : (
    <Field label="Alennus €">
      <Input name="amount" type="number" min={1} max={1000} step={5} defaultValue={amount || 20} />
      <input type="hidden" name="percent" value={0} />
    </Field>
  );
}

export function CreateCodeForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCode, {});
  const [kind, setKind] = useState<'fixed' | 'percent'>('fixed');

  return (
    <form action={action} className="space-y-4">
      <Note state={state} />

      <Field label="Koodi" hint="Isot kirjaimet ja numerot. Asiakkaan kirjoitusasu ei haittaa — “naapuri” kelpaa.">
        <Input name="code" required placeholder="NAAPURI" autoCapitalize="characters" />
      </Field>

      <Field label="Kuvaus" hint="Näkyy vain täällä. Esim. mistä kampanjasta koodi on.">
        <Input name="description" placeholder="Postilaatikkomainos 8/2026" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tyyppi">
          <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as 'fixed' | 'percent')}>
            <option value="fixed">Euroa</option>
            <option value="percent">Prosenttia</option>
          </Select>
        </Field>
        <ValueFields kind={kind} amount={0} percent={0} />
      </div>

      <Field
        label="Alaraja (€)"
        hint="Koodi ei kelpaa tätä pienempään tilaukseen. 0 = ei rajaa."
      >
        <Input name="minTotal" type="number" min={0} max={10000} step={10} defaultValue={0} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Voimassa alkaen" hint="Tyhjä = heti.">
          <Input name="startsAt" type="date" />
        </Field>
        <Field label="Voimassa asti" hint="Tyhjä = ei rajaa.">
          <Input name="expiresAt" type="date" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Käyttöjä yhteensä" hint="0 = rajaton.">
          <Input name="maxUses" type="number" min={0} max={100000} step={1} defaultValue={0} />
        </Field>
        <Field label="Per asiakas" hint="Sama sähköposti.">
          <Input name="maxPerCustomer" type="number" min={1} max={100} step={1} defaultValue={1} />
        </Field>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Luodaan…' : 'Luo koodi'}
      </Button>
    </form>
  );
}

export function CodeRow({ code }: { code: CodeData }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateCode, {});
  const [kind, setKind] = useState<'fixed' | 'percent'>(code.kind);

  const exhausted = code.max_uses !== null && code.uses >= code.max_uses;
  const expired = !!code.expires_at && new Date(code.expires_at).getTime() <= Date.now();

  return (
    <form action={action} className="border-b border-line-soft px-4 pt-3 last:border-0">
      <input type="hidden" name="id" value={code.id} />
      <Note state={state} />

      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-base font-extrabold tracking-wider text-text">{code.code}</span>
        {code.description && <span className="text-xs text-faint">{code.description}</span>}
        {/* Syy siihen ettei koodi kelpaa on tärkeämpi kuin se että ei kelpaa:
            umpeutunut ja loppuun käytetty korjataan eri tavoin. */}
        {expired && <span className="text-xs font-semibold text-warn">voimassaolo päättynyt</span>}
        {exhausted && <span className="text-xs font-semibold text-warn">käytetty loppuun</span>}
      </div>

      <div className="grid items-end gap-3 md:grid-cols-[1.4fr_110px_110px_110px_auto_auto]">
        <Field label="Kuvaus">
          <Input name="description" defaultValue={code.description ?? ''} />
        </Field>
        <Field label="Tyyppi">
          <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as 'fixed' | 'percent')}>
            <option value="fixed">€</option>
            <option value="percent">%</option>
          </Select>
        </Field>
        <ValueFields kind={kind} amount={code.amount_cents / 100} percent={code.percent} />
        <Field label="Alaraja €">
          <Input name="minTotal" type="number" min={0} step={10}
                 defaultValue={code.min_total_cents / 100} />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm whitespace-nowrap">
          <input type="checkbox" name="active" defaultChecked={code.active}
                 className="h-4 w-4 accent-[var(--color-accent)]" />
          Käytössä
        </label>
        <div className="flex gap-2 pb-1">
          <Button type="submit" variant="outline" disabled={pending} className="text-xs">
            {pending ? '…' : 'Tallenna'}
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <Field label="Alkaen">
          <Input name="startsAt" type="date" defaultValue={dayInput(code.starts_at)} />
        </Field>
        <Field label="Asti">
          <Input name="expiresAt" type="date" defaultValue={dayInput(code.expires_at)} />
        </Field>
        <Field label="Käyttöjä yht. (0 = rajaton)">
          <Input name="maxUses" type="number" min={0} step={1} defaultValue={code.max_uses ?? 0} />
        </Field>
        <Field label="Per asiakas">
          <Input name="maxPerCustomer" type="number" min={1} step={1}
                 defaultValue={code.max_uses_per_customer} />
        </Field>
      </div>
    </form>
  );
}

export function DeleteCode({ id, code, hasUses }: { id: string; code: string; hasUses: boolean }) {
  return (
    <form action={deleteCode} className="inline">
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        variant="ghost"
        className="px-2 py-1 text-xs"
        pendingLabel="…"
        title={hasUses
          ? `${code}: koodia on käytetty, joten se vain suljetaan — käyttöhistoria säilyy`
          : `Poista ${code}`}
      >
        {hasUses ? 'Sulje koodi' : 'Poista'}
      </SubmitButton>
    </form>
  );
}

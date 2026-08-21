'use client';

import { useActionState, useState } from 'react';
import { deleteJob, rescheduleJob, sendOffer, sendReceipt, setJobStatus, updateJob, type ActionState } from '../actions';
import { Button, ErrorNote, Field, Input, Textarea, cx } from '@/components/ui';
import { SubmitButton } from '@/components/submit';
import { dateKeyOf, timeOf } from '@/lib/time';

/** 'YYYY-MM-DDTHH:MM' Suomen aikaa — datetime-local odottaa juuri tätä. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  return `${dateKeyOf(d)}T${timeOf(d)}`;
}

export function RescheduleForm({ id, startsAt, durationMinutes }: {
  id: string; startsAt: string; durationMinutes: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(rescheduleJob, {});

  return (
    <form action={action} className="space-y-4 p-4">
      <ErrorNote>{state.error}</ErrorNote>
      {state.ok && (
        <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
          {state.ok}
        </p>
      )}
      <input type="hidden" name="id" value={id} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Uusi alkuaika">
          <Input
            name="startsAt"
            type="datetime-local"
            defaultValue={toLocalInput(startsAt)}
            required
          />
        </Field>
        <Field label="Kesto" hint="minuuttia">
          <Input name="durationMinutes" type="number" min={15} max={600} step={15}
                 defaultValue={durationMinutes} required />
        </Field>
      </div>

      <p className="text-xs text-faint">
        Aika tulkitaan Suomen aikana. Päällekkäinen varaus estyy tietokannassa.
      </p>

      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? 'Siirretään…' : 'Siirrä'}
      </Button>
    </form>
  );
}

export function EditJobForm({ job, lineSumCents }: {
  job: {
    id: string; title: string; address: string | null; postal_code: string | null;
    city: string | null; price_cents: number; notes: string | null;
    customer_name: string | null; customer_email: string | null; customer_phone: string | null;
  };
  lineSumCents: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateJob, {});
  const [price, setPrice] = useState(job.price_cents / 100);

  // Käsin muutettu hinta voi poiketa rivien summasta. Se on sallittua, mutta
  // ero näytetään, jottei se jää huomaamatta laskutuksessa.
  const diff = Math.round(price * 100) - lineSumCents;

  return (
    <form action={action} className="space-y-4 p-4">
      <ErrorNote>{state.error}</ErrorNote>
      {state.ok && (
        <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
          {state.ok}
        </p>
      )}
      <input type="hidden" name="id" value={job.id} />

      <Field label="Työn nimi">
        <Input name="title" defaultValue={job.title} required />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Asiakas">
          <Input name="customerName" defaultValue={job.customer_name ?? ''} required />
        </Field>
        <Field label="Puhelin">
          <Input name="customerPhone" type="tel" defaultValue={job.customer_phone ?? ''} />
        </Field>
      </div>
      <Field label="Sähköposti">
        <Input name="customerEmail" type="email" defaultValue={job.customer_email ?? ''} />
      </Field>

      <Field label="Osoite">
        <Input name="address" defaultValue={job.address ?? ''} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Postinumero">
          <Input name="postalCode" inputMode="numeric" maxLength={5}
                 defaultValue={job.postal_code ?? ''} />
        </Field>
        <Field label="Kaupunki">
          <Input name="city" defaultValue={job.city ?? ''} />
        </Field>
      </div>

      <Field
        label="Hinta (€)"
        hint={diff === 0
          ? 'Täsmää työn rivien summaan.'
          : `Poikkeaa rivien summasta ${(lineSumCents / 100).toLocaleString('fi-FI')} € — ero ${(diff / 100).toLocaleString('fi-FI')} €.`}
      >
        <Input name="priceEur" type="number" min={0} step={1} value={price}
               onChange={(e) => setPrice(Number(e.target.value))} />
      </Field>

      <Field label="Muistiinpanot">
        <Textarea name="notes" rows={3} defaultValue={job.notes ?? ''} />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Tallennetaan…' : 'Tallenna muutokset'}
      </Button>
    </form>
  );
}

/** Poisto vain perutulle työlle: laskutettavaa työtä ei saa kadottaa. */
export function DeleteJob({ id, status }: { id: string; status: string }) {
  if (status !== 'cancelled') {
    return (
      <p className="text-xs text-faint">
        Vain peruttu työ voidaan poistaa. Peruuta työ ensin, jos se halutaan pois kokonaan.
      </p>
    );
  }
  return (
    <form action={deleteJob}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="danger" className="text-xs" pendingLabel="Poistetaan…">Poista työ pysyvästi</SubmitButton>
    </form>
  );
}

/** Yhden napin kvittaus tehdyksi — asentajan tärkein toiminto puhelimessa. */
export function MarkDone({ id }: { id: string }) {
  return (
    <form action={setJobStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value="done" />
      <SubmitButton variant="outline" className="text-sm" pendingLabel="Merkitään…">Merkitse tehdyksi</SubmitButton>
    </form>
  );
}

/** Merkitse maksetuksi & lähetä kuitti asiakkaalle (PDF sähköpostiin). */
export function SendReceipt({ id, alreadySent }: { id: string; alreadySent?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendReceipt, {});
  return (
    <div className="space-y-2">
      {alreadySent && !state.ok && (
        <p className="text-xs text-accent">✓ Kuitti on jo lähetetty tälle työlle.</p>
      )}
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant={alreadySent ? 'outline' : undefined} disabled={pending} className="text-sm">
          {pending ? 'Lähetetään…' : alreadySent ? 'Lähetä kuitti uudelleen' : 'Merkitse maksetuksi & lähetä kuitti'}
        </Button>
      </form>
      {state.error && <ErrorNote>{state.error}</ErrorNote>}
      {state.ok && <p className="text-xs text-green-600">{state.ok}</p>}
    </div>
  );
}

/** Lähetä tarjous asiakkaalle ennen työtä (PDF sähköpostiin). Ei muuta työn tilaa. */
export function SendOffer({ id, alreadySent }: { id: string; alreadySent?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendOffer, {});
  return (
    <div className="space-y-2">
      {alreadySent && !state.ok && (
        <p className="text-xs text-accent">✓ Tarjous on jo lähetetty tälle työlle.</p>
      )}
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="outline" disabled={pending} className="text-sm">
          {pending ? 'Lähetetään…' : alreadySent ? 'Lähetä tarjous uudelleen' : 'Lähetä tarjous'}
        </Button>
      </form>
      {state.error && <ErrorNote>{state.error}</ErrorNote>}
      {state.ok && <p className="text-xs text-green-600">{state.ok}</p>}
    </div>
  );
}

const OPTIONS = [
  { value: 'tentative', label: 'Alustava' },
  { value: 'confirmed', label: 'Vahvistettu' },
  { value: 'done', label: 'Tehty' },
  { value: 'cancelled', label: 'Peruttu' },
] as const;

export function StatusButtons({ id, status }: { id: string; status: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((option) => (
        <form key={option.value} action={setJobStatus}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={option.value} />
          <SubmitButton
            variant={option.value === 'cancelled' ? 'danger' : 'outline'}
            disabled={status === option.value}
            className={cx('text-xs', status === option.value && 'border-accent text-accent')}
          >
            {option.label}
          </SubmitButton>
        </form>
      ))}
    </div>
  );
}

'use client';

import { useActionState, useState } from 'react';
import { appendJobNote, deleteJob, rescheduleJob, sendConfirmation, sendOffer, sendReceipt, setJobStatus, transferJob, updateJob, type ActionState } from '../actions';
import { Button, ErrorNote, Field, Input, Select, Textarea, cx } from '@/components/ui';
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

/**
 * Keikan tekijät — yksi, kaksi tai useampi.
 *
 * Rastit eikä pudotusvalikko: keikalla voi olla monta tekijää, ja nykyinen
 * kokoonpano pitää näkyä yhdellä silmäyksellä. Valinta on LOPPUTILA, ei
 * lisäys — rastin poisto ottaa tekijän pois keikalta.
 */
export function TransferJobForm({ id, currentCalendarIds, calendars }: {
  id: string;
  currentCalendarIds: string[];
  calendars: { id: string; name: string; staff_id: string; staff_name: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(transferJob, {});
  const [valitut, setValitut] = useState<string[]>(currentCalendarIds);

  /* Sama ihminen kahdessa kalenterissa olisi keikalla kahdesti. Estetään jo
     lomakkeella, jottei virhe tule vasta lähetyksen jälkeen. */
  const valitutStaff = new Set(
    calendars.filter((c) => valitut.includes(c.id)).map((c) => c.staff_id),
  );
  const toggle = (cid: string) =>
    setValitut((v) => v.includes(cid) ? v.filter((x) => x !== cid) : [...v, cid]);

  const ennallaan = valitut.length === currentCalendarIds.length
    && valitut.every((c) => currentCalendarIds.includes(c));

  return (
    <form action={action} className="space-y-4 p-4">
      <ErrorNote>{state.error}</ErrorNote>
      {state.ok && (
        <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
          {state.ok}
        </p>
      )}
      <input type="hidden" name="id" value={id} />

      <fieldset className="space-y-1">
        <legend className="mb-2 text-xs font-medium text-faint">Keikan tekijät</legend>
        {calendars.map((c) => {
          const on = valitut.includes(c.id);
          /* Toinen saman ihmisen kalenteri lukitaan kun hänet on jo valittu. */
          const esto = !on && valitutStaff.has(c.staff_id);
          return (
            <label
              key={c.id}
              className={cx(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                esto ? 'opacity-40' : 'hover:bg-surface-2',
              )}
            >
              <input
                type="checkbox"
                name="calendarIds"
                value={c.id}
                checked={on}
                disabled={esto}
                onChange={() => toggle(c.id)}
              />
              <span className="flex-1">
                {c.staff_name}
                <span className="ml-2 text-xs text-faint">{c.name}</span>
              </span>
              {currentCalendarIds.includes(c.id) && (
                <span className="text-xs text-faint">nyt</span>
              )}
            </label>
          );
        })}
      </fieldset>

      {valitut.length === 0 && (
        <p className="text-xs text-danger">Valitse vähintään yksi tekijä.</p>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="lahetaTyomaarain" className="mt-0.5" />
        <span>
          Lähetä työmääräin uusille tekijöille
          <span className="block text-xs text-faint">
            Asiakkaalle ei lähde mitään — vahvistuksessa lukeva aika ei muutu.
          </span>
        </span>
      </label>

      <p className="text-xs text-faint">
        Aika pysyy samana. Lisätty tekijä saa oman rivinsä omaan kalenteriinsa
        hinnalla 0 — laskutus ja työrivit pysyvät tällä työllä. Jos joku on jo
        varattu tähän aikaan, mitään ei siirry.
      </p>

      <Button type="submit" variant="outline" disabled={pending || valitut.length === 0 || ennallaan}>
        {pending ? 'Tallennetaan…' : 'Tallenna tekijät'}
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

/** Vahvistus asiakkaalle + työmääräin asentajalle + käynti Google-kalenteriin.
 *  Tarjouksesta ja liidistä syntyneiltä töiltä nämä puuttuvat, ellei niitä
 *  lähetetä täältä. Puuttuva kalenterimerkintä nostetaan varoituksena, koska
 *  sitä ei huomaa mistään muualta kuin asentajan tyhjästä päivästä. */
export function SendConfirmation({ id, alreadySent, inCalendar }: {
  id: string; alreadySent?: boolean; inCalendar?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendConfirmation, {});
  return (
    <div className="space-y-2">
      {!state.ok && (alreadySent
        ? <p className="text-xs text-accent">✓ Vahvistus on lähetetty{inCalendar ? ' ja käynti on kalenterissa.' : ', mutta käynti EI ole Google-kalenterissa.'}</p>
        : <p className="text-xs text-warn">Asiakas ei ole saanut vahvistusta{inCalendar ? '.' : ' eikä käynti ole Google-kalenterissa.'}</p>
      )}
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant={alreadySent ? 'outline' : undefined} disabled={pending} className="text-sm">
          {pending ? 'Lähetetään…' : alreadySent ? 'Lähetä vahvistus uudelleen' : 'Lähetä vahvistus & vie kalenteriin'}
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

/* Sisäinen merkintä keikalle. React tyhjentää lomakkeen itse kun action
   on funktio, joten kenttä on valmis seuraavaa merkintää varten — ja
   seuraava merkintä on uusi merkintä, ei edellisen korjaus. */
export function NoteForm({ id }: { id: string }) {
  return (
    <form action={appendJobNote} className="flex gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="note"
        required
        maxLength={500}
        placeholder="Lisää muistiinpano…"
        className="min-w-0 flex-1 rounded-lg border border-line bg-ink-800 px-3 py-2.5 text-sm
                   placeholder:text-faint focus:border-accent focus:outline-none"
      />
      <SubmitButton className="text-sm" pendingLabel="Lisätään…">Lisää</SubmitButton>
    </form>
  );
}

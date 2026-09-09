'use client';

import { useActionState } from 'react';
import { addExpense, saveCostSettings, type ActionState } from './actions';
import { Button, ErrorNote, Field, Input, OkNote, Select } from '@/components/ui';
import { CATEGORIES, type CostSettings } from '@/lib/talous-shared';

function Note({ state }: { state: ActionState }) {
  return (
    <>
      <ErrorNote>{state.error}</ErrorNote>
      <OkNote>{state.ok}</OkNote>
    </>
  );
}

/** Peruspisteet → prosenttiluku lomakkeelle (1250 → 12.5). */
const bp = (v: number) => v / 100;

export function CostSettingsForm({ settings }: { settings: CostSettings }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveCostSettings, {});

  return (
    <form action={action} className="space-y-4 p-4">
      <Note state={state} />

      <Field
        label="Arvonlisävero (%)"
        hint="Työn hinta kannassa on kuluttajahinta. Liikevaihto lasketaan siitä takaperin, ja kaikki kuluprosentit lasketaan liikevaihdosta."
      >
        <Input name="vat" type="number" min={0} max={100} step={0.5} defaultValue={bp(settings.vatBp)} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tekijäkulut (% liikevaihdosta)" hint="Asentajan palkka tai urakkapalkkio.">
          <Input name="tekija" type="number" min={0} max={100} step={0.5} defaultValue={bp(settings.tekijaBp)} />
        </Field>
        <Field label="Laitekustannukset (%)" hint="Tiivisteet ja tarvikkeet keikkaa kohti.">
          <Input name="laite" type="number" min={0} max={100} step={0.5} defaultValue={bp(settings.laiteBp)} />
        </Field>
        <Field label="Myyntikomissio (%)" hint="Myyjän osuus kaupasta.">
          <Input name="komissio" type="number" min={0} max={100} step={0.5} defaultValue={bp(settings.komissioBp)} />
        </Field>
        <Field label="Markkinointiprovisio (%)" hint="Kumppanin tai toimiston osuus liikevaihdosta.">
          <Input name="provisio" type="number" min={0} max={100} step={0.5} defaultValue={bp(settings.provisioBp)} />
        </Field>
      </div>

      <Field
        label="Kiinteät kulut (€ / kk)"
        hint="Vuokra, vakuutukset, ohjelmistot, kirjanpito. Jaetaan jaksolle päivien suhteessa, joten viikkonäkymä ei kanna koko kuukauden summaa."
      >
        <Input name="kiinteat" type="number" min={0} step={10}
               defaultValue={settings.kiinteatCentsMonth / 100} />
      </Field>

      <label className="flex items-start gap-2.5 rounded-lg border border-line bg-ink-700 px-3 py-3">
        <input type="checkbox" name="metaAuto" defaultChecked={settings.metaAuto}
               className="mt-0.5 h-4 w-4 accent-[#217A4E]" />
        <span className="text-sm">
          <span className="font-semibold text-text">Hae Meta-mainoskulut automaattisesti</span>
          <span className="mt-0.5 block text-xs text-faint">
            Markkinointikuluun lisätään Meta Marketing API:n toteutunut spend jaksolta.
            Kun tämä on päällä, älä kirjaa Meta-laskuja myös käsin — ne laskettaisiin kahdesti.
            Google Ads ja muut mainoskulut kirjataan aina käsin.
          </span>
        </span>
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? 'Tallennetaan…' : 'Tallenna asetukset'}
      </Button>
    </form>
  );
}

export function AddExpenseForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addExpense, {});

  return (
    <form action={action} className="space-y-4 p-4">
      <Note state={state} />

      <Field label="Päivä" hint="Kulu osuu sille jaksolle jolle tämä päivä kuuluu.">
        <Input name="spentOn" type="date" required defaultValue={today} />
      </Field>

      <Field label="Kategoria">
        <Select name="category" required defaultValue="laite">
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </Select>
      </Field>

      <Field label="Summa (€)" hint="Alv 0 %. Hyvitys kirjataan miinusmerkillä.">
        <Input name="amount" type="number" step={0.01} required placeholder="149,00" />
      </Field>

      <Field label="Selite">
        <Input name="note" maxLength={200} placeholder="Tiivistetilaus, 200 m" />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Kirjataan…' : 'Kirjaa kulu'}
      </Button>
    </form>
  );
}

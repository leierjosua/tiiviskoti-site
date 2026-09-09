'use client';

import { useActionState } from 'react';
import { createAbTest, type ActionState } from './actions';
import { Button, ErrorNote, Field, Input, OkNote, Select, Textarea } from '@/components/ui';

/* Testin luontilomake. Mittari valitaan valikosta eikä kirjoiteta käsin:
   askeleen nimi on sivuston koodissa oleva merkkijono, ja kirjoitusvirhe
   tuottaisi testin joka näyttää nollaa ikuisesti ilman virheilmoitusta. */
export function NewTestForm({ today, steps }: {
  today: string;
  steps: { key: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createAbTest, {});

  return (
    <form action={action} className="space-y-4 p-4">
      <ErrorNote>{state.error}</ErrorNote>
      <OkNote>{state.ok}</OkNote>

      <Field label="Testin nimi">
        <Input name="name" required maxLength={120} placeholder="Varauskortti: hinta heti näkyviin" />
      </Field>

      <Field label="Hypoteesi" hint="Mitä oletat ja miksi. Tämä on se lause jota tulos joko tukee tai ei.">
        <Textarea name="hypothesis" rows={3} maxLength={500}
                  placeholder="Kortti pyytää postinumeroa ennen kuin se näyttää mitään. Jos hinta näkyy heti, useampi avaa laskurin." />
      </Field>

      <Field label="Sivu" hint='LIKE-kuvio polkuun. "%" = koko sivusto, "%taloyhtio%" vain taloyhtiösivu.'>
        <Input name="pathPattern" defaultValue="%" maxLength={200} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Perusjoukko" hint="Mistä osuus lasketaan.">
          <Select name="baseStep" defaultValue="">
            <option value="">Sivunäytöt</option>
            {steps.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Mitattava askel" hint="Mihin asti pitää päästä, jotta se lasketaan osumaksi.">
          <Select name="metricStep" required defaultValue="calc">
            {steps.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Versio A (nykyinen)">
          <Input name="labelA" defaultValue="A" maxLength={80} />
        </Field>
        <Field label="Versio B (haastaja)">
          <Input name="labelB" defaultValue="B" maxLength={80} />
        </Field>
      </div>

      <Field label="Aloituspäivä">
        <Input name="startedOn" type="date" required defaultValue={today} />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Kirjataan…' : 'Kirjaa testi käyntiin'}
      </Button>

      <p className="text-xs leading-relaxed text-faint">
        Tämä kirjaa vain seurannan. Itse versio B toteutetaan sivustolle koodissa
        (<code className="rounded bg-line-soft px-1 py-0.5">html[data-ab=&quot;b&quot;]</code>), ja
        <code className="mx-1 rounded bg-line-soft px-1 py-0.5">?ab=b</code>
        pakottaa version testausta varten.
      </p>
    </form>
  );
}

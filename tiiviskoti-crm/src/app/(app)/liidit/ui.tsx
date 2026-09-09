'use client';

import { useEffect, useState, useTransition } from 'react';
import { setLeadStatus } from '../alueet/actions';
import { Select } from '@/components/ui';

const LABELS: Record<string, string> = {
  new: 'Uusi',
  contacted: 'Yhteydessä',
  no_answer: 'Soita uudelleen',
  converted: 'Muuttui asiakkaaksi',
  rejected: 'Ei jatkoa',
};

/**
 * Tila vaihtuu heti valinnasta — erillinen tallennusnappi olisi turha
 * yhden kentän lomakkeessa.
 *
 * MIKSI OHJATTU KENTTÄ JA PENDING-TILA: sivu hakee latautuessaan Metan
 * liidit, joten tallennuksen jälkeinen uudelleenlataus kestää pari
 * sekuntia. Ilman näkyvää merkkiä valinta näytti siltä ettei se mennyt
 * läpi, ja sitä klikattiin uudestaan — viisi liidiä vaihtoi tilaa
 * vahingossa ennen kuin vika huomattiin. Nyt valinta näkyy heti ja
 * kenttä lukittuu tallennuksen ajaksi.
 */
export function LeadStatus({ id, status }: { id: string; status: string }) {
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();

  /* Palvelimen arvo voittaa kun se päivittyy — muuten epäonnistunut
     tallennus jättäisi ruudulle valinnan jota kannassa ei ole. */
  useEffect(() => { setValue(status); }, [status]);

  return (
    <form action={setLeadStatus}>
      <input type="hidden" name="id" value={id} />
      <Select
        name="status"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const valittu = e.currentTarget.value;
          const form = e.currentTarget.form;
          setValue(valittu);
          startTransition(() => form?.requestSubmit());
        }}
        className={`w-auto py-1 text-xs transition-opacity ${pending ? 'opacity-50' : ''}`}
      >
        {Object.entries(LABELS).map(([v, label]) => (
          <option key={v} value={v}>{label}</option>
        ))}
      </Select>
    </form>
  );
}

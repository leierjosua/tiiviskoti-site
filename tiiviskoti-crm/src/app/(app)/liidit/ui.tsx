'use client';

import { setLeadStatus } from '../alueet/actions';
import { Select } from '@/components/ui';

const LABELS: Record<string, string> = {
  new: 'Uusi',
  contacted: 'Yhteydessä',
  converted: 'Muuttui asiakkaaksi',
  rejected: 'Ei jatkoa',
};

/** Tila vaihtuu heti valinnasta — erillinen tallennusnappi olisi turha
 *  yhden kentän lomakkeessa. */
export function LeadStatus({ id, status }: { id: string; status: string }) {
  return (
    <form action={setLeadStatus}>
      <input type="hidden" name="id" value={id} />
      <Select name="status" defaultValue={status}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="w-auto py-1 text-xs">
        {Object.entries(LABELS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </Select>
    </form>
  );
}

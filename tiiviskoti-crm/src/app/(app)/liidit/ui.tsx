'use client';

import { setLeadCallBack, setLeadStatus } from '../alueet/actions';
import { Select } from '@/components/ui';

const LABELS: Record<string, string> = {
  new: 'Uusi',
  contacted: 'Yhteydessä',
  no_answer: 'Ei vastannut',
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

/** Paikallinen aika `datetime-local`-kenttään. Selain odottaa vyöhykkeetöntä
 *  arvoa, ja palvelin tulkitsee sen Suomen ajaksi — sama sopimus kuin
 *  varauksissa. */
function localValue(at: Date | string | null): string {
  if (!at) return '';
  const d = typeof at === 'string' ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return '';
  const osat = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
  return osat.replace(' ', 'T').slice(0, 16);
}

/**
 * Milloin liidille soitetaan uudelleen.
 *
 * "Soita uudelleen" ilman päivämäärää tarkoittaa käytännössä "joskus", ja
 * juuri siihen liidit hukkuvat. Erääntynyt aika nostaa rivin listan
 * ylimmäksi ja värjää kentän, joten unohtaminen näkyy.
 */
export function LeadCallBack({ id, at, overdue }: {
  id: string; at: Date | string | null; overdue: boolean;
}) {
  return (
    <form action={setLeadCallBack}>
      <input type="hidden" name="id" value={id} />
      <input
        type="datetime-local"
        name="soittoaika"
        defaultValue={localValue(at)}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`w-auto rounded-md border bg-ink-800 px-2 py-1 text-xs ${
          overdue
            ? 'border-red-500/60 text-red-300'
            : at ? 'border-ink-600 text-text' : 'border-ink-700 text-faint'
        }`}
      />
    </form>
  );
}

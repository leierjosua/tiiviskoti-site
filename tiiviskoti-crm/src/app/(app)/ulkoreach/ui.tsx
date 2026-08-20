'use client';

import { useState } from 'react';
import { approveBatch } from './actions';
import { Button, StatusBadge } from '@/components/ui';

export type Row = {
  id: string; company_name: string; city: string | null; email: string | null;
  contact_name: string | null; website: string | null; status: string;
  do_not_contact: boolean; enrollment_approved_at: string | null;
  enrollment_status: string | null; enrollment_step: number | null;
  last_status: string | null; last_sent_at: string | null;
  opened: boolean | null; replied: boolean | null;
};

const STATUS_LABEL: Record<string, string> = {
  new: 'Uusi', queued: 'Jonossa', contacted: 'Kontaktoitu', opened: 'Avattu',
  replied: 'Vastasi', booked: 'Varasi', won: 'Kauppa', lost: 'Hävitty',
  unsubscribed: 'Poistunut', bounced: 'Bounce',
};

export function ProspectTable({ rows, campaignId }: { rows: Row[]; campaignId: string }) {
  const [sel, setSel] = useState<Set<string>>(new Set());

  const selectable = rows.filter((r) => r.email && !r.do_not_contact && !r.enrollment_approved_at);
  const allSel = selectable.length > 0 && selectable.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(allSel ? new Set() : new Set(selectable.map((r) => r.id)));
  const toggle = (id: string) => {
    const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n);
  };

  return (
    <form action={approveBatch}>
      <input type="hidden" name="campaignId" value={campaignId} />
      {[...sel].map((id) => <input key={id} type="hidden" name="ids" value={id} />)}

      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-muted">{sel.size} valittu lähetykseen</span>
        <Button type="submit" disabled={sel.size === 0}>
          Hyväksy &amp; aloita erä ({sel.size})
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-ink-700 text-left text-muted">
            <tr>
              <th className="w-8 px-3 py-2"><input type="checkbox" checked={allSel} onChange={toggleAll} /></th>
              <th className="px-3 py-2">Yritys</th>
              <th className="px-3 py-2">Kaupunki</th>
              <th className="px-3 py-2">Kontakti / sähköposti</th>
              <th className="px-3 py-2">Tila</th>
              <th className="px-3 py-2">Sekvenssi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const canSelect = r.email && !r.do_not_contact && !r.enrollment_approved_at;
              return (
                <tr key={r.id} className="border-t border-line hover:bg-ink-700">
                  <td className="px-3 py-2">
                    <input type="checkbox" disabled={!canSelect} checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-text">{r.company_name}</div>
                    {r.website && <div className="text-xs text-muted">{r.website}</div>}
                  </td>
                  <td className="px-3 py-2 text-muted">{r.city ?? '—'}</td>
                  <td className="px-3 py-2">
                    {r.contact_name && <div className="text-text">{r.contact_name}</div>}
                    {r.email
                      ? <div className="text-xs text-muted">{r.email}</div>
                      : <span className="text-xs text-warn">sähköposti puuttuu</span>}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={STATUS_LABEL[r.status] ?? r.status} /></td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {r.enrollment_approved_at
                      ? `Askel ${r.enrollment_step ?? 0}/3 · ${r.enrollment_status ?? ''}`
                      : r.enrollment_status
                        ? 'Odottaa hyväksyntää'
                        : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}

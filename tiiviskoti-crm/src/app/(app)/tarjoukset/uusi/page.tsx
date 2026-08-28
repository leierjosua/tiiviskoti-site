import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { PageHead } from '@/components/ui';
import { OfferBuilder, type DraftState } from './ui';

export const dynamic = 'force-dynamic';

type DraftRow = {
  id: string; offer_number: string; kind: 'asiakas' | 'taloyhtio';
  customer_name: string | null; contact_name: string | null; email: string | null;
  phone: string | null; address: string | null; city: string | null;
  notes: string | null; customer_note: string | null;
  draft_state: DraftState | null;
};

export default async function NewOfferPage({
  searchParams,
}: { searchParams: Promise<{ luonnos?: string }> }) {
  await requireManager();
  const { luonnos } = await searchParams;

  /* Avattu luonnos haetaan tässä palvelimella: laskurin tila tulee
     draft_state-sarakkeesta ja asiakastiedot tarjouksen omilta kentiltä.
     Vain luonnos aukeaa muokattavaksi — lähetetystä tarjouksesta asiakkaalla
     on jo kopio, eikä sitä saa muuttaa jälkikäteen. */
  let draft: DraftRow | null = null;
  if (luonnos) {
    const [rivi] = await sql<DraftRow[]>`
      select id, offer_number, kind, customer_name, contact_name, email, phone,
             address, city, notes, customer_note, draft_state
        from tk.offers where id = ${luonnos} and status = 'draft'
    `;
    draft = rivi ?? null;
  }

  return (
    <div className="space-y-6">
      <PageHead
        title={draft ? `Jatka luonnosta ${draft.offer_number}` : 'Uusi asiakastarjous'}
        sub={<Link href="/tarjoukset" className="text-sm text-muted hover:text-text">← Tarjoukset</Link>}
      />
      {luonnos && !draft && (
        <p className="rounded-lg border border-line bg-ink-800 px-3 py-2 text-sm text-muted">
          Luonnosta ei löytynyt tai se on jo lähetetty. Alla on tyhjä tarjous.
        </p>
      )}
      <OfferBuilder
        kind={draft?.kind ?? 'asiakas'}
        offerId={draft?.id}
        draft={draft?.draft_state ?? undefined}
        asiakas={draft ? {
          customerName: draft.customer_name ?? undefined,
          contactName: draft.contact_name ?? undefined,
          email: draft.email ?? undefined,
          phone: draft.phone ?? undefined,
          address: draft.address ?? undefined,
          city: draft.city ?? undefined,
          notes: draft.notes ?? undefined,
          customerNote: draft.customer_note ?? undefined,
        } : undefined}
      />
    </div>
  );
}

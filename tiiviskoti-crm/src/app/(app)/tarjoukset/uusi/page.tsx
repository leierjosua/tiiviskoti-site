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
}: { searchParams: Promise<{ luonnos?: string; tyo?: string }> }) {
  await requireManager();
  const { luonnos, tyo } = await searchParams;

  /* Työstä avattu tarjous: asiakkaan tiedot tulevat valmiiksi, kaikki muu
     on tyhjää ja muokattavissa.

     MIKSI VAIN ASIAKASTIEDOT EIKÄ HINTOJA: työn rivit ovat jo tehtyä työtä,
     tarjous on tulevaa. Jos laskuri esitäytettäisiin työn summalla, se
     näyttäisi tarjoukselta samasta työstä — ja se on juuri se virhe josta
     syntyy kahteen kertaan laskutus. Asiakkaan nimi ja osoite sen sijaan
     ovat aina samat, ja niiden käsin kopiointi on se vaihe joka jää
     tekemättä tai menee väärin. */
  let fromJob: {
    customerName?: string; email?: string; phone?: string;
    address?: string; city?: string; notes?: string;
  } | null = null;
  if (tyo && !luonnos) {
    const [j] = await sql<{
      job_number: string; address: string | null; postal_code: string | null; city: string | null;
      customer_name: string | null; customer_email: string | null; customer_phone: string | null;
    }[]>`
      select j.job_number, j.address, j.postal_code, j.city,
             cu.full_name as customer_name, cu.email as customer_email, cu.phone as customer_phone
        from tk.jobs j
        left join tk.customers cu on cu.id = j.customer_id
       where j.id = ${tyo}
    `;
    if (j) {
      fromJob = {
        customerName: j.customer_name ?? undefined,
        email: j.customer_email ?? undefined,
        phone: j.customer_phone ?? undefined,
        address: [j.address, j.postal_code].filter(Boolean).join(', ') || undefined,
        city: j.city ?? undefined,
        notes: `Jatkotarjous työlle ${j.job_number}.`,
      };
    }
  }

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
        asiakas={fromJob ? fromJob : draft ? {
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

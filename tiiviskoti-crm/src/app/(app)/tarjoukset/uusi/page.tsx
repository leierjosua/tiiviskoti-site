import Link from 'next/link';
import { sql } from '@/lib/db';
import { requireManager } from '@/lib/session';
import { PageHead } from '@/components/ui';
import { MIN_PRICE_NAME } from '@/lib/pricing';
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
}: { searchParams: Promise<{ luonnos?: string; tyo?: string; liidi?: string; muokkaa?: string }> }) {
  await requireManager();
  const { luonnos, tyo, liidi, muokkaa } = await searchParams;

  /* "Muuta tarjousta": lähetetty, vanhentunut tai hylätty tarjous avataan
     muokattavaksi ja lähetetään uudelleen samalla numerolla (ks. actions.ts).

     LASKURIN TILA: lähetetyillä tarjouksilla draft_state on lähes aina tyhjä
     (se tallentui vain luonnoksille), joten tila rakennetaan tallennetuista
     riveistä. Jokainen rivi tuodaan VAPAANA rivinä alkuperäisellä
     à-hinnalla — ei arvata takaisin hinnaston kohteeksi, koska silloin
     vanha tarjous laskettaisiin nykyhinnoilla ja summa muuttuisi
     huomaamatta. Matkalisä ja pienen käynnin lisä jätetään pois: laskuri
     laskee ne itse postinumerosta ja summasta, muuten ne tulisivat kahdesti. */
  type EditRow = DraftRow & {
    status: string; postal_code: string | null; inclusions: string[] | null;
    lines: { name: string; quantity: number; unit_price_cents: number }[];
    has_job: boolean;
  };
  let edit: EditRow | null = null;
  let editDraft: DraftState | undefined;
  if (muokkaa && !luonnos && !tyo && !liidi) {
    const [rivi] = await sql<EditRow[]>`
      select o.id, o.offer_number, o.kind, o.customer_name, o.contact_name, o.email, o.phone,
             o.address, o.postal_code, o.city, o.notes, o.customer_note, o.inclusions,
             o.draft_state, o.lines, o.status::text as status,
             exists (select 1 from tk.jobs j where j.offer_id = o.id and j.status <> 'cancelled') as has_job
        from tk.offers o where o.id = ${muokkaa}
    `;
    if (rivi && ['sent', 'expired', 'declined'].includes(rivi.status) && !rivi.has_job) {
      edit = rivi;
      editDraft = rivi.draft_state ?? {
        custom: rivi.lines
          .filter((l) => l.name !== 'Matkalisä' && l.name !== MIN_PRICE_NAME)
          .map((l) => ({ name: l.name, qty: l.quantity, unit: l.unit_price_cents / 100 })),
        postal: rivi.postal_code ?? '',
        inclusions: rivi.inclusions ?? undefined,
      };
      /* Postinumero kulkee aina tarjouksen omalta riviltä: draft_state voi
         olla vanhempi kuin viimeksi lähetetty versio. */
      editDraft = { ...editDraft, postal: rivi.postal_code ?? editDraft.postal ?? '' };
    }
  }

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

  /* Liidistä avattu tarjous. Sama periaate kuin työstä: vain yhteystiedot,
     ei hintoja — liidi ei sisällä yhtään hinnoiteltua riviä, joten laskuri
     jää tyhjäksi ja tarjous tehdään alusta.

     OSOITE JÄTETÄÄN TYHJÄKSI, VAIKKA POSTINUMERO ON TIEDOSSA. Pelkkä
     postinumero Osoite-kentässä päätyisi asiakkaalle lähtevään tarjoukseen
     katuosoitteen paikalle. Postinumero menee siksi sisäiseen muistioon,
     josta se on kopioitavissa kun oikea osoite kysytään. */
  let fromLead: {
    customerName?: string; email?: string; phone?: string;
    city?: string; notes?: string;
  } | null = null;
  if (liidi && !luonnos && !tyo) {
    const [l] = await sql<{
      full_name: string; email: string | null; phone: string | null;
      postal_code: string | null; city: string | null; message: string | null;
    }[]>`
      select full_name, email, phone, postal_code, city, message
        from tk.leads where id = ${liidi}
    `;
    if (l) {
      fromLead = {
        customerName: l.full_name,
        email: l.email ?? undefined,
        phone: l.phone ?? undefined,
        city: l.city ?? undefined,
        notes: [
          'Tarjous liidistä.',
          l.postal_code ? `Postinumero ${l.postal_code}.` : null,
          l.message ? `Liidin viesti: ${l.message.replace(/\s+/g, ' ').trim()}` : null,
        ].filter(Boolean).join(' '),
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

  if (muokkaa && !edit) {
    return (
      <div className="space-y-6">
        <PageHead title="Muuta tarjousta"
          sub={<Link href="/tarjoukset" className="text-sm text-muted hover:text-text">← Tarjoukset</Link>} />
        <p className="rounded-lg border border-line bg-ink-800 px-3 py-2 text-sm text-muted">
          Tarjousta ei voi muuttaa: sitä ei löytynyt, se on hyväksytty tai siitä on jo tehty työ kalenteriin.{' '}
          <Link href={`/tarjoukset/${muokkaa}`} className="text-accent">Takaisin tarjoukseen</Link>
        </p>
      </div>
    );
  }

  if (edit) {
    return (
      <div className="space-y-6">
        <PageHead
          title={`Muuta tarjousta ${edit.offer_number}`}
          sub={<Link href={`/tarjoukset/${edit.id}`} className="text-sm text-muted hover:text-text">← Tarjous {edit.offer_number}</Link>}
        />
        <p className="rounded-lg border border-line bg-ink-800 px-3 py-2 text-sm text-muted">
          {edit.draft_state
            ? 'Tarjous aukesi sellaisena kuin se viimeksi lähetettiin.'
            : 'Lähetetyn tarjouksen rivit on tuotu vapaina riveinä alkuperäisillä hinnoilla. Muuta määrää tai hintaa suoraan, tai poista rivi ja valitse palvelu laskurista.'}
          {' '}Lähetys korvaa asiakkaan aiemman version: numero pysyy samana ja voimassaolo alkaa alusta.
        </p>
        <OfferBuilder
          kind={edit.kind}
          offerId={edit.id}
          editSent
          draft={editDraft}
          asiakas={{
            customerName: edit.customer_name ?? undefined,
            contactName: edit.contact_name ?? undefined,
            email: edit.email ?? undefined,
            phone: edit.phone ?? undefined,
            address: edit.address ?? undefined,
            city: edit.city ?? undefined,
            notes: edit.notes ?? undefined,
            customerNote: edit.customer_note ?? undefined,
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHead
        title={draft ? `Jatka luonnosta ${draft.offer_number}`
               : fromLead ? `Tarjous liidille ${fromLead.customerName}`
               : 'Uusi asiakastarjous'}
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
        asiakas={fromJob ?? fromLead ?? (draft ? {
          customerName: draft.customer_name ?? undefined,
          contactName: draft.contact_name ?? undefined,
          email: draft.email ?? undefined,
          phone: draft.phone ?? undefined,
          address: draft.address ?? undefined,
          city: draft.city ?? undefined,
          notes: draft.notes ?? undefined,
          customerNote: draft.customer_note ?? undefined,
        } : undefined)}
      />
    </div>
  );
}

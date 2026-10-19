import type { Metadata } from 'next';
import { offerByToken } from '@/lib/kartoitus';
import { OfferView, Shell } from './view';

/* =========================================================
   Tarjouksen hyväksyntä — ASIAKKAAN sivu, ei kirjautumista.

   Avautuu tarjoussähköpostin "Hyväksy tarjous" -napista tai kartoittajan
   puhelimelta paikan päällä (?paikalla=1). Näyttää täsmälleen sen mitä
   hyväksytään: rivit, summan, työhön sisältyvät asiat ja rajaukset.

   Tyylit kirjoitettu auki eikä CRM:n tokeneista: tämä on asiakkaan näkymä
   ja näyttää sivustolta (tiiviskoti.fi), ei hallintapaneelilta.
   ========================================================= */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Tarjouksen hyväksyntä — TiivisKoti',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function AcceptPage({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ paikalla?: string }>;
}) {
  const { token } = await params;
  const { paikalla } = await searchParams;
  const o = await offerByToken(token);

  if (!o) {
    return (
      <Shell>
        <div className="py-16 text-center">
          <h1 className="text-2xl font-extrabold text-[#183A28]">Tarjousta ei löytynyt</h1>
          <p className="mt-3">Tarkista että avasit koko linkin sähköpostista, tai soita meille: 045 7831 1972.</p>
        </div>
      </Shell>
    );
  }

  return <OfferView o={o} token={token} paikalla={!!paikalla} />;
}


import 'server-only';

/* =========================================================
   Toteutuneen kaupan ilmoitus Metalle.

   Meta sai aiemmin tiedon vain verkkovarauksista. Liidimainoksen polulla
   (lomake → tarjous → työ adminissa) se ei kuullut kaupasta koskaan, joten
   se optimoi lomakkeiden määrää eikä myyntiä.

   Lähetys menee sivuston `api/crm-purchase`-päätepisteeseen eikä suoraan
   Metalle: CAPI-tunnus, hashaus ja omien testiosoitteiden suodatus ovat
   siellä yhdessä paikassa (`meta-capi.mjs`). Kaksi toteutusta tarkoittaisi
   kahta paikkaa joissa hashaus voi mennä väärin.

   EI KOSKAAN HEITÄ. Markkinointiseuranta ei saa kaataa työn luontia.
   ========================================================= */

const SITE = process.env.SITE_BASE_URL || 'https://tiiviskoti.fi';

export type MetaSale = {
  /** Työn tunniste — kulkee event_id:nä, jotta uusinta ei tuplaa kauppaa. */
  jobId: string;
  /** Metan liidilomakkeen tunniste (tk.leads.external_id). Ilman tätä ei lähetetä. */
  leadId: string;
  valueCents: number;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  postal?: string | null;
  city?: string | null;
};

export async function reportSaleToMeta(sale: MetaSale): Promise<void> {
  const secret = process.env.BOOKING_SECRET;
  if (!secret || !sale.leadId || !(sale.valueCents > 0)) return;

  try {
    const r = await fetch(`${SITE}/api/crm-purchase`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tk-secret': secret },
      body: JSON.stringify({
        eventId: sale.jobId,
        leadId: sale.leadId,
        valueCents: sale.valueCents,
        email: sale.email ?? undefined,
        phone: sale.phone ?? undefined,
        name: sale.name ?? undefined,
        postal: sale.postal ?? undefined,
        city: sale.city ?? undefined,
      }),
    });
    if (!r.ok) console.error('meta-sale: HTTP', r.status);
  } catch (e) {
    console.error('meta-sale: lähetys epäonnistui:', String(e).slice(0, 200));
  }
}

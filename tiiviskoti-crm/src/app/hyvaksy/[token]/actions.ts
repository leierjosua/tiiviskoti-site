'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { acceptOffer, offerByToken, setConfirmSent } from '@/lib/kartoitus';
import { sendMail, SENDER_EMAIL } from '@/lib/google';
import {
  acceptedCustomerHtml, acceptedCustomerSubject, acceptedCustomerText,
  acceptedOfficeSubject, acceptedOfficeText, type AcceptedData,
} from '@/lib/mail-templates';

export type AcceptState = { error?: string; done?: boolean };

/**
 * Asiakkaan sähköinen hyväksyntä. JULKINEN toiminto — ei kirjautumista,
 * token on ainoa tunniste (ks. lib/kartoitus.ts).
 *
 * Hyväksynnäksi vaaditaan kirjoitettu nimi JA rasti ehdoille. Tallennetaan
 * aika, nimi, IP, selain ja hyväksytyt rivit — se on näyttö jos myöhemmin
 * kiistellään siitä mitä sovittiin.
 */
export async function acceptAction(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const token = String(formData.get('token') ?? '');
  const name = String(formData.get('name') ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || !/\s/.test(name)) return { error: 'Kirjoita etu- ja sukunimesi.' };
  if (name.length > 120) return { error: 'Nimi on liian pitkä.' };
  if (formData.get('terms') !== 'on') return { error: 'Rastita, että hyväksyt tarjouksen ja ehdot.' };

  const h = await headers();
  const res = await acceptOffer(token, name, {
    ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
    ua: (h.get('user-agent') ?? '').slice(0, 300) || null,
    // Hyväksyttiinkö kartoittajan laitteella paikan päällä vai omasta postista.
    via: formData.get('via') === 'paikan-paalla' ? 'paikan-paalla' : 'linkki',
  });
  if (res === 'not_found') return { error: 'Tarjousta ei löytynyt.' };
  if (res === 'closed') {
    revalidatePath(`/hyvaksy/${token}`);
    return { error: 'Tarjousta ei voi enää hyväksyä tällä linkillä (jo hyväksytty tai vanhentunut). Soita 045 7831 1972.' };
  }

  /* Postit hyväksynnän JÄLKEEN eivätkä kaada sitä: hyväksyntä on kannassa,
     ja epäonnistunut posti näkyy vain lokissa. */
  const o = await offerByToken(token);
  if (o) {
    const d: AcceptedData = {
      offerNumber: o.offer_number,
      customerName: o.contact_name || o.customer_name,
      acceptedName: name,
      acceptedAt: o.accepted_at ?? new Date(),
      lines: o.lines.map((l) => ({ name: l.name, qty: l.quantity, unit: l.unit_price_cents / 100, sum: (l.unit_price_cents * l.quantity) / 100 })),
      totalCents: o.total_cents,
      address: [o.address, [o.postal_code, o.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      email: o.email,
    };
    const office = (process.env.LEAD_NOTIFY_TO ?? SENDER_EMAIL).split(',')[0].trim();
    /* Vahvistuspyyntö asiakkaalle: hänen vastauksensa samaan ketjuun
       vahvistaa tarjouksen (lib/kartoitus.ts checkConfirmation). */
    try {
      const sent = await sendMail({ to: o.email, subject: acceptedCustomerSubject(d), html: acceptedCustomerHtml(d), text: acceptedCustomerText(d) });
      await setConfirmSent(o.id, sent.threadId ?? null);
    } catch (e) {
      console.error('vahvistuspyyntö:', e);
    }
    await Promise.allSettled([
      sendMail({ to: office, subject: acceptedOfficeSubject(d), html: `<pre style="font-family:inherit">${acceptedOfficeText(d).replace(/</g, '&lt;')}</pre>`, text: acceptedOfficeText(d) }),
    ]).then((r) => r.forEach((x) => x.status === 'rejected' && console.error('hyväksyntäposti:', x.reason)));
  }

  revalidatePath(`/hyvaksy/${token}`);
  revalidatePath('/tarjoukset');
  revalidatePath('/kartoitus');
  return { done: true };
}

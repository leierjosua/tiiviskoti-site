import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/session';
import { PageHead } from '@/components/ui';
import { acceptUrl, getKartoitus } from '@/lib/kartoitus';
import { formatInstant } from '@/lib/time';
import { signPhotoPaths } from '@/lib/photos';
import { KartoitusForm } from '../form';
import { ConfirmBox } from '../confirm-box';

export const dynamic = 'force-dynamic';

/* Varaus kartoituksessa valitulle asentajalle ja ajalle. Kesto pyöristetään
   ylös varauslomakkeen kestovaihtoehtoihin. */
function varausLinkki(offerId: string, calendarId: string, alku: string, kestoH?: string): string {
  const h = Number(String(kestoH ?? '').replace(',', '.'));
  const kesto = [60, 90, 120, 180, 240, 300].find((d) => d >= h * 60) ?? (h > 0 ? 300 : undefined);
  const q = new URLSearchParams({ tarjous: offerId, kalenteri: calendarId, alku });
  if (kesto) q.set('kesto', String(kesto));
  return `/tyot/uusi?${q}`;
}

const eur = (c: number) => (c / 100).toLocaleString('fi-FI', { maximumFractionDigits: 2 }) + ' €';

/* Kartoitus: tila ylhäällä, lomake alla. Lähetyksen jälkeen iso nappi
   avaa hyväksyntäsivun TÄLLÄ laitteella, jotta asiakas voi hyväksyä
   tarjouksen heti kartoittajan puhelimella. */
export default async function KartoitusDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lahetetty?: string; postivirhe?: string; tallennettu?: string }>;
}) {
  const staff = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const k = await getKartoitus(id, staff);
  if (!k) notFound();

  const photoUrls = await signPhotoPaths([
    ...Object.values(k.data.photos ?? {}), ...(k.data.extraPhotos ?? []),
  ]);
  const link = k.accept_token ? acceptUrl(k.accept_token) : null;
  const accepted = !!k.accepted_at;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/kartoitus" className="text-xs text-muted hover:text-text">← Kartoitus</Link>
      <PageHead
        title={k.data.customerName || 'Kartoitus'}
        sub={`${formatInstant(k.created_at)}${k.staff_name ? ` · ${k.staff_name}` : ''}${k.offer_number ? ` · tarjous ${k.offer_number}` : ''}`}
        action={k.offer_id ? <Link href={`/tarjoukset/${k.offer_id}`} className="rounded-xl border border-line px-3.5 py-2.5 text-sm font-bold text-text">Tarjous CRM:ssä</Link> : undefined}
      />

      {sp.tallennettu && !k.offer_id && <p className="rounded-xl bg-accent-dim px-4 py-3 text-sm font-semibold text-accent">Kartoitus tallennettu. Voit jatkaa ja lähettää tarjouksen kun olet valmis.</p>}
      {sp.postivirhe && <p className="rounded-xl bg-[#FDECEA] px-4 py-3 text-sm font-semibold text-danger">Tarjous luotiin, mutta sähköposti ei lähtenyt: {sp.postivirhe}. Asiakas voi silti hyväksyä alla olevasta napista.</p>}

      {accepted ? (
        <div className="rounded-2xl bg-[#163A28] p-5 text-[#EAF2EC]">
          <p className="text-lg font-extrabold text-white">✓ Asiakas hyväksyi tarjouksen</p>
          <p className="mt-1 text-sm">{formatInstant(k.accepted_at!)} · {k.accepted_name} · {k.offer_total_cents ? eur(k.offer_total_cents) : ''}</p>
          {k.offer_id && <ConfirmBox offerId={k.offer_id} back={`/kartoitus/${k.id}`} />}
          {k.offer_id && k.data.ehdotettuAlku && k.data.ehdotettuKalenteri && staff.role !== 'installer' ? (
            <a href={varausLinkki(k.offer_id, k.data.ehdotettuKalenteri, k.data.ehdotettuAlku, k.data.kestoH)}
               className="mt-4 flex min-h-14 items-center justify-center rounded-[14px] bg-white px-5 text-[18px] font-bold text-[#163A28]">
              Varaa tämä aika: {k.data.ehdotettuAika ?? formatInstant(new Date(k.data.ehdotettuAlku))} →
            </a>
          ) : (
            <p className="mt-2 text-sm">Seuraavaksi: sovi asennusaika ja tee työ tarjoukselta (Tarjous CRM:ssä → Laita aika).</p>
          )}
        </div>
      ) : link ? (
        <div className="rounded-2xl border-2 border-accent bg-white p-5">
          <p className="text-lg font-extrabold text-text">{sp.lahetetty ? 'Tarjous lähetetty asiakkaalle' : 'Tarjous odottaa hyväksyntää'}</p>
          <p className="mt-1 text-sm text-muted">
            {k.offer_number} · {k.offer_total_cents ? eur(k.offer_total_cents) : ''}{k.sent_at ? ` · lähetetty ${formatInstant(k.sent_at)}` : ''}.
            Asiakas voi hyväksyä sähköpostin linkistä tai heti tällä puhelimella.
          </p>
          <a href={`${link}?paikalla=1`} className="mt-4 block rounded-xl bg-accent px-5 py-4 text-center text-base font-extrabold text-white">
            Anna asiakkaan hyväksyä nyt →
          </a>
          <p className="mt-2 text-center text-xs text-faint break-all">{link}</p>
        </div>
      ) : k.offer_id ? (
        <p className="rounded-xl bg-[#FFF4E0] px-4 py-3 text-sm font-semibold text-warn">Hyväksyntälinkki puuttuu — aja db/038 Supabasessa.</p>
      ) : null}

      <KartoitusForm id={k.id} initial={k.data} locked={accepted} photoUrls={photoUrls} />
    </div>
  );
}

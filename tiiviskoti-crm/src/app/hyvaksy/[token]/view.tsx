import { BrandMark } from '@/components/brand';
import type { PublicOffer } from '@/lib/kartoitus';
import { AcceptForm } from './form';

/* Hyväksyntäsivun näkymä ilman kantahakua (page.tsx hakee tarjouksen). */

const eur = (c: number) =>
  (c / 100).toLocaleString('fi-FI', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
const fiDate = (d: Date) =>
  new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', year: 'numeric' }).format(d);
const fiDateTime = (d: Date) =>
  new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#F6F7F3] pb-16 text-[#4A544D]">
      <header className="mx-auto flex max-w-[680px] items-center justify-between px-4 py-5">
        <a href="https://tiiviskoti.fi" className="flex items-center gap-2.5">
          <BrandMark size={30} tone="light" />
          <span className="text-xl font-extrabold tracking-tight text-[#183A28]">Tiivis<span className="text-[#217A4E]">Koti</span></span>
        </a>
        <a href="tel:+3584578311972" className="rounded-full bg-[#E4F0E9] px-3.5 py-2 text-sm font-bold text-[#217A4E]">045 7831 1972</a>
      </header>
      <div className="mx-auto max-w-[680px] px-4">{children}</div>
    </main>
  );
}

/** Tarjouksen näkymä ilman hakua — erillään, jotta sen voi esikatsella ilman kantaa. */
export function OfferView({ o, token, paikalla }: { o: PublicOffer; token: string; paikalla: boolean }) {
  const expired = o.valid_until && o.valid_until.getTime() < Date.now() - 24 * 3600_000;
  const open = !o.accepted_at && (o.status === 'sent' || o.status === 'draft') && !expired;
  const place = [o.address, [o.postal_code, o.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const incl = (o.inclusions ?? []).filter((i) => i.trim());
  const rajaukset = incl.filter((i) => /^ei sisällä/i.test(i));
  const sisaltyy = incl.filter((i) => !/^ei sisällä/i.test(i));

  return (
    <Shell>
      <p className="text-[15px] font-bold tracking-[.12em] text-[#217A4E] uppercase">Tarjous {o.offer_number}</p>
      <h1 className="mt-2 text-[30px] leading-tight font-extrabold tracking-tight text-[#183A28]">
        {o.accepted_at ? (o.confirmed_at ? 'Tarjous on vahvistettu' : 'Tarjous on hyväksytty') : 'Tarkista ja hyväksy tarjous'}
      </h1>
      <p className="mt-2 text-[15.5px]">
        {o.contact_name ? `${o.customer_name} — ${o.contact_name}` : o.customer_name}
        {place && <><br />{place}</>}
      </p>

      <section className="mt-6 rounded-2xl border border-[#E4E8E0] bg-white p-5 shadow-[0_18px_40px_-26px_rgba(24,58,40,.32)]">
        <h2 className="text-lg font-extrabold text-[#183A28]">Tarjotut työt</h2>
        <ul className="mt-3 divide-y divide-[#E4E8E0]">
          {o.lines.map((l, i) => (
            <li key={i} className="flex items-baseline gap-3 py-2.5 text-[15px]">
              <span className="flex-1 text-[#183A28]">{l.quantity > 1 && <b>{l.quantity}× </b>}{l.name}</span>
              <span className="font-bold whitespace-nowrap text-[#183A28] tabular-nums">{eur(l.unit_price_cents * l.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-baseline justify-between border-t-2 border-[#183A28] pt-3">
          <span className="text-lg font-extrabold text-[#183A28]">Yhteensä</span>
          <span className="text-2xl font-extrabold text-[#217A4E] tabular-nums">{eur(o.total_cents)}</span>
        </div>
        <p className="mt-1 text-[15px] text-[#7B857D]">
          Sisältää ALV 25,5 %. Työn osuudesta voi hakea kotitalousvähennystä.
          {o.valid_until && !o.accepted_at && <> Voimassa {fiDate(o.valid_until)} asti.</>}
        </p>
      </section>

      {sisaltyy.length > 0 && (
        <section className="mt-4 rounded-2xl bg-[#ECF0E9] p-5">
          <h2 className="text-base font-extrabold text-[#183A28]">Työhön sisältyy</h2>
          <ul className="mt-2 space-y-1.5 text-[14.5px]">
            {sisaltyy.map((i) => (
              <li key={i} className="flex gap-2"><span className="text-[#217A4E]">✓</span><span>{i}</span></li>
            ))}
          </ul>
          {rajaukset.map((r) => (
            <p key={r} className="mt-3 rounded-xl bg-white px-3.5 py-2.5 text-[16px] font-semibold text-[#183A28]">{r}</p>
          ))}
        </section>
      )}

      {o.customer_note && (
        <section className="mt-4 rounded-2xl border border-[#E4E8E0] bg-white p-5">
          <h2 className="text-base font-extrabold text-[#183A28]">Kartoituksen tiedot</h2>
          <p className="mt-2 text-[14.5px] leading-relaxed whitespace-pre-line">{o.customer_note}</p>
        </section>
      )}

      <section className="mt-6">
        {o.accepted_at ? (
          <div className="rounded-2xl bg-[#163A28] p-6 text-[#EAF2EC]">
            <p className="text-lg font-extrabold text-white">Hyväksytty {fiDateTime(o.accepted_at)}</p>
            <p className="mt-1 text-sm">Hyväksyjä: {o.accepted_name}.</p>
            {o.confirmed_at ? (
              <p className="mt-2 text-sm">Vahvistettu sähköpostilla. Otamme yhteyttä asennusajan sopimiseksi.</p>
            ) : (
              <p className="mt-2 text-[15px]">
                <b className="text-white">Vielä yksi vaihe:</b> vahvista tarjous vastaamalla sähköpostiin, jonka lähetimme
                osoitteeseen {o.email}.
              </p>
            )}
          </div>
        ) : open ? (
          <AcceptForm token={token} offerNumber={o.offer_number} totalText={eur(o.total_cents)} via={paikalla ? 'paikan-paalla' : 'linkki'} />
        ) : (
          <div className="rounded-2xl border border-[#E4E8E0] bg-white p-6 text-center">
            <p className="text-lg font-extrabold text-[#183A28]">Tarjous ei ole enää voimassa</p>
            <p className="mt-2 text-sm">Soita 045 7831 1972, niin päivitämme tarjouksen.</p>
          </div>
        )}
      </section>

      <p className="mt-8 text-center text-xs text-[#7B857D]">
        TiivisKoti · Y-tunnus 3652671-7 · Järvipuistonkatu 5, 04400 Järvenpää · info@tiiviskoti.fi
      </p>
    </Shell>
  );
}

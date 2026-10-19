import { checkConfirmation } from '@/lib/kartoitus';
import { formatInstant } from '@/lib/time';
import { confirmOfferManually } from './confirm-action';

/* Sähköpostivahvistuksen tila hyväksytylle tarjoukselle. Tarkistaa Gmail-
   ketjun joka latauksella (yksi pyyntö), joten tila päivittyy kun sivu
   avataan. Käsinmerkintä varalle. */
export async function ConfirmBox({ offerId, back }: { offerId: string; back: string }) {
  const c = await checkConfirmation(offerId);
  if (c.confirmedAt) {
    return (
      <p className="mt-2 rounded-xl bg-white/10 px-3 py-2 text-sm text-white">
        ✓ Vahvistettu sähköpostilla {formatInstant(new Date(c.confirmedAt))}
        {c.manualBy ? ` (merkitsi ${c.manualBy})` : c.from ? ` · ${c.from}` : ''}
        {c.snippet ? <span className="block text-xs opacity-80">&rdquo;{c.snippet}&rdquo;</span> : null}
      </p>
    );
  }
  return (
    <div className="mt-3 rounded-xl bg-[#FFF4E0] px-3.5 py-3 text-sm text-[#8A5A0C]">
      <b>Odottaa sähköpostivahvistusta.</b>{' '}
      {c.sentAt ? `Pyyntö lähti ${formatInstant(new Date(c.sentAt))}. ` : 'Vahvistuspyyntö ei lähtenyt. '}
      Tila päivittyy kun asiakas vastaa viestiin.
      {c.error && <span className="block text-xs">Postilaatikkoa ei voitu lukea: {c.error.slice(0, 120)}</span>}
      <form action={confirmOfferManually} className="mt-2">
        <input type="hidden" name="offerId" value={offerId} />
        <input type="hidden" name="back" value={back} />
        <button className="rounded-lg border border-[#8A5A0C]/40 bg-white px-3 py-1.5 text-xs font-bold text-[#8A5A0C]">
          Merkitse vahvistetuksi käsin
        </button>
      </form>
    </div>
  );
}

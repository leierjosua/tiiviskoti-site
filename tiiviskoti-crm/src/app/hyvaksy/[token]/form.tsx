'use client';

import { startTransition, useActionState, useState } from 'react';
import { acceptAction, type AcceptState } from './actions';

/* Hyväksyntälomake. Nappi on iso ja nimi kirjoitetaan itse: kirjoitettu
   nimi + rasti on sähköinen allekirjoitus, ja sen on oltava tietoinen teko
   eikä vahinkonapautus. */
export function AcceptForm({ token, offerNumber, totalText, via }: {
  token: string; offerNumber: string; totalText: string; via: string;
}) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(acceptAction, {});
  /* Lähetys onSubmitilla eikä <form action>illa: React tyhjentää action-
     lomakkeen jokaisen kutsun jälkeen (myös ohjatut kentät DOMissa), ja
     virheilmoituksen kohdalla asiakkaan nimi ja rasti katosivat. */
  const [name, setName] = useState('');
  const [terms, setTerms] = useState(false);

  if (state.done) {
    return (
      <div className="rounded-2xl bg-[#163A28] p-6 text-center text-[#EAF2EC]">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-[#2E9E63]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#06231a" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <p className="text-xl font-extrabold text-white">Tarjous hyväksytty</p>
        <p className="mt-2 text-sm leading-relaxed">Kiitos! Kuittaus on matkalla sähköpostiisi, ja otamme yhteyttä asennusajan sopimiseksi.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }}
      className="space-y-4"
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="via" value={via} />
      <label className="block">
        <span className="text-sm font-bold text-[#183A28]">Etu- ja sukunimi</span>
        <input
          name="name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Matti Meikäläinen"
          className="mt-1.5 block w-full rounded-xl border-[1.5px] border-[#D2D9CE] bg-white px-4 py-3.5 text-[17px] text-[#183A28]
                     outline-none focus:border-[#217A4E]"
        />
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-[#ECF0E9] p-4">
        <input name="terms" type="checkbox" required checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#217A4E]" />
        <span className="text-[15px] leading-snug text-[#183A28]">
          Hyväksyn tarjouksen <b>{offerNumber}</b> ({totalText}) ja sen sisällön sekä TiivisKodin{' '}
          <a href="https://tiiviskoti.fi/kayttoehdot.html" target="_blank" rel="noreferrer" className="font-bold text-[#217A4E] underline">käyttöehdot</a>.
        </span>
      </label>
      {state.error && <p className="rounded-xl bg-[#FDECEA] px-4 py-3 text-sm font-semibold text-[#9B2C1F]">{state.error}</p>}
      <button
        type="submit" disabled={pending}
        className="w-full rounded-xl bg-[#217A4E] px-6 py-4 text-[17px] font-extrabold text-white transition hover:bg-[#1A6340] disabled:opacity-60"
      >
        {pending ? 'Hyväksytään…' : 'Hyväksyn tarjouksen'}
      </button>
    </form>
  );
}

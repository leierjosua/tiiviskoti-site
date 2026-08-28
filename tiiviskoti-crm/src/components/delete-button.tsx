'use client';

import { useState } from 'react';
import { SubmitButton } from '@/components/submit';
import { cx } from '@/components/ui';

/* =========================================================
   Kaksivaiheinen poistonappi listariveille.

   MIKSI KAKSI KLIKKAUSTA: poisto on peruuttamaton, ja listassa rivit ovat
   lähekkäin — yksi harhaklikkaus veisi oikean tarjouksen tai liidin.
   Ensimmäinen klikkaus vain paljastaa vahvistuksen, joten vahinko vaatii
   kaksi tietoista klikkausta.

   MIKSI EI confirm(): selaimen modaali pysäyttää koko välilehden ja näyttää
   osoitteen "tiiviskoti.fi sanoo", mikä ei kerro mitä ollaan poistamassa.
   Tässä vahvistuksessa lukee kohteen nimi.
   ========================================================= */

export function DeleteButton({
  id, action, nimi, className,
}: {
  id: string;
  /** Palvelintoiminto, joka lukee kentän `id`. */
  action: (formData: FormData) => void | Promise<void>;
  /** Näytetään vahvistuksessa, jotta poistaja näkee mitä on poistamassa. */
  nimi: string;
  className?: string;
}) {
  const [vahvistetaan, setVahvistetaan] = useState(false);

  if (!vahvistetaan) {
    return (
      <button
        type="button"
        onClick={() => setVahvistetaan(true)}
        className={cx('rounded border border-line px-2 py-1 text-xs text-muted hover:text-danger hover:border-danger', className)}
        aria-label={`Poista ${nimi}`}
      >
        Poista
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-1.5 whitespace-nowrap">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="danger" className="text-xs" pendingLabel="Poistetaan…">
        Poista {nimi}
      </SubmitButton>
      <button
        type="button"
        onClick={() => setVahvistetaan(false)}
        className="rounded border border-line px-2 py-1 text-xs text-muted hover:text-text"
      >
        Peru
      </button>
    </form>
  );
}

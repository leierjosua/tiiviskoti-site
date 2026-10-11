'use client';

import { useFormStatus } from 'react-dom';
import type { ComponentProps } from 'react';

/* Sivun pienet napit lataustilalla.

   Yhteinen `SubmitButton` tuo mukanaan Buttonin koon ja värit, ja tämän
   sivun napit ovat tarkoituksella pienempiä (rivissä on kolme vierekkäin
   puhelimen leveydellä). Siksi oma kääre: sama `useFormStatus`-palaute,
   mutta ulkoasu tulee kutsujalta.

   Ilman tätä napin painaminen ei näyttänyt mitään ennen kuin palvelin
   vastasi ja koko kahdeksan viikon sivu piirtyi uudelleen — puhelimessa
   sekunnin tai pari, ja asentaja painoi uudelleen. */
export function OdottavaNappi({ children, className, ...props }: ComponentProps<'button'>) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      type="submit"
      disabled={pending || props.disabled}
      aria-busy={pending}
      className={`${className ?? ''} inline-flex items-center gap-1.5 disabled:opacity-60 ${pending ? 'cursor-progress' : ''}`}
    >
      {pending && (
        <span
          aria-hidden
          className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

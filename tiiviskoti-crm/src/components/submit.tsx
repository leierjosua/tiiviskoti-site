'use client';

import { useFormStatus } from 'react-dom';
import { Button, cx } from './ui';
import type { ComponentProps } from 'react';

/* Lähetysnappi joka tietää oman lomakkeensa tilan.

   `useFormStatus` toimii vain lomakkeen SISÄLLÄ olevassa komponentissa,
   siksi tämä on erillinen tiedosto eikä osa ui.tsx:ää.

   Miksi tätä tarvitaan: Server Action -lomakkeen painaminen ei näytä mitään
   ennen kuin palvelin vastaa ja sivu revalidoituu. Käyttäjä painaa uudelleen
   koska "nappi ei reagoinut" — ja tekee saman toiminnon kahdesti. Nappi
   näyttää nyt lataustilan ja estyy itsestään sen ajaksi. */

export function SubmitButton({
  children,
  pendingLabel,
  className,
  variant = 'primary',
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      {...props}
      type="submit"
      variant={variant}
      disabled={pending || props.disabled}
      aria-busy={pending}
      className={cx(pending && 'cursor-progress', className)}
    >
      {pending && (
        <span
          aria-hidden
          className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
        />
      )}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}

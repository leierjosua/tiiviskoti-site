'use client';

import { useRouter } from 'next/navigation';
import { startTransition } from 'react';
import { Button } from '@/components/ui';

/* Sivun lataus epäonnistui tai jumittui (ks. lib/timing.ts). Ennen tätä
   näkyi joko Nextin geneerinen virhe tai loputon latausnäkymä. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Sivu ei latautunut</h1>
      <p className="text-muted">Yhteys palvelimeen katkesi kesken. Yritä uudelleen — yleensä toinen yritys onnistuu heti.</p>
      <Button type="button" onClick={() => startTransition(() => { router.refresh(); reset(); })}>
        Yritä uudelleen
      </Button>
    </div>
  );
}

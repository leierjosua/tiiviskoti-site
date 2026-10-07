'use client';

import { useActionState } from 'react';
import { Button, Card, CardHeader, ErrorNote, OkNote } from '@/components/ui';
import { linkOwnGoogleCalendar, type OwnCalendarState } from './google-kalenteri';

/* Asennusnäkymän kortti: keikat omaan Google-kalenteriin. */
export function GoogleKalenteriKortti({ linked, hasCalendar }: { linked: boolean; hasCalendar: boolean }) {
  const [state, action, pending] = useActionState<OwnCalendarState, FormData>(
    () => linkOwnGoogleCalendar(), {},
  );
  if (!hasCalendar) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Keikat Google-kalenteriin" />
      <form action={action} className="space-y-3 p-4">
        <p className="text-sm text-muted">
          {linked
            ? '✓ Keikkasi tulevat omaan "TiivisKoti"-kalenteriisi Googlessa ja päivittyvät itsestään. Jos kalenteri ei näy, lähetä linkki uudelleen.'
            : 'Saat kaikki keikkasi omaksi "TiivisKoti"-kalenteriksi puhelimesi Google-kalenteriin. Ajat ja osoitteet päivittyvät itsestään.'}
        </p>
        <ErrorNote>{state.error}</ErrorNote>
        <OkNote>{state.ok}</OkNote>
        <Button type="submit" variant={linked ? 'outline' : undefined} disabled={pending}>
          {pending ? 'Lähetetään…' : linked ? 'Lähetä linkki uudelleen' : 'Lisää Google-kalenteriin'}
        </Button>
      </form>
    </Card>
  );
}

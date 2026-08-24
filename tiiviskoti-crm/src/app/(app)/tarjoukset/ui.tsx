'use client';

import { useActionState } from 'react';
import { Button, ErrorNote, OkNote, cx } from '@/components/ui';
import { SubmitButton } from '@/components/submit';
import { sendSavedOffer, setOfferStatus, type ActionState } from './actions';

export const OFFER_STATUS: Record<string, string> = {
  draft: 'Luonnos',
  sent: 'Lähetetty',
  accepted: 'Hyväksytty',
  declined: 'Hylätty',
  expired: 'Vanhentunut',
};

const CHIP: Record<string, string> = {
  draft: 'border-line bg-ink-700 text-muted',
  sent: 'border-info/35 bg-info/12 text-info',
  accepted: 'border-accent/35 bg-accent-dim text-accent',
  declined: 'border-line bg-ink-700 text-muted line-through',
  expired: 'border-line bg-ink-700 text-muted',
  error: 'border-danger/35 bg-danger/12 text-danger',
};

export function OfferStatusChip({ status, label }: { status: string; label: string }) {
  return (
    <span className={cx(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold whitespace-nowrap',
      CHIP[status] ?? CHIP.sent,
    )}>
      {label}
    </span>
  );
}

const OPTIONS = [
  { value: 'accepted', label: 'Hyväksytty' },
  { value: 'declined', label: 'Hylätty' },
  { value: 'expired', label: 'Vanhentunut' },
  { value: 'sent', label: 'Lähetetty' },
] as const;

export function OfferStatusButtons({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState<ActionState, FormData>(setOfferStatus, {});
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <form key={o.value} action={action}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value={o.value} />
            <Button variant="outline" disabled={status === o.value}
              className={cx('text-xs', status === o.value && 'border-accent text-accent')}>
              {o.label}
            </Button>
          </form>
        ))}
      </div>
      {state.error && <ErrorNote>{state.error}</ErrorNote>}
      {state.ok && <OkNote>{state.ok}</OkNote>}
    </div>
  );
}

/* Luonnoksen lähetys. Oma komponentti eikä osa OfferStatusButtonsia: tilan
   vaihtaminen käsin ja tarjouksen oikea lähettäminen ovat eri asioita, ja
   vierekkäin ne sekoittuisivat — "Lähetetty"-nappi ei lähetä mitään. */
export function SendDraftButton({ id, email }: { id: string; email: string | null }) {
  const [state, action] = useActionState<ActionState, FormData>(sendSavedOffer, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="w-full" pendingLabel="Lähetetään…" disabled={!email}>
        Lähetä asiakkaalle sähköpostilla
      </SubmitButton>
      {email
        ? <p className="text-xs text-faint">Menee osoitteeseen {email}. PDF liitteenä.</p>
        : <p className="text-xs text-faint">Tarjouksella ei ole sähköpostiosoitetta.</p>}
      {state.error && <ErrorNote>{state.error}</ErrorNote>}
      {state.ok && <OkNote>{state.ok}</OkNote>}
    </form>
  );
}

import Link from 'next/link';
import { requireManager } from '@/lib/session';
import { PageHead } from '@/components/ui';
import { OfferBuilder } from './ui';

export default async function NewOfferPage() {
  await requireManager();
  return (
    <div className="space-y-6">
      <PageHead
        title="Uusi asiakastarjous"
        sub={<Link href="/tarjoukset" className="text-sm text-muted hover:text-text">← Tarjoukset</Link>}
      />
      <OfferBuilder />
    </div>
  );
}

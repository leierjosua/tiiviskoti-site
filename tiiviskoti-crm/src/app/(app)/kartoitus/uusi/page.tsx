import Link from 'next/link';
import { requireStaff, ownsJob } from '@/lib/session';
import { getJob } from '@/lib/data';
import { PageHead } from '@/components/ui';
import { KartoitusForm, type KartoitusInitial } from '../form';

export const dynamic = 'force-dynamic';

/* Uusi kartoitus. ?tyo=<id> täyttää asiakastiedot kalenterin
   kartoituskäynniltä, jottei niitä kirjoiteta eteisessä uudelleen. */
export default async function UusiKartoitus({ searchParams }: { searchParams: Promise<{ tyo?: string }> }) {
  const staff = await requireStaff();
  const { tyo } = await searchParams;
  let initial: KartoitusInitial = {};
  let jobId: string | undefined;
  if (tyo && /^[0-9a-f-]{36}$/i.test(tyo) && (await ownsJob(staff, tyo))) {
    const job = await getJob(tyo);
    if (job) {
      jobId = job.id;
      initial = {
        customerName: job.customer_name ?? '',
        email: job.customer_email ?? '',
        phone: job.customer_phone ?? undefined,
        address: job.address ?? undefined,
        postalCode: job.postal_code ?? '',
        city: job.city ?? undefined,
      };
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/kartoitus" className="text-xs text-muted hover:text-text">← Kartoitus</Link>
      <PageHead title="Uusi kartoitus" />
      <KartoitusForm jobId={jobId} initial={initial} />
    </div>
  );
}
